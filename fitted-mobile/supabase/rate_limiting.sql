-- ============================================================
-- RATE LIMITING
-- Run this in the Supabase SQL Editor (after security_hardening.sql).
-- Idempotent: safe to run more than once.
--
-- Provides a per-user, per-action fixed-window counter used by the edge
-- functions that proxy paid third-party APIs (Gemini image generation, Gemini
-- search, RapidAPI/KicksDB). Without this, any authenticated client can call
-- those endpoints in a loop and run up an unbounded upstream bill.
--
-- The table is service-role only: clients can never read or write it directly,
-- and the counter is incremented atomically inside check_rate_limit().
-- ============================================================

-- ------------------------------------------------------------
-- Counter table. One live row per (user, action) — older windows are pruned
-- on each call, so the table never grows unboundedly.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
    user_id      UUID        NOT NULL,
    action       TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, action, window_start)
);

-- RLS on with NO policies => no anon/authenticated access whatsoever.
-- The service role (edge functions) bypasses RLS.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- check_rate_limit(user, action, max, window_seconds)
-- Atomically increments the current fixed window and reports whether the
-- caller is still within budget. Returns:
--   { allowed: bool, count: int, limit: int, remaining: int, reset_at: ts }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id        UUID,
    p_action         TEXT,
    p_max            INTEGER,
    p_window_seconds INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count        INTEGER;
BEGIN
    -- Snap "now" down to the start of the current fixed window.
    v_window_start := to_timestamp(
        floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
    );

    -- Drop this user's expired windows for this action (cheap bounded cleanup).
    DELETE FROM rate_limits
    WHERE user_id = p_user_id
      AND action = p_action
      AND window_start < v_window_start;

    -- Atomic increment of the current window.
    INSERT INTO rate_limits (user_id, action, window_start, count)
    VALUES (p_user_id, p_action, v_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count INTO v_count;

    RETURN jsonb_build_object(
        'allowed',   v_count <= p_max,
        'count',     v_count,
        'limit',     p_max,
        'remaining', greatest(p_max - v_count, 0),
        'reset_at',  v_window_start + make_interval(secs => p_window_seconds)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the service role may call it (edge functions). Clients must never be able
-- to poke the limiter directly.
REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;
