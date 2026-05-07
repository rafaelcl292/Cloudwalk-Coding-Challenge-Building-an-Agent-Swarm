import { getDb, type Database } from "./client";
import type {
  CustomerProfileRow,
  CustomerTransactionRow,
  SupportTicketRow,
  TicketPriority,
} from "./types";

export type CreateSupportTicketInput = {
  customerId: string;
  subject: string;
  priority?: TicketPriority;
  summary?: string | null;
};

export async function getCustomerProfileByExternalId(
  externalCustomerId: string,
  database: Database = getDb(),
) {
  const rows = await database<CustomerProfileRow[]>`
    SELECT *
    FROM customer_profiles
    WHERE external_customer_id = ${externalCustomerId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getRecentTransactions(
  customerId: string,
  limit = 10,
  database: Database = getDb(),
) {
  return database<CustomerTransactionRow[]>`
    SELECT *
    FROM customer_transactions
    WHERE customer_id = ${customerId}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
}

export async function getOpenTickets(customerId: string, database: Database = getDb()) {
  return database<SupportTicketRow[]>`
    SELECT *
    FROM support_tickets
    WHERE customer_id = ${customerId}
      AND status IN ('open', 'pending_customer')
    ORDER BY created_at DESC
  `;
}

export async function createSupportTicket(
  input: CreateSupportTicketInput,
  database: Database = getDb(),
) {
  const rows = await database<SupportTicketRow[]>`
    INSERT INTO support_tickets (customer_id, subject, priority, summary)
    VALUES (
      ${input.customerId},
      ${input.subject},
      ${input.priority ?? "normal"},
      ${input.summary ?? null}
    )
    RETURNING *
  `;

  return rows[0] ?? null;
}
