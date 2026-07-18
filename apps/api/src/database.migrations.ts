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
];
