import { createBackup, hasFlag, option } from './postgres-operations.mjs';

const databaseUrl = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('BACKUP_DATABASE_URL or DATABASE_URL is required');
}

const target = await createBackup({
  databaseUrl,
  output: option(process.argv.slice(2), 'output'),
  overwrite: hasFlag(process.argv.slice(2), 'overwrite'),
});

console.log(`PostgreSQL backup verified and written to ${target}`);
