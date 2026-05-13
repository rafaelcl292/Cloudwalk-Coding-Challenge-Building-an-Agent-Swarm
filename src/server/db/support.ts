import { getDb, type Database } from "./client";
import type {
  AccountStatus,
  CustomerProfileRow,
  CustomerTransactionRow,
  JsonValue,
  SupportTicketRow,
  TicketPriority,
} from "./types";

export type SupportProblemKind =
  | "blocked_account"
  | "password_reset"
  | "payout_failed"
  | "payment_declined"
  | "kyc_review";

export type CreateSupportTicketInput = {
  customerId: string;
  subject: string;
  priority?: TicketPriority;
  summary?: string | null;
};

export type UpdateCustomerProfileInput = {
  name?: string;
  email?: string | null;
  accountStatus?: AccountStatus;
  plan?: string;
  dailyPayoutCents?: number;
  monthlyVolumeCents?: number;
  availableBalanceCents?: number;
  pendingBalanceCents?: number;
  reservedBalanceCents?: number;
  lastPayoutCents?: number;
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

export async function getCustomerProfileByUserId(userId: string, database: Database = getDb()) {
  const rows = await database<CustomerProfileRow[]>`
    SELECT *
    FROM customer_profiles
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function ensureCustomerProfileForUser(
  input: {
    userId: string;
    clerkUserId: string;
    name?: string | null;
    email?: string | null;
  },
  database: Database = getDb(),
) {
  const existing = await getCustomerProfileByUserId(input.userId, database);

  if (existing) {
    const clerkName = input.name?.trim();
    const clerkEmail = input.email?.trim();
    const shouldUseClerkName = clerkName && existing.name === "Demo Merchant";
    const shouldUseClerkEmail = clerkEmail && !existing.email;
    const existingLimits = readSupportLimits(existing.limits);
    const shouldBackfillLimits = !hasAllSupportLimitFields(existing.limits);

    if (!shouldUseClerkName && !shouldUseClerkEmail && !shouldBackfillLimits) {
      return existing;
    }

    const limits = shouldBackfillLimits
      ? { ...randomInitialAccountValues(), ...existingLimits }
      : existingLimits;

    const rows = await database<CustomerProfileRow[]>`
      UPDATE customer_profiles
      SET
        name = ${shouldUseClerkName ? clerkName : existing.name},
        email = ${shouldUseClerkEmail ? clerkEmail : existing.email},
        limits = ${JSON.stringify(limits)}::jsonb
      WHERE id = ${existing.id}
      RETURNING *
    `;

    return rows[0] ?? existing;
  }

  const initialAccountValues = randomInitialAccountValues();
  const rows = await database<CustomerProfileRow[]>`
    INSERT INTO customer_profiles (
      user_id,
      external_customer_id,
      name,
      email,
      account_status,
      plan,
      limits,
      support_flags
    )
    VALUES (
      ${input.userId},
      ${`clerk:${input.clerkUserId}`},
      ${input.name?.trim() || "Demo Merchant"},
      ${input.email?.trim() || null},
      'active',
      'InfinitePay Pro',
      ${JSON.stringify(initialAccountValues)}::jsonb,
      ARRAY[]::text[]
    )
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function updateCustomerProfileForUser(
  userId: string,
  input: UpdateCustomerProfileInput,
  database: Database = getDb(),
) {
  const existing = await getCustomerProfileByUserId(userId, database);
  if (!existing) return null;

  const existingLimits = readSupportLimits(existing.limits);
  const nextLimits = {
    ...existingLimits,
    ...(input.dailyPayoutCents === undefined ? {} : { dailyPayoutCents: input.dailyPayoutCents }),
    ...(input.monthlyVolumeCents === undefined
      ? {}
      : { monthlyVolumeCents: input.monthlyVolumeCents }),
    ...(input.availableBalanceCents === undefined
      ? {}
      : { availableBalanceCents: input.availableBalanceCents }),
    ...(input.pendingBalanceCents === undefined
      ? {}
      : { pendingBalanceCents: input.pendingBalanceCents }),
    ...(input.reservedBalanceCents === undefined
      ? {}
      : { reservedBalanceCents: input.reservedBalanceCents }),
    ...(input.lastPayoutCents === undefined ? {} : { lastPayoutCents: input.lastPayoutCents }),
  };

  const rows = await database<CustomerProfileRow[]>`
    UPDATE customer_profiles
    SET
      name = ${input.name?.trim() || existing.name},
      email = ${input.email === undefined ? existing.email : input.email?.trim() || null},
      account_status = ${input.accountStatus ?? existing.account_status},
      plan = ${input.plan?.trim() || existing.plan},
      limits = ${JSON.stringify(nextLimits)}::jsonb
    WHERE user_id = ${userId}
    RETURNING *
  `;

  return rows[0] ?? null;
}

export function normalizeSupportLimits(value: JsonValue) {
  return readSupportLimits(value);
}

export async function applySupportProblemForUser(
  userId: string,
  kind: SupportProblemKind,
  database: Database = getDb(),
) {
  const profile = await getCustomerProfileByUserId(userId, database);
  if (!profile) return null;

  const config = supportProblemConfig(kind);

  const rows = await database<CustomerProfileRow[]>`
    UPDATE customer_profiles
    SET
      account_status = ${config.accountStatus},
      support_flags = ${database.array(config.supportFlags, "TEXT")}
    WHERE id = ${profile.id}
    RETURNING *
  `;

  const updated = rows[0] ?? profile;

  if (config.transaction) {
    await database`
      INSERT INTO customer_transactions (
        customer_id,
        transaction_type,
        amount_cents,
        currency,
        status,
        failure_reason,
        occurred_at
      )
      VALUES (
        ${updated.id},
        ${config.transaction.type},
        ${config.transaction.amountCents},
        'BRL',
        ${config.transaction.status},
        ${config.transaction.failureReason},
        now()
      )
    `;
  }

  const ticket = await createSupportTicket(
    {
      customerId: updated.id,
      subject: config.subject,
      priority: config.priority,
      summary: config.summary,
    },
    database,
  );

  return { profile: updated, ticket };
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

function supportProblemConfig(kind: SupportProblemKind) {
  switch (kind) {
    case "blocked_account":
      return {
        accountStatus: "blocked" as const,
        supportFlags: ["blocked_account", "human_handoff_required"],
        subject: "Account blocked",
        priority: "urgent" as const,
        summary: "The merchant account is blocked and requires support validation.",
        transaction: {
          type: "payout" as const,
          amountCents: 150_000,
          status: "failed" as const,
          failureReason: "account_blocked",
        },
      };
    case "password_reset":
      return {
        accountStatus: "active" as const,
        supportFlags: ["password_reset_requested"],
        subject: "Password reset requested",
        priority: "normal" as const,
        summary: "The merchant cannot access the account and needs guided password recovery.",
        transaction: null,
      };
    case "payout_failed":
      return {
        accountStatus: "review" as const,
        supportFlags: ["recent_transfer_failures", "manual_review"],
        subject: "Payout failure",
        priority: "high" as const,
        summary: "Recent payout failed and the account should be checked before retry advice.",
        transaction: {
          type: "payout" as const,
          amountCents: 120_000,
          status: "failed" as const,
          failureReason: "manual_review_required",
        },
      };
    case "payment_declined":
      return {
        accountStatus: "active" as const,
        supportFlags: ["recent_payment_declines"],
        subject: "Payment declined",
        priority: "normal" as const,
        summary: "Recent card payment was declined; standard checks can be suggested.",
        transaction: {
          type: "payment" as const,
          amountCents: 9_990,
          status: "failed" as const,
          failureReason: "issuer_declined",
        },
      };
    case "kyc_review":
      return {
        accountStatus: "review" as const,
        supportFlags: ["kyc_review", "identity_review"],
        subject: "KYC review pending",
        priority: "high" as const,
        summary: "Identity verification is pending and account actions need human review.",
        transaction: null,
      };
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSupportLimits(value: JsonValue) {
  const parsed = typeof value === "string" ? parseJsonObject(value) : value;
  const record = isPlainRecord(parsed) ? parsed : {};

  return {
    monthlyVolumeCents: readCents(record.monthlyVolumeCents),
    dailyPayoutCents: readCents(record.dailyPayoutCents),
    availableBalanceCents: readCents(record.availableBalanceCents),
    pendingBalanceCents: readCents(record.pendingBalanceCents),
    reservedBalanceCents: readCents(record.reservedBalanceCents),
    lastPayoutCents: readCents(record.lastPayoutCents),
    currency: typeof record.currency === "string" ? record.currency : "BRL",
  };
}

function hasAllSupportLimitFields(value: JsonValue) {
  const parsed = typeof value === "string" ? parseJsonObject(value) : value;
  const record = isPlainRecord(parsed) ? parsed : {};

  return (
    "monthlyVolumeCents" in record &&
    "dailyPayoutCents" in record &&
    "availableBalanceCents" in record &&
    "pendingBalanceCents" in record &&
    "reservedBalanceCents" in record &&
    "lastPayoutCents" in record
  );
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  return 0;
}

function randomInitialAccountValues() {
  const monthlyVolumeCents = randomCents(800_000, 8_000_000, 10_000);
  const dailyPayoutCents = randomCents(80_000, 600_000, 5_000);
  const availableBalanceCents = randomCents(25_000, 900_000, 1_000);
  const pendingBalanceCents = randomCents(0, 350_000, 1_000);
  const reservedBalanceCents = randomCents(0, 120_000, 1_000);
  const lastPayoutCents = randomCents(0, 450_000, 1_000);

  return {
    monthlyVolumeCents,
    dailyPayoutCents,
    availableBalanceCents,
    pendingBalanceCents,
    reservedBalanceCents,
    lastPayoutCents,
    currency: "BRL",
  };
}

function randomCents(min: number, max: number, step: number) {
  const slots = Math.floor((max - min) / step);
  return min + Math.floor(Math.random() * (slots + 1)) * step;
}
