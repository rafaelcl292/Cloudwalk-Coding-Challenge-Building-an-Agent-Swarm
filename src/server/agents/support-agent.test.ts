import { describe, expect, test } from "bun:test";
import type { CustomerProfileRow, CustomerTransactionRow, SupportTicketRow } from "../db";
import { summarizeAccountIssue } from "./support-agent";

const now = new Date("2026-01-01T00:00:00Z");

describe("support agent issue summary", () => {
  test("does not require handoff for blocked demo accounts", () => {
    const summary = summarizeAccountIssue({
      profile: profile({ account_status: "blocked" }),
      transactions: [],
      tickets: [],
    });

    expect(summary.handoffRequired).toBeFalse();
    expect(summary.handoffReason).toBeNull();
  });

  test("does not require handoff for repeated demo transaction failures", () => {
    const summary = summarizeAccountIssue({
      profile: profile({ account_status: "active" }),
      transactions: [
        transaction({ status: "failed", failure_reason: "Insufficient balance" }),
        transaction({ status: "failed", failure_reason: "Limit exceeded" }),
      ],
      tickets: [],
    });

    expect(summary.handoffRequired).toBeFalse();
    expect(summary.handoffReason).toBeNull();
  });

  test("does not require handoff for healthy active accounts", () => {
    const summary = summarizeAccountIssue({
      profile: profile({ account_status: "active" }),
      transactions: [transaction({ status: "approved" })],
      tickets: [ticket()],
    });

    expect(summary.handoffRequired).toBeFalse();
    expect(summary.summary).toContain("No automatic handoff trigger");
  });
});

function profile(overrides: Partial<CustomerProfileRow>): CustomerProfileRow {
  return {
    id: "customer_1",
    user_id: null,
    external_customer_id: "client789",
    name: "Test Customer",
    email: "customer@example.com",
    account_status: "active",
    plan: "InfinitePay Pro",
    limits: {},
    support_flags: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function transaction(overrides: Partial<CustomerTransactionRow>): CustomerTransactionRow {
  return {
    id: crypto.randomUUID(),
    customer_id: "customer_1",
    transaction_type: "payout",
    amount_cents: 1000,
    currency: "BRL",
    status: "approved",
    failure_reason: null,
    occurred_at: now,
    created_at: now,
    ...overrides,
  };
}

function ticket(overrides: Partial<SupportTicketRow> = {}): SupportTicketRow {
  return {
    id: "ticket_1",
    customer_id: "customer_1",
    subject: "Login issue",
    status: "open",
    priority: "normal",
    summary: "Customer cannot sign in.",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
