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
];
