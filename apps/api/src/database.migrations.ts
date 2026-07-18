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
];
