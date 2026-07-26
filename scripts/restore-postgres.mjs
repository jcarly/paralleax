import { option, restoreBackup } from './postgres-operations.mjs';

if (!process.env.RESTORE_DATABASE_URL) {
  throw new Error('RESTORE_DATABASE_URL is required; DATABASE_URL is intentionally not used');
}

const args = process.argv.slice(2);
await restoreBackup({
  databaseUrl: process.env.RESTORE_DATABASE_URL,
  input: option(args, 'input'),
  confirmedDatabase: option(args, 'confirm-database'),
});

console.log('PostgreSQL restore completed and the archive was accepted');
