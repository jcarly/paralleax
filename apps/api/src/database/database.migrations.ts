export interface DatabaseMigration {
  id: string;
  sql: string;
}

export const databaseMigrations: DatabaseMigration[] = [
  {
    id: '202607170001_create_stories',
    sql: `
      CREATE TABLE stories (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `,
  },
  {
    id: '202607180002_require_story_fields',
    sql: `
      UPDATE stories AS story
      SET data = jsonb_set(
        jsonb_set(
          story.data,
          '{title}',
          CASE
            WHEN jsonb_typeof(story.data->'title') = 'string' THEN story.data->'title'
            ELSE to_jsonb('Untitled'::text)
          END
        ),
        '{interactions}',
        COALESCE(
          (
            SELECT jsonb_agg(
              interaction || jsonb_build_object(
                'title', CASE
                  WHEN jsonb_typeof(interaction->'title') = 'string' THEN interaction->'title'
                  ELSE to_jsonb('Untitled interaction'::text)
                END,
                'body', CASE
                  WHEN jsonb_typeof(interaction->'body') = 'string' THEN interaction->'body'
                  ELSE to_jsonb(''::text)
                END,
                'position', CASE
                  WHEN jsonb_typeof(interaction->'position'->'x') = 'number'
                    AND jsonb_typeof(interaction->'position'->'y') = 'number'
                  THEN interaction->'position'
                  ELSE jsonb_build_object('x', 80, 'y', 120 + (ordinality - 1) * 132)
                END
              )
              ORDER BY ordinality
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(story.data->'interactions') = 'array'
                THEN story.data->'interactions'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS entries(interaction, ordinality)
          ),
          '[]'::jsonb
        )
      );

      ALTER TABLE stories
      ADD CONSTRAINT stories_required_fields
      CHECK (
        jsonb_typeof(data->'title') = 'string'
        AND jsonb_typeof(data->'interactions') = 'array'
        AND jsonb_array_length(
          jsonb_path_query_array(
            data,
            '$.interactions[*] ? (@.title.type() == "string" && @.body.type() == "string" && @.position.x.type() == "number" && @.position.y.type() == "number")'
          )
        ) = jsonb_array_length(data->'interactions')
      )
    `,
  },
  {
    id: '202607180003_users_and_story_ownership',
    sql: `
      CREATE TABLE users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL
      );

      CREATE TABLE sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL
      );

      INSERT INTO users (id, email, password_hash, created_at)
      VALUES ('migration-user', 'migration@paralleax.invalid', 'disabled', now());

      ALTER TABLE stories
      ADD COLUMN creator_user_id text REFERENCES users(id);

      UPDATE stories SET creator_user_id = 'migration-user';

      ALTER TABLE stories
      ALTER COLUMN creator_user_id SET NOT NULL;

      CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
      CREATE INDEX stories_creator_user_id_idx ON stories(creator_user_id);
    `,
  },
  {
    id: '202607180004_session_expiry_index',
    sql: `
      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
    `,
  },
  {
    id: '202607180005_normalize_story_model',
    sql: `
      ALTER TABLE stories
      ADD COLUMN title text;

      UPDATE stories
      SET title = COALESCE(NULLIF(data->>'title', ''), 'Untitled');

      ALTER TABLE stories
      ALTER COLUMN title SET NOT NULL;

      CREATE TABLE interactions (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        title text NOT NULL,
        body text NOT NULL,
        position_x double precision NOT NULL,
        position_y double precision NOT NULL,
        sort_order integer NOT NULL
      );

      CREATE TABLE triggers (
        id text PRIMARY KEY,
        output_interaction_id text NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
        sort_order integer NOT NULL
      );

      CREATE TABLE trigger_inputs (
        trigger_id text NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
        input_interaction_id text NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
        sort_order integer NOT NULL,
        PRIMARY KEY (trigger_id, input_interaction_id)
      );

      CREATE TABLE trigger_conditions (
        trigger_id text NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
        sort_order integer NOT NULL,
        interaction_id text NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
        has_been_visited boolean NOT NULL,
        PRIMARY KEY (trigger_id, sort_order)
      );

      INSERT INTO interactions
        (id, story_id, title, body, position_x, position_y, sort_order)
      SELECT
        interaction->>'id',
        story.id,
        interaction->>'title',
        interaction->>'body',
        (interaction->'position'->>'x')::double precision,
        (interaction->'position'->>'y')::double precision,
        interaction_entry.ordinality - 1
      FROM stories AS story
      CROSS JOIN LATERAL jsonb_array_elements(story.data->'interactions')
        WITH ORDINALITY AS interaction_entry(interaction, ordinality);

      INSERT INTO triggers (id, output_interaction_id, sort_order)
      SELECT
        trigger->>'id',
        interaction->>'id',
        trigger_entry.ordinality - 1
      FROM stories AS story
      CROSS JOIN LATERAL jsonb_array_elements(story.data->'interactions')
        AS interaction_entry(interaction)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(interaction->'triggers') = 'array'
          THEN interaction->'triggers'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS trigger_entry(trigger, ordinality)
      WHERE jsonb_typeof(trigger->'id') = 'string';

      INSERT INTO trigger_inputs
        (trigger_id, input_interaction_id, sort_order)
      SELECT
        trigger->>'id',
        input_entry.input_interaction_id,
        input_entry.ordinality - 1
      FROM stories AS story
      CROSS JOIN LATERAL jsonb_array_elements(story.data->'interactions')
        AS interaction_entry(interaction)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(interaction->'triggers') = 'array'
          THEN interaction->'triggers'
          ELSE '[]'::jsonb
        END
      ) AS trigger_entry(trigger)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(trigger->'inputInteractionIds') = 'array'
          THEN trigger->'inputInteractionIds'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS input_entry(input_interaction_id, ordinality)
      ON CONFLICT (trigger_id, input_interaction_id) DO NOTHING;

      INSERT INTO trigger_conditions
        (trigger_id, sort_order, interaction_id, has_been_visited)
      SELECT
        trigger->>'id',
        condition_entry.ordinality - 1,
        condition->>'interactionId',
        (condition->>'hasBeenVisited')::boolean
      FROM stories AS story
      CROSS JOIN LATERAL jsonb_array_elements(story.data->'interactions')
        AS interaction_entry(interaction)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(interaction->'triggers') = 'array'
          THEN interaction->'triggers'
          ELSE '[]'::jsonb
        END
      ) AS trigger_entry(trigger)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(trigger->'conditions') = 'array'
          THEN trigger->'conditions'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS condition_entry(condition, ordinality)
      WHERE jsonb_typeof(condition->'interactionId') = 'string'
        AND jsonb_typeof(condition->'hasBeenVisited') = 'boolean';

      ALTER TABLE stories DROP COLUMN data;

      CREATE INDEX interactions_story_id_idx ON interactions(story_id);
      CREATE INDEX triggers_output_interaction_id_idx ON triggers(output_interaction_id);
      CREATE INDEX trigger_inputs_input_interaction_id_idx
        ON trigger_inputs(input_interaction_id);
      CREATE INDEX trigger_conditions_interaction_id_idx
        ON trigger_conditions(interaction_id);
    `,
  },
  {
    id: '202607180006_harden_story_graph',
    sql: `
      ALTER TABLE stories ADD COLUMN revision integer NOT NULL DEFAULT 1;

      ALTER TABLE interactions
      ADD CONSTRAINT interactions_story_id_id_unique UNIQUE (story_id, id);

      ALTER TABLE triggers
      DROP CONSTRAINT triggers_output_interaction_id_fkey,
      ADD COLUMN story_id text,
      ADD COLUMN conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT triggers_conditions_array CHECK (jsonb_typeof(conditions) = 'array');

      UPDATE triggers AS trigger
      SET story_id = interaction.story_id
      FROM interactions AS interaction
      WHERE interaction.id = trigger.output_interaction_id;

      UPDATE triggers AS trigger
      SET conditions = COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'interactionId', condition.interaction_id,
              'hasBeenVisited', condition.has_been_visited
            )
            ORDER BY condition.sort_order
          )
          FROM trigger_conditions AS condition
          WHERE condition.trigger_id = trigger.id
        ),
        '[]'::jsonb
      );

      DROP TABLE trigger_conditions;

      ALTER TABLE triggers
      ALTER COLUMN story_id SET NOT NULL,
      ADD CONSTRAINT triggers_story_id_id_unique UNIQUE (story_id, id),
      ADD CONSTRAINT triggers_output_interaction_fkey
        FOREIGN KEY (story_id, output_interaction_id)
        REFERENCES interactions(story_id, id) ON DELETE CASCADE;

      ALTER TABLE trigger_inputs
      DROP CONSTRAINT trigger_inputs_trigger_id_fkey,
      DROP CONSTRAINT trigger_inputs_input_interaction_id_fkey,
      ADD COLUMN story_id text;

      UPDATE trigger_inputs AS input
      SET story_id = trigger.story_id
      FROM triggers AS trigger
      WHERE trigger.id = input.trigger_id;

      ALTER TABLE trigger_inputs
      ALTER COLUMN story_id SET NOT NULL,
      ADD CONSTRAINT trigger_inputs_trigger_fkey
        FOREIGN KEY (story_id, trigger_id)
        REFERENCES triggers(story_id, id) ON DELETE CASCADE,
      ADD CONSTRAINT trigger_inputs_interaction_fkey
        FOREIGN KEY (story_id, input_interaction_id)
        REFERENCES interactions(story_id, id) ON DELETE CASCADE;

      CREATE INDEX triggers_story_id_idx ON triggers(story_id);
      CREATE INDEX trigger_inputs_story_id_idx ON trigger_inputs(story_id);

      DELETE FROM users AS legacy_owner
      WHERE legacy_owner.id = 'migration-user'
        AND NOT EXISTS (
          SELECT 1 FROM stories WHERE creator_user_id = legacy_owner.id
        );
    `,
  },
  {
    id: '202607240007_locations',
    sql: `
      CREATE TABLE locations (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        sort_order integer NOT NULL,
        CONSTRAINT locations_story_id_id_unique UNIQUE (story_id, id)
      );

      ALTER TABLE interactions
      ADD COLUMN location_id text,
      ADD CONSTRAINT interactions_location_fkey
        FOREIGN KEY (story_id, location_id)
        REFERENCES locations(story_id, id) ON DELETE SET NULL (location_id);

      CREATE INDEX locations_story_id_idx ON locations(story_id);
      CREATE INDEX interactions_location_id_idx ON interactions(location_id);
    `,
  },
  {
    id: '202607240008_characters',
    sql: `
      CREATE TABLE characters (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        sort_order integer NOT NULL,
        CONSTRAINT characters_story_id_id_unique UNIQUE (story_id, id)
      );

      CREATE TABLE interaction_characters (
        story_id text NOT NULL,
        interaction_id text NOT NULL,
        character_id text NOT NULL,
        sort_order integer NOT NULL,
        PRIMARY KEY (interaction_id, character_id),
        CONSTRAINT interaction_characters_interaction_fkey
          FOREIGN KEY (story_id, interaction_id)
          REFERENCES interactions(story_id, id) ON DELETE CASCADE,
        CONSTRAINT interaction_characters_character_fkey
          FOREIGN KEY (story_id, character_id)
          REFERENCES characters(story_id, id) ON DELETE CASCADE
      );

      CREATE INDEX characters_story_id_idx ON characters(story_id);
      CREATE INDEX interaction_characters_story_id_idx ON interaction_characters(story_id);
      CREATE INDEX interaction_characters_character_id_idx
        ON interaction_characters(character_id);
    `,
  },
  {
    id: '202607240009_character_stats',
    sql: `
      CREATE TABLE character_stats (
        id text PRIMARY KEY,
        story_id text NOT NULL,
        character_id text NOT NULL,
        name text NOT NULL,
        initial_value double precision NOT NULL,
        sort_order integer NOT NULL,
        CONSTRAINT character_stats_story_id_id_unique UNIQUE (story_id, id),
        CONSTRAINT character_stats_character_fkey
          FOREIGN KEY (story_id, character_id)
          REFERENCES characters(story_id, id) ON DELETE CASCADE
      );

      CREATE TABLE interaction_stat_effects (
        story_id text NOT NULL,
        interaction_id text NOT NULL,
        stat_id text NOT NULL,
        operation text NOT NULL CHECK (operation IN ('add', 'set')),
        value double precision NOT NULL,
        sort_order integer NOT NULL,
        PRIMARY KEY (interaction_id, stat_id),
        CONSTRAINT interaction_stat_effects_interaction_fkey
          FOREIGN KEY (story_id, interaction_id)
          REFERENCES interactions(story_id, id) ON DELETE CASCADE,
        CONSTRAINT interaction_stat_effects_stat_fkey
          FOREIGN KEY (story_id, stat_id)
          REFERENCES character_stats(story_id, id) ON DELETE CASCADE
      );

      CREATE INDEX character_stats_character_id_idx ON character_stats(character_id);
      CREATE INDEX interaction_stat_effects_stat_id_idx ON interaction_stat_effects(stat_id);
    `,
  },
  {
    id: '202607260010_reusable_stat_definitions',
    sql: `
      CREATE TABLE stat_definitions (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        name text NOT NULL,
        sort_order integer NOT NULL,
        CONSTRAINT stat_definitions_story_id_id_unique UNIQUE (story_id, id)
      );

      INSERT INTO stat_definitions (id, story_id, name, sort_order)
      SELECT id, story_id, name, sort_order FROM character_stats;

      ALTER TABLE character_stats
      ADD COLUMN stat_definition_id text;

      UPDATE character_stats SET stat_definition_id = id;

      ALTER TABLE character_stats
      ALTER COLUMN stat_definition_id SET NOT NULL,
      DROP COLUMN name,
      ADD CONSTRAINT character_stats_definition_fkey
        FOREIGN KEY (story_id, stat_definition_id)
        REFERENCES stat_definitions(story_id, id) ON DELETE CASCADE;

      CREATE INDEX stat_definitions_story_id_idx ON stat_definitions(story_id);
      CREATE INDEX character_stats_definition_id_idx ON character_stats(stat_definition_id);
    `,
  },
  {
    id: '202607260011_item_definitions_and_character_items',
    sql: `
      CREATE TABLE item_definitions (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        sort_order integer NOT NULL,
        CONSTRAINT item_definitions_story_id_id_unique UNIQUE (story_id, id)
      );

      CREATE TABLE character_items (
        id text PRIMARY KEY,
        story_id text NOT NULL,
        character_id text NOT NULL,
        item_definition_id text NOT NULL,
        sort_order integer NOT NULL,
        CONSTRAINT character_items_story_id_id_unique UNIQUE (story_id, id),
        CONSTRAINT character_items_character_fkey
          FOREIGN KEY (story_id, character_id)
          REFERENCES characters(story_id, id) ON DELETE CASCADE,
        CONSTRAINT character_items_definition_fkey
          FOREIGN KEY (story_id, item_definition_id)
          REFERENCES item_definitions(story_id, id) ON DELETE CASCADE
      );

      CREATE INDEX item_definitions_story_id_idx ON item_definitions(story_id);
      CREATE INDEX character_items_character_id_idx ON character_items(character_id);
      CREATE INDEX character_items_definition_id_idx ON character_items(item_definition_id);
    `,
  },
  {
    id: '202607260012_story_time',
    sql: `
      ALTER TABLE stories
      ADD COLUMN start_date_time text NOT NULL DEFAULT '2000-01-03T08:00',
      ADD CONSTRAINT stories_start_date_time_format
        CHECK (
          start_date_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
        );

      ALTER TABLE interactions
      ADD COLUMN duration_minutes integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT interactions_duration_minutes_nonnegative
        CHECK (duration_minutes >= 0);
    `,
  },
  {
    id: '202607260013_reader_progress',
    sql: `
      CREATE TABLE story_reader_progress (
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, story_id),
        CONSTRAINT story_reader_progress_state_object
          CHECK (jsonb_typeof(state) = 'object')
      );

      CREATE INDEX story_reader_progress_story_id_idx
        ON story_reader_progress(story_id);
    `,
  },
  {
    id: '202607260014_context_images',
    sql: `
      ALTER TABLE locations ADD COLUMN image_url text NOT NULL DEFAULT '';
      ALTER TABLE characters ADD COLUMN image_url text NOT NULL DEFAULT '';
      ALTER TABLE stat_definitions ADD COLUMN image_url text NOT NULL DEFAULT '';
      ALTER TABLE item_definitions ADD COLUMN image_url text NOT NULL DEFAULT '';
    `,
  },
  {
    id: '202607260015_interaction_item_effects',
    sql: `
      CREATE TABLE interaction_item_effects (
        story_id text NOT NULL,
        interaction_id text NOT NULL,
        item_id text NOT NULL,
        operation text NOT NULL CHECK (operation IN ('obtain', 'lose')),
        sort_order integer NOT NULL,
        PRIMARY KEY (interaction_id, item_id),
        CONSTRAINT interaction_item_effects_interaction_fkey
          FOREIGN KEY (story_id, interaction_id)
          REFERENCES interactions(story_id, id) ON DELETE CASCADE,
        CONSTRAINT interaction_item_effects_item_fkey
          FOREIGN KEY (story_id, item_id)
          REFERENCES character_items(story_id, id) ON DELETE CASCADE
      );

      CREATE INDEX interaction_item_effects_item_id_idx
        ON interaction_item_effects(item_id);
    `,
  },
  {
    id: '202607270016_time_based_stat_changes',
    sql: `
      ALTER TABLE stat_definitions
      ADD COLUMN change_per_hour double precision NOT NULL DEFAULT 0;
    `,
  },
  {
    id: '202607270017_item_stats',
    sql: `
      ALTER TABLE item_definitions
      ADD COLUMN stats jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT item_definitions_stats_array
        CHECK (jsonb_typeof(stats) = 'array');

      ALTER TABLE interactions
      ADD COLUMN item_stat_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT interactions_item_stat_effects_array
        CHECK (jsonb_typeof(item_stat_effects) = 'array');

      UPDATE story_reader_progress
      SET state = jsonb_set(
        state,
        '{itemStatValues}',
        '{}'::jsonb,
        true
      );
    `,
  },
  {
    id: '202607270018_item_definition_effects',
    sql: `
      ALTER TABLE interaction_item_effects
      DROP CONSTRAINT interaction_item_effects_pkey,
      ALTER COLUMN item_id DROP NOT NULL,
      ADD COLUMN id bigserial,
      ADD COLUMN item_definition_id text,
      ADD CONSTRAINT interaction_item_effects_pkey PRIMARY KEY (id),
      ADD CONSTRAINT interaction_item_effects_one_target
        CHECK (num_nonnulls(item_id, item_definition_id) = 1),
      ADD CONSTRAINT interaction_item_effects_definition_fkey
        FOREIGN KEY (story_id, item_definition_id)
        REFERENCES item_definitions(story_id, id) ON DELETE CASCADE;

      CREATE INDEX interaction_item_effects_definition_id_idx
        ON interaction_item_effects(item_definition_id);
    `,
  },
  {
    id: '202607270019_item_effect_characters',
    sql: `
      ALTER TABLE interaction_item_effects
      ADD COLUMN character_id text,
      ADD CONSTRAINT interaction_item_effects_character_fkey
        FOREIGN KEY (story_id, character_id)
        REFERENCES characters(story_id, id) ON DELETE CASCADE;

      CREATE INDEX interaction_item_effects_character_id_idx
        ON interaction_item_effects(character_id);
    `,
  },
  {
    id: '202607270020_playable_character',
    sql: `
      ALTER TABLE characters
      ADD COLUMN is_playable boolean NOT NULL DEFAULT false;

      CREATE UNIQUE INDEX characters_one_playable_per_story_idx
        ON characters(story_id)
        WHERE is_playable;
    `,
  },
  {
    id: '202608020021_item_instances',
    sql: `
      CREATE TABLE item_instances (
        id text PRIMARY KEY,
        story_id text NOT NULL,
        item_definition_id text NOT NULL,
        owner_character_id text,
        owner_location_id text,
        quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
        sort_order integer NOT NULL,
        CONSTRAINT item_instances_story_id_id_unique UNIQUE (story_id, id),
        CONSTRAINT item_instances_one_root_owner
          CHECK (num_nonnulls(owner_character_id, owner_location_id) = 1),
        CONSTRAINT item_instances_character_fkey
          FOREIGN KEY (story_id, owner_character_id)
          REFERENCES characters(story_id, id) ON DELETE CASCADE,
        CONSTRAINT item_instances_location_fkey
          FOREIGN KEY (story_id, owner_location_id)
          REFERENCES locations(story_id, id) ON DELETE CASCADE,
        CONSTRAINT item_instances_definition_fkey
          FOREIGN KEY (story_id, item_definition_id)
          REFERENCES item_definitions(story_id, id) ON DELETE CASCADE
      );

      INSERT INTO item_instances
        (id, story_id, item_definition_id, owner_character_id, sort_order)
      SELECT id, story_id, item_definition_id, character_id, sort_order
      FROM character_items;

      CREATE INDEX item_instances_story_id_idx ON item_instances(story_id);
      CREATE INDEX item_instances_character_id_idx ON item_instances(owner_character_id);
      CREATE INDEX item_instances_location_id_idx ON item_instances(owner_location_id);
      CREATE INDEX item_instances_definition_id_idx ON item_instances(item_definition_id);

      ALTER TABLE interaction_item_effects
      DROP CONSTRAINT interaction_item_effects_item_fkey,
      ADD CONSTRAINT interaction_item_effects_item_fkey
        FOREIGN KEY (story_id, item_id)
        REFERENCES item_instances(story_id, id) ON DELETE CASCADE;

      ALTER TABLE character_items RENAME TO character_items_legacy;
    `,
  },
  {
    id: '202608020022_item_instance_relationships',
    sql: `
      ALTER TABLE item_instances
      DROP CONSTRAINT item_instances_one_root_owner,
      ADD CONSTRAINT item_instances_at_most_one_root_owner
        CHECK (num_nonnulls(owner_character_id, owner_location_id) <= 1);

      CREATE TABLE item_instance_relationships (
        id bigserial PRIMARY KEY,
        story_id text NOT NULL,
        parent_item_id text NOT NULL,
        child_item_id text NOT NULL,
        relationship_type text NOT NULL CHECK (
          relationship_type IN
            ('contained', 'equipped', 'attached', 'part_of', 'installed', 'worn', 'held')
        ),
        slot_key text,
        sort_order integer NOT NULL,
        CONSTRAINT item_instance_relationships_distinct_items
          CHECK (parent_item_id <> child_item_id),
        CONSTRAINT item_instance_relationships_one_parent UNIQUE (story_id, child_item_id),
        CONSTRAINT item_instance_relationships_parent_fkey
          FOREIGN KEY (story_id, parent_item_id)
          REFERENCES item_instances(story_id, id) ON DELETE CASCADE,
        CONSTRAINT item_instance_relationships_child_fkey
          FOREIGN KEY (story_id, child_item_id)
          REFERENCES item_instances(story_id, id) ON DELETE CASCADE
      );

      CREATE INDEX item_instance_relationships_parent_id_idx
        ON item_instance_relationships(story_id, parent_item_id, sort_order);

      CREATE FUNCTION validate_item_instance_relationship() RETURNS trigger AS $$
      DECLARE
        child_has_root boolean;
        creates_cycle boolean;
      BEGIN
        SELECT num_nonnulls(owner_character_id, owner_location_id) > 0
        INTO child_has_root
        FROM item_instances
        WHERE story_id = NEW.story_id AND id = NEW.child_item_id;
        IF child_has_root THEN
          RAISE EXCEPTION 'A related item cannot also have a root owner';
        END IF;

        WITH RECURSIVE ancestors(id) AS (
          SELECT NEW.parent_item_id
          UNION
          SELECT relationship.parent_item_id
          FROM item_instance_relationships AS relationship
          JOIN ancestors ON ancestors.id = relationship.child_item_id
          WHERE relationship.story_id = NEW.story_id
            AND relationship.child_item_id <> NEW.child_item_id
        )
        SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.child_item_id)
        INTO creates_cycle;
        IF creates_cycle THEN
          RAISE EXCEPTION 'Item relationships cannot contain a cycle';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER item_instance_relationships_validate
      BEFORE INSERT OR UPDATE ON item_instance_relationships
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_relationship();

      CREATE FUNCTION validate_item_instance_root_owner() RETURNS trigger AS $$
      BEGIN
        IF num_nonnulls(NEW.owner_character_id, NEW.owner_location_id) > 0
          AND EXISTS (
            SELECT 1 FROM item_instance_relationships
            WHERE story_id = NEW.story_id AND child_item_id = NEW.id
          )
        THEN
          RAISE EXCEPTION 'A rooted item cannot also have a structural parent';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER item_instances_validate_root_owner
      BEFORE INSERT OR UPDATE OF owner_character_id, owner_location_id ON item_instances
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_root_owner();
    `,
  },
];
