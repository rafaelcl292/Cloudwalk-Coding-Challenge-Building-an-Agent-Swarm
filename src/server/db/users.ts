import { getDb, type Database } from "./client";
import type { UserRole, UserRow } from "./types";

export type UpsertUserInput = {
  clerkUserId: string;
  email?: string | null;
  role?: UserRole;
};

export async function upsertUser(input: UpsertUserInput, database: Database = getDb()) {
  const rows = await database<UserRow[]>`
    INSERT INTO users (clerk_user_id, email, role)
    VALUES (${input.clerkUserId}, ${input.email ?? null}, ${input.role ?? "user"})
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function getUserByClerkId(clerkUserId: string, database: Database = getDb()) {
  const rows = await database<UserRow[]>`
    SELECT *
    FROM users
    WHERE clerk_user_id = ${clerkUserId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}
