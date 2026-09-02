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
  {
    id: '202608090023_remove_location_item_roots',
    sql: `
      CREATE TEMP TABLE removed_location_item_instances (
        story_id text NOT NULL,
        id text NOT NULL,
        PRIMARY KEY (story_id, id)
      ) ON COMMIT DROP;

      INSERT INTO removed_location_item_instances (story_id, id)
      WITH RECURSIVE location_item_tree(story_id, id) AS (
        SELECT story_id, id
        FROM item_instances
        WHERE owner_location_id IS NOT NULL
        UNION
        SELECT relationship.story_id, relationship.child_item_id
        FROM item_instance_relationships AS relationship
        JOIN location_item_tree AS parent
          ON parent.story_id = relationship.story_id
         AND parent.id = relationship.parent_item_id
      )
      SELECT story_id, id FROM location_item_tree;

      UPDATE interactions AS interaction
      SET item_stat_effects = COALESCE(
        (
          SELECT jsonb_agg(effect.value ORDER BY effect.ordinality)
          FROM jsonb_array_elements(interaction.item_stat_effects)
            WITH ORDINALITY AS effect(value, ordinality)
          WHERE NOT EXISTS (
            SELECT 1
            FROM removed_location_item_instances AS removed
            WHERE removed.story_id = interaction.story_id
              AND removed.id = effect.value->>'itemId'
          )
        ),
        '[]'::jsonb
      )
      WHERE EXISTS (
        SELECT 1
        FROM removed_location_item_instances AS removed
        WHERE removed.story_id = interaction.story_id
      );

      UPDATE story_reader_progress AS progress
      SET state = jsonb_set(
        jsonb_set(
          progress.state,
          '{ownedItemIds}',
          COALESCE(
            (
              SELECT jsonb_agg(owned.value ORDER BY owned.ordinality)
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(progress.state->'ownedItemIds') = 'array'
                  THEN progress.state->'ownedItemIds'
                  ELSE '[]'::jsonb
                END
              ) WITH ORDINALITY AS owned(value, ordinality)
              WHERE NOT EXISTS (
                SELECT 1
                FROM removed_location_item_instances AS removed
                WHERE removed.story_id = progress.story_id
                  AND removed.id = owned.value #>> '{}'
              )
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{itemStatValues}',
        COALESCE(
          (
            SELECT jsonb_object_agg(item_stat.key, item_stat.value)
            FROM jsonb_each(
              CASE
                WHEN jsonb_typeof(progress.state->'itemStatValues') = 'object'
                THEN progress.state->'itemStatValues'
                ELSE '{}'::jsonb
              END
            ) AS item_stat(key, value)
            WHERE NOT EXISTS (
              SELECT 1
              FROM removed_location_item_instances AS removed
              WHERE removed.story_id = progress.story_id
                AND removed.id = item_stat.key
            )
          ),
          '{}'::jsonb
        ),
        true
      )
      WHERE EXISTS (
        SELECT 1
        FROM removed_location_item_instances AS removed
        WHERE removed.story_id = progress.story_id
      );

      DELETE FROM item_instances AS item
      USING removed_location_item_instances AS removed
      WHERE item.story_id = removed.story_id
        AND item.id = removed.id;

      DROP TRIGGER item_instances_validate_root_owner ON item_instances;
      DROP FUNCTION validate_item_instance_root_owner();
      DROP TRIGGER item_instance_relationships_validate ON item_instance_relationships;
      DROP FUNCTION validate_item_instance_relationship();

      DROP INDEX item_instances_location_id_idx;

      ALTER TABLE item_instances
      DROP CONSTRAINT item_instances_location_fkey,
      DROP CONSTRAINT item_instances_at_most_one_root_owner,
      DROP COLUMN owner_location_id;

      CREATE FUNCTION validate_item_instance_relationship() RETURNS trigger AS $$
      DECLARE
        child_has_root boolean;
        creates_cycle boolean;
      BEGIN
        SELECT owner_character_id IS NOT NULL
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
        IF NEW.owner_character_id IS NOT NULL
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
      BEFORE INSERT OR UPDATE OF owner_character_id ON item_instances
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_root_owner();

      CREATE FUNCTION assert_item_instance_placement(
        target_story_id text,
        target_item_id text
      ) RETURNS void AS $$
      DECLARE
        root_owner_count integer;
        parent_count integer;
      BEGIN
        SELECT CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END
        INTO root_owner_count
        FROM item_instances
        WHERE story_id = target_story_id AND id = target_item_id;
        IF NOT FOUND THEN
          RETURN;
        END IF;

        SELECT COUNT(*)::integer
        INTO parent_count
        FROM item_instance_relationships
        WHERE story_id = target_story_id AND child_item_id = target_item_id;

        IF root_owner_count + parent_count <> 1 THEN
          RAISE EXCEPTION 'An item must belong to exactly one character or parent item';
        END IF;
      END;
      $$ LANGUAGE plpgsql;

      CREATE FUNCTION validate_item_instance_placement() RETURNS trigger AS $$
      BEGIN
        PERFORM assert_item_instance_placement(NEW.story_id, NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE CONSTRAINT TRIGGER item_instances_validate_placement
      AFTER INSERT OR UPDATE OF owner_character_id ON item_instances
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_placement();

      CREATE FUNCTION validate_item_relationship_placement() RETURNS trigger AS $$
      BEGIN
        IF TG_OP <> 'INSERT' THEN
          PERFORM assert_item_instance_placement(OLD.story_id, OLD.child_item_id);
        END IF;
        IF TG_OP <> 'DELETE' THEN
          PERFORM assert_item_instance_placement(NEW.story_id, NEW.child_item_id);
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE CONSTRAINT TRIGGER item_relationships_validate_placement
      AFTER INSERT OR UPDATE OR DELETE ON item_instance_relationships
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_item_relationship_placement();
    `,
  },
  {
    id: '202608100024_content_categories',
    sql: `
      ALTER TABLE locations ADD COLUMN category text NOT NULL DEFAULT '';
      ALTER TABLE characters ADD COLUMN category text NOT NULL DEFAULT '';
      ALTER TABLE stat_definitions ADD COLUMN category text NOT NULL DEFAULT '';
      ALTER TABLE item_definitions ADD COLUMN category text NOT NULL DEFAULT '';
    `,
  },
  {
    id: '202608130025_restore_location_item_roots',
    sql: `
      ALTER TABLE item_instances
      ADD COLUMN owner_location_id text,
      ADD CONSTRAINT item_instances_at_most_one_root_owner
        CHECK (num_nonnulls(owner_character_id, owner_location_id) <= 1),
      ADD CONSTRAINT item_instances_location_fkey
        FOREIGN KEY (story_id, owner_location_id)
        REFERENCES locations(story_id, id) ON DELETE CASCADE;

      CREATE INDEX item_instances_location_id_idx ON item_instances(owner_location_id);

      CREATE OR REPLACE FUNCTION validate_item_instance_relationship() RETURNS trigger AS $$
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

      CREATE OR REPLACE FUNCTION validate_item_instance_root_owner() RETURNS trigger AS $$
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

      DROP TRIGGER item_instances_validate_root_owner ON item_instances;
      CREATE TRIGGER item_instances_validate_root_owner
      BEFORE INSERT OR UPDATE OF owner_character_id, owner_location_id ON item_instances
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_root_owner();

      CREATE OR REPLACE FUNCTION assert_item_instance_placement(
        target_story_id text,
        target_item_id text
      ) RETURNS void AS $$
      DECLARE
        root_owner_count integer;
        parent_count integer;
      BEGIN
        SELECT num_nonnulls(owner_character_id, owner_location_id)
        INTO root_owner_count
        FROM item_instances
        WHERE story_id = target_story_id AND id = target_item_id;
        IF NOT FOUND THEN
          RETURN;
        END IF;

        SELECT COUNT(*)::integer
        INTO parent_count
        FROM item_instance_relationships
        WHERE story_id = target_story_id AND child_item_id = target_item_id;

        IF root_owner_count + parent_count <> 1 THEN
          RAISE EXCEPTION 'An item must belong to exactly one character, location, or parent item';
        END IF;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER item_instances_validate_placement ON item_instances;
      CREATE CONSTRAINT TRIGGER item_instances_validate_placement
      AFTER INSERT OR UPDATE OF owner_character_id, owner_location_id ON item_instances
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_item_instance_placement();
    `,
  },
  {
    id: '202608130026_access_control',
    sql: `
      ALTER TABLE users
      ADD COLUMN role text NOT NULL DEFAULT 'user',
      ADD CONSTRAINT users_role_allowed CHECK (role IN ('user', 'admin'));

      UPDATE users
      SET role = 'admin'
      WHERE id = (
        SELECT id
        FROM users
        WHERE email <> 'migration@paralleax.invalid'
        ORDER BY created_at, id
        LIMIT 1
      );

      ALTER TABLE stories
      ADD COLUMN visibility text NOT NULL DEFAULT 'private',
      ADD COLUMN edit_policy text NOT NULL DEFAULT 'owner',
      ADD COLUMN comment_policy text NOT NULL DEFAULT 'disabled',
      ADD CONSTRAINT stories_visibility_allowed
        CHECK (visibility IN ('private', 'authenticated', 'public', 'invitation')),
      ADD CONSTRAINT stories_edit_policy_allowed
        CHECK (edit_policy IN ('owner', 'collaborators', 'authenticated')),
      ADD CONSTRAINT stories_comment_policy_allowed
        CHECK (comment_policy IN ('disabled', 'readers', 'editors', 'authenticated'));

      CREATE TABLE story_user_permissions (
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (story_id, user_id),
        CONSTRAINT story_user_permissions_role_allowed CHECK (role IN ('viewer', 'editor'))
      );

      CREATE INDEX story_user_permissions_user_id_idx
        ON story_user_permissions(user_id);
      CREATE INDEX stories_visibility_idx ON stories(visibility);
    `,
  },
  {
    id: '202608130027_story_comments',
    sql: `
      CREATE TABLE story_comment_threads (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        anchor jsonb NOT NULL,
        anchor_label text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        resolved_by text REFERENCES users(id) ON DELETE SET NULL,
        resolved_at timestamptz,
        revision integer NOT NULL DEFAULT 1,
        CONSTRAINT story_comment_threads_status_allowed
          CHECK (status IN ('open', 'resolved')),
        CONSTRAINT story_comment_threads_resolution_consistent
          CHECK (
            (status = 'open' AND resolved_at IS NULL)
            OR (status = 'resolved' AND resolved_at IS NOT NULL)
          )
      );

      CREATE TABLE story_comment_messages (
        id text PRIMARY KEY,
        thread_id text NOT NULL REFERENCES story_comment_threads(id) ON DELETE CASCADE,
        author_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        body text NOT NULL,
        created_at timestamptz NOT NULL,
        edited_at timestamptz,
        CONSTRAINT story_comment_messages_body_length
          CHECK (char_length(body) BETWEEN 1 AND 4000)
      );

      CREATE INDEX story_comment_threads_story_status_idx
        ON story_comment_threads(story_id, status, updated_at DESC);
      CREATE INDEX story_comment_messages_thread_created_idx
        ON story_comment_messages(thread_id, created_at);
    `,
  },
  {
    id: '202608140028_trigger_positions',
    sql: `
      ALTER TABLE triggers
      ADD COLUMN position_x double precision,
      ADD COLUMN position_y double precision,
      ADD CONSTRAINT triggers_position_pair
        CHECK ((position_x IS NULL) = (position_y IS NULL));
    `,
  },
  {
    id: '202608140029_graph_decorations',
    sql: `
      CREATE TABLE graph_decorations (
        id text PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        kind text NOT NULL,
        position_x double precision NOT NULL,
        position_y double precision NOT NULL,
        width double precision,
        height double precision,
        text_content text,
        color text NOT NULL,
        font_size integer,
        font_family text,
        font_weight text,
        font_style text,
        sort_order integer NOT NULL,
        CONSTRAINT graph_decorations_kind_allowed CHECK (kind IN ('frame', 'text')),
        CONSTRAINT graph_decorations_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
        CONSTRAINT graph_decorations_shape CHECK (
          (
            kind = 'frame'
            AND width >= 120 AND height >= 80
            AND text_content IS NULL AND font_size IS NULL AND font_family IS NULL
            AND font_weight IS NULL AND font_style IS NULL
          )
          OR
          (
            kind = 'text'
            AND width IS NULL AND height IS NULL
            AND text_content IS NOT NULL AND char_length(text_content) <= 2000
            AND font_size BETWEEN 10 AND 96
            AND font_family IN ('sans', 'serif', 'monospace', 'display')
            AND font_weight IN ('normal', 'bold')
            AND font_style IN ('normal', 'italic')
          )
        )
      );

      CREATE INDEX graph_decorations_story_order_idx
        ON graph_decorations(story_id, sort_order);
    `,
  },
  {
    id: '202608160030_reader_comments',
    sql: `
      ALTER TABLE stories
      DROP CONSTRAINT stories_comment_policy_allowed;

      UPDATE stories
      SET comment_policy = CASE comment_policy
        WHEN 'authenticated' THEN 'readers'
        WHEN 'disabled' THEN 'editors'
        ELSE comment_policy
      END;

      ALTER TABLE stories
      ALTER COLUMN comment_policy SET DEFAULT 'editors',
      ADD CONSTRAINT stories_comment_policy_allowed
        CHECK (comment_policy IN ('editors', 'readers'));
    `,
  },
  {
    id: '202608220031_typed_stats',
    sql: `
      ALTER TABLE stat_definitions
      ADD COLUMN value_type text NOT NULL DEFAULT 'number';

      ALTER TABLE stat_definitions
      ADD CONSTRAINT stat_definitions_name_not_blank CHECK (btrim(name) <> ''),
      ADD CONSTRAINT stat_definitions_value_type_allowed
        CHECK (value_type IN ('number', 'boolean', 'string')),
      ADD CONSTRAINT stat_definitions_hourly_change_numeric
        CHECK (value_type = 'number' OR change_per_hour = 0);

      ALTER TABLE character_stats RENAME TO stat_assignments;
      ALTER TABLE stat_assignments
      ALTER COLUMN character_id DROP NOT NULL,
      ALTER COLUMN initial_value TYPE jsonb USING to_jsonb(initial_value),
      ADD COLUMN owner_type text NOT NULL DEFAULT 'character',
      ADD COLUMN location_id text,
      ADD COLUMN item_definition_id text;
      ALTER TABLE stat_assignments ALTER COLUMN owner_type DROP DEFAULT;

      ALTER TABLE stat_assignments
      ADD CONSTRAINT stat_assignments_location_fkey
        FOREIGN KEY (story_id, location_id)
        REFERENCES locations(story_id, id) ON DELETE CASCADE,
      ADD CONSTRAINT stat_assignments_item_definition_fkey
        FOREIGN KEY (story_id, item_definition_id)
        REFERENCES item_definitions(story_id, id) ON DELETE CASCADE,
      ADD CONSTRAINT stat_assignments_owner_shape CHECK (
        (owner_type = 'story' AND character_id IS NULL AND location_id IS NULL
          AND item_definition_id IS NULL)
        OR (owner_type = 'character' AND character_id IS NOT NULL AND location_id IS NULL
          AND item_definition_id IS NULL)
        OR (owner_type = 'location' AND character_id IS NULL AND location_id IS NOT NULL
          AND item_definition_id IS NULL)
        OR (owner_type = 'item_definition' AND character_id IS NULL AND location_id IS NULL
          AND item_definition_id IS NOT NULL)
      ),
      ADD CONSTRAINT stat_assignments_primitive_value
        CHECK (jsonb_typeof(initial_value) IN ('number', 'boolean', 'string'));

      INSERT INTO stat_assignments
        (id, story_id, character_id, stat_definition_id, initial_value, sort_order,
         owner_type, location_id, item_definition_id)
      SELECT
        COALESCE(
          stat.value->>'id',
          'item-stat-' || md5(definition.story_id || ':' || definition.id || ':' ||
            (stat.value->>'statDefinitionId'))
        ),
        definition.story_id,
        NULL,
        stat.value->>'statDefinitionId',
        stat.value->'initialValue',
        stat.ordinality - 1,
        'item_definition',
        NULL,
        definition.id
      FROM item_definitions definition
      CROSS JOIN LATERAL jsonb_array_elements(definition.stats)
        WITH ORDINALITY AS stat(value, ordinality);

      ALTER TABLE interaction_stat_effects
      DROP CONSTRAINT interaction_stat_effects_pkey,
      ALTER COLUMN value TYPE jsonb USING to_jsonb(value),
      ADD COLUMN id bigserial,
      ADD COLUMN item_id text,
      ADD CONSTRAINT interaction_stat_effects_pkey PRIMARY KEY (id),
      ADD CONSTRAINT interaction_stat_effects_item_fkey
        FOREIGN KEY (story_id, item_id)
        REFERENCES item_instances(story_id, id) ON DELETE CASCADE,
      ADD CONSTRAINT interaction_stat_effects_primitive_value
        CHECK (jsonb_typeof(value) IN ('number', 'boolean', 'string'));

      INSERT INTO interaction_stat_effects
        (story_id, interaction_id, stat_id, item_id, operation, value, sort_order)
      SELECT
        interaction.story_id,
        interaction.id,
        assignment.id,
        effect.value->>'itemId',
        effect.value->>'operation',
        effect.value->'value',
        COALESCE(existing.next_order, 0) + effect.ordinality - 1
      FROM interactions interaction
      CROSS JOIN LATERAL jsonb_array_elements(interaction.item_stat_effects)
        WITH ORDINALITY AS effect(value, ordinality)
      JOIN item_instances item
        ON item.story_id = interaction.story_id AND item.id = effect.value->>'itemId'
      JOIN stat_assignments assignment
        ON assignment.story_id = interaction.story_id
        AND assignment.owner_type = 'item_definition'
        AND assignment.item_definition_id = item.item_definition_id
        AND assignment.stat_definition_id = effect.value->>'statDefinitionId'
      LEFT JOIN LATERAL (
        SELECT MAX(sort_order) + 1 AS next_order
        FROM interaction_stat_effects current_effect
        WHERE current_effect.interaction_id = interaction.id
      ) existing ON true;

      ALTER TABLE item_definitions
      DROP CONSTRAINT item_definitions_stats_array,
      DROP COLUMN stats;
      ALTER TABLE interactions
      DROP CONSTRAINT interactions_item_stat_effects_array,
      DROP COLUMN item_stat_effects;

      CREATE INDEX stat_definitions_story_order_idx
        ON stat_definitions(story_id, sort_order);
      CREATE INDEX stat_assignments_story_owner_idx
        ON stat_assignments(story_id, owner_type, sort_order);
      CREATE UNIQUE INDEX stat_assignments_story_definition_unique_idx
        ON stat_assignments(story_id, stat_definition_id)
        WHERE owner_type = 'story';
      CREATE UNIQUE INDEX stat_assignments_character_definition_unique_idx
        ON stat_assignments(story_id, character_id, stat_definition_id)
        WHERE owner_type = 'character';
      CREATE UNIQUE INDEX stat_assignments_location_definition_unique_idx
        ON stat_assignments(story_id, location_id, stat_definition_id)
        WHERE owner_type = 'location';
      CREATE UNIQUE INDEX stat_assignments_item_definition_unique_idx
        ON stat_assignments(story_id, item_definition_id, stat_definition_id)
        WHERE owner_type = 'item_definition';
      CREATE INDEX interaction_stat_effects_assignment_idx
        ON interaction_stat_effects(story_id, stat_id);
    `,
  },
  {
    id: '202608240032_remove_stat_definition_keys',
    sql: `
      ALTER TABLE stat_definitions
      DROP CONSTRAINT IF EXISTS stat_definitions_story_key_unique,
      DROP CONSTRAINT IF EXISTS stat_definitions_key_not_blank,
      DROP COLUMN IF EXISTS key;
    `,
  },
  {
    id: '202608270033_reader_save_slots',
    sql: `
      ALTER TABLE story_reader_progress
      DROP CONSTRAINT story_reader_progress_pkey,
      ADD COLUMN slot_id text NOT NULL DEFAULT 'reader-autosave',
      ADD COLUMN name text,
      ADD COLUMN created_at timestamptz;

      UPDATE story_reader_progress
      SET created_at = updated_at
      WHERE created_at IS NULL;

      ALTER TABLE story_reader_progress
      ALTER COLUMN slot_id DROP DEFAULT,
      ALTER COLUMN created_at SET NOT NULL,
      ADD CONSTRAINT story_reader_progress_pkey
        PRIMARY KEY (user_id, story_id, slot_id),
      ADD CONSTRAINT story_reader_progress_slot_shape
        CHECK (
          (slot_id IN ('reader-autosave', 'simulation-autosave') AND name IS NULL)
          OR
          (slot_id NOT IN ('reader-autosave', 'simulation-autosave')
            AND name IS NOT NULL
            AND length(btrim(name)) BETWEEN 1 AND 100)
        );
    `,
  },
  {
    id: '202608280034_story_change_history',
    sql: `
      CREATE TABLE story_change_events (
        id bigserial PRIMARY KEY,
        story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
        revision integer NOT NULL CHECK (revision > 1),
        kind text NOT NULL CHECK (kind IN ('change', 'undo', 'redo')),
        operation text NOT NULL CHECK (btrim(operation) <> ''),
        changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
        reverts_event_id bigint UNIQUE
          REFERENCES story_change_events(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL,
        UNIQUE (story_id, revision),
        CHECK (reverts_event_id IS NULL OR kind IN ('undo', 'redo'))
      );

      CREATE INDEX story_change_events_story_order_idx
        ON story_change_events(story_id, id DESC);
      CREATE INDEX story_change_events_actor_order_idx
        ON story_change_events(story_id, actor_user_id, id DESC);
    `,
  },
  {
    id: '202608300035_conditional_text_blocks',
    sql: `
      ALTER TABLE interactions
      ADD COLUMN conditional_text_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT interactions_conditional_text_blocks_array
        CHECK (jsonb_typeof(conditional_text_blocks) = 'array');
    `,
  },
  {
    id: '202608310036_trigger_condition_groups_and_probability',
    sql: `
      ALTER TABLE triggers
      RENAME COLUMN conditions TO condition_groups;

      ALTER TABLE triggers
      DROP CONSTRAINT IF EXISTS triggers_conditions_array;

      UPDATE triggers
      SET condition_groups = jsonb_build_array(
        jsonb_build_object('id', id, 'conditions', condition_groups)
      );

      ALTER TABLE triggers
      ADD COLUMN appearance_probability smallint NOT NULL DEFAULT 100,
      ADD CONSTRAINT triggers_condition_groups_array
        CHECK (
          jsonb_typeof(condition_groups) = 'array'
          AND jsonb_array_length(condition_groups) > 0
        ),
      ADD CONSTRAINT triggers_appearance_probability_range
        CHECK (appearance_probability BETWEEN 0 AND 100);

      CREATE TEMP TABLE trigger_group_merge_map ON COMMIT DROP AS
      SELECT
        candidate.id AS source_id,
        first_value(candidate.id) OVER (
          PARTITION BY candidate.story_id, candidate.output_interaction_id,
            candidate.input_signature
          ORDER BY candidate.sort_order, candidate.id
        ) AS retained_id
      FROM (
        SELECT
          trigger.id,
          trigger.story_id,
          trigger.output_interaction_id,
          trigger.sort_order,
          COALESCE(
            (
              SELECT jsonb_agg(input.input_interaction_id ORDER BY input.input_interaction_id)::text
              FROM trigger_inputs input
              WHERE input.trigger_id = trigger.id
            ),
            '[]'
          ) AS input_signature
        FROM triggers trigger
      ) candidate;

      WITH merged AS (
        SELECT
          mapping.retained_id,
          jsonb_agg(condition_group.value ORDER BY source.sort_order, condition_group.ordinality)
            AS condition_groups
        FROM trigger_group_merge_map mapping
        JOIN triggers source ON source.id = mapping.source_id
        CROSS JOIN LATERAL jsonb_array_elements(source.condition_groups)
          WITH ORDINALITY AS condition_group(value, ordinality)
        GROUP BY mapping.retained_id
      )
      UPDATE triggers retained
      SET condition_groups = merged.condition_groups
      FROM merged
      WHERE retained.id = merged.retained_id;

      UPDATE story_comment_threads thread
      SET anchor = jsonb_set(thread.anchor, '{targetId}', to_jsonb(mapping.retained_id))
      FROM trigger_group_merge_map mapping
      WHERE mapping.source_id <> mapping.retained_id
        AND thread.anchor->>'targetType' = 'trigger'
        AND thread.anchor->>'targetId' = mapping.source_id;

      DELETE FROM triggers trigger
      USING trigger_group_merge_map mapping
      WHERE trigger.id = mapping.source_id
        AND mapping.source_id <> mapping.retained_id;
    `,
  },
  {
    id: '202609010037_trigger_timers',
    sql: `
      ALTER TABLE triggers
      ADD COLUMN timer_seconds integer,
      ADD CONSTRAINT triggers_timer_seconds_non_negative
        CHECK (timer_seconds IS NULL OR timer_seconds >= 0);
    `,
  },
];
