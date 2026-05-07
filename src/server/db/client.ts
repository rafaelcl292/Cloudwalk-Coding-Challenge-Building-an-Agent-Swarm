import type { SQL } from "bun";

export type Database = SQL;

export function getDb(): Database {
  return Bun.sql;
}

export function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database operations.");
  }

  return databaseUrl;
}
