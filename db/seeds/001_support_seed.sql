WITH customer AS (
  INSERT INTO customer_profiles (
    external_customer_id,
    name,
    email,
    account_status,
    plan,
    limits,
    support_flags
  )
  VALUES
    (
      'client789',
      'Marina Silva',
      'marina.silva@example.com',
      'review',
      'InfinitePay Pro',
      '{"monthlyVolumeCents": 2500000, "dailyPayoutCents": 0}'::jsonb,
      ARRAY['kyc_review', 'recent_transfer_failures']
    ),
    (
      'cust_active_001',
      'Ana Ribeiro',
      'ana.ribeiro@example.com',
      'active',
      'InfinitePay Pro',
      '{"monthlyVolumeCents": 5000000, "dailyPayoutCents": 250000}'::jsonb,
      ARRAY['vip']
    ),
    (
      'cust_review_002',
      'Bruno Costa',
      'bruno.costa@example.com',
      'review',
      'InfinitePay Starter',
      '{"monthlyVolumeCents": 1200000, "dailyPayoutCents": 80000}'::jsonb,
      ARRAY['kyc_review', 'recent_failures']
    ),
    (
      'cust_blocked_003',
      'Carla Souza',
      'carla.souza@example.com',
      'blocked',
      'InfinitePay Pro',
      '{"monthlyVolumeCents": 3000000, "dailyPayoutCents": 0}'::jsonb,
      ARRAY['blocked_account', 'human_handoff_required']
    )
  ON CONFLICT (external_customer_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    account_status = EXCLUDED.account_status,
    plan = EXCLUDED.plan,
    limits = EXCLUDED.limits,
    support_flags = EXCLUDED.support_flags
  RETURNING id, external_customer_id
)
INSERT INTO customer_transactions (
  customer_id,
  transaction_type,
  amount_cents,
  currency,
  status,
  failure_reason,
  occurred_at
)
SELECT customer.id, tx.transaction_type, tx.amount_cents, 'BRL', tx.status, tx.failure_reason, tx.occurred_at
FROM customer
JOIN (
  VALUES
    ('cust_active_001', 'payment', 12990, 'approved', NULL, '2026-04-28T14:20:00Z'::timestamptz),
    ('cust_active_001', 'payout', 87500, 'approved', NULL, '2026-04-29T09:10:00Z'::timestamptz),
    ('client789', 'payout', 120000, 'failed', 'kyc_review_required', '2026-04-29T11:30:00Z'::timestamptz),
    ('client789', 'payout', 85000, 'failed', 'daily_payout_limit_blocked_during_review', '2026-04-30T10:05:00Z'::timestamptz),
    ('cust_review_002', 'payment', 4990, 'failed', 'issuer_declined', '2026-04-27T18:45:00Z'::timestamptz),
    ('cust_review_002', 'payment', 4990, 'failed', 'risk_review', '2026-04-28T10:12:00Z'::timestamptz),
    ('cust_blocked_003', 'payout', 150000, 'failed', 'account_blocked', '2026-04-26T12:00:00Z'::timestamptz)
) AS tx(external_customer_id, transaction_type, amount_cents, status, failure_reason, occurred_at)
  ON tx.external_customer_id = customer.external_customer_id
WHERE NOT EXISTS (
  SELECT 1
  FROM customer_transactions existing
  WHERE existing.customer_id = customer.id
    AND existing.transaction_type = tx.transaction_type
    AND existing.amount_cents = tx.amount_cents
    AND existing.occurred_at = tx.occurred_at
);

WITH customer AS (
  SELECT id, external_customer_id
  FROM customer_profiles
  WHERE external_customer_id IN ('client789', 'cust_active_001', 'cust_review_002', 'cust_blocked_003')
)
INSERT INTO support_tickets (
  customer_id,
  subject,
  status,
  priority,
  summary
)
SELECT customer.id, ticket.subject, ticket.status, ticket.priority, ticket.summary
FROM customer
JOIN (
  VALUES
    (
      'client789',
      'Transfer failures during account review',
      'open',
      'high',
      'Customer has repeated payout failures while KYC review is pending; route transfer questions to human support if unresolved.'
    ),
    (
      'cust_review_002',
      'Payment failures under review',
      'open',
      'high',
      'Customer has repeated declined payments and should be routed to support if failures continue.'
    ),
    (
      'cust_blocked_003',
      'Blocked payout investigation',
      'open',
      'urgent',
      'Account is blocked and any payout request requires human handoff.'
    )
) AS ticket(external_customer_id, subject, status, priority, summary)
  ON ticket.external_customer_id = customer.external_customer_id
WHERE NOT EXISTS (
  SELECT 1
  FROM support_tickets existing
  WHERE existing.customer_id = customer.id
    AND existing.subject = ticket.subject
);
