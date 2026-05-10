import { getDb, type Database } from "./client";
import type {
  ConversationChannel,
  ConversationRow,
  ConversationStatus,
  JsonValue,
  MessageRole,
  MessageRow,
} from "./types";

export type CreateConversationInput = {
  ownerUserId: string;
  channel?: ConversationChannel;
  title?: string | null;
};

export type AppendMessageInput = {
  conversationId: string;
  role: MessageRole;
  content: string;
  parts?: JsonValue;
  metadata?: JsonValue;
};

export async function createConversation(
  input: CreateConversationInput,
  database: Database = getDb(),
) {
  const rows = await database<ConversationRow[]>`
    INSERT INTO conversations (owner_user_id, channel, title)
    VALUES (${input.ownerUserId}, ${input.channel ?? "web"}, ${input.title ?? null})
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function listConversationsForUser(ownerUserId: string, database: Database = getDb()) {
  return database<ConversationRow[]>`
    SELECT *
    FROM conversations
    WHERE owner_user_id = ${ownerUserId}
    ORDER BY updated_at DESC
  `;
}

export async function getConversationForUser(
  conversationId: string,
  ownerUserId: string,
  database: Database = getDb(),
) {
  const rows = await database<ConversationRow[]>`
    SELECT *
    FROM conversations
    WHERE id = ${conversationId}
      AND owner_user_id = ${ownerUserId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus,
  database: Database = getDb(),
) {
  const rows = await database<ConversationRow[]>`
    UPDATE conversations
    SET status = ${status}
    WHERE id = ${conversationId}
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function appendMessage(input: AppendMessageInput, database: Database = getDb()) {
  const rows = await database<MessageRow[]>`
    INSERT INTO messages (conversation_id, role, content, parts, metadata)
    VALUES (
      ${input.conversationId},
      ${input.role},
      ${input.content},
      ${JSON.stringify(input.parts ?? [])}::jsonb,
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function listConversationMessages(
  conversationId: string,
  database: Database = getDb(),
) {
  return database<MessageRow[]>`
    SELECT *
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
  `;
}
