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
      DELETE FROM stories;

      ALTER TABLE stories
      DROP COLUMN data,
      ADD COLUMN title text NOT NULL;

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
      DELETE FROM stories;
      DELETE FROM users WHERE id = 'migration-user';

      ALTER TABLE stories ADD COLUMN revision integer NOT NULL DEFAULT 1;
      DROP TABLE trigger_conditions;

      ALTER TABLE interactions
      ADD CONSTRAINT interactions_story_id_id_unique UNIQUE (story_id, id);

      ALTER TABLE triggers
      DROP CONSTRAINT triggers_output_interaction_id_fkey,
      ADD COLUMN story_id text NOT NULL,
      ADD COLUMN conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD CONSTRAINT triggers_conditions_array CHECK (jsonb_typeof(conditions) = 'array'),
      ADD CONSTRAINT triggers_story_id_id_unique UNIQUE (story_id, id),
      ADD CONSTRAINT triggers_output_interaction_fkey
        FOREIGN KEY (story_id, output_interaction_id)
        REFERENCES interactions(story_id, id) ON DELETE CASCADE;

      ALTER TABLE trigger_inputs
      DROP CONSTRAINT trigger_inputs_trigger_id_fkey,
      DROP CONSTRAINT trigger_inputs_input_interaction_id_fkey,
      ADD COLUMN story_id text NOT NULL,
      ADD CONSTRAINT trigger_inputs_trigger_fkey
        FOREIGN KEY (story_id, trigger_id)
        REFERENCES triggers(story_id, id) ON DELETE CASCADE,
      ADD CONSTRAINT trigger_inputs_interaction_fkey
        FOREIGN KEY (story_id, input_interaction_id)
        REFERENCES interactions(story_id, id) ON DELETE CASCADE;

      CREATE INDEX triggers_story_id_idx ON triggers(story_id);
      CREATE INDEX trigger_inputs_story_id_idx ON trigger_inputs(story_id);
    `,
  },
];
