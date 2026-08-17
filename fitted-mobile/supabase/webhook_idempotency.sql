-- ============================================================
-- STRIPE WEBHOOK IDEMPOTENCY
-- Run in the Supabase SQL Editor (or applied via migration). Idempotent.
--
-- Stripe delivers webhook events at-least-once: the same event id can arrive
-- multiple times (retries, network hiccups). This table lets the webhook claim
-- an event id once and skip any duplicate delivery, so payments/onboarding are
-- never processed twice.
--
-- Service-role only: RLS on with no policies. The webhook uses the service role
-- (bypasses RLS); clients can never read or write it.
-- ============================================================

CREATE TABLE IF NOT EXISTS stripe_events (
    id           TEXT PRIMARY KEY,          -- Stripe event id (evt_...)
    type         TEXT,                       -- event type, for debugging
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
