-- ============================================================
-- UGC MODERATION  (Apple Guideline 1.2: report content + block users)
-- Run in the Supabase SQL Editor / applied via migration. Idempotent.
--
--   reports        — user-filed reports of objectionable content/users.
--                    Insert-only for clients; reviewed via the service role.
--   blocked_users  — per-user block list. Owner-managed; used to hide a blocked
--                    user's content and prevent interaction.
-- ============================================================

-- ---------------- reports ----------------
CREATE TABLE IF NOT EXISTS reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type     TEXT NOT NULL,            -- 'post' | 'comment' | 'user' | 'message'
    content_id       TEXT,                     -- id of the reported content (null for a user report)
    reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason           TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'actioned'
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Clients may file reports as themselves. They cannot read/modify reports
-- (review happens via the service role / an admin tool).
DROP POLICY IF EXISTS "Users can file reports" ON reports;
CREATE POLICY "Users can file reports" ON reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ---------------- blocked_users ----------------
CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocks" ON blocked_users;
CREATE POLICY "Users can view own blocks" ON blocked_users
    FOR SELECT USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block" ON blocked_users;
CREATE POLICY "Users can block" ON blocked_users
    FOR INSERT WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock" ON blocked_users;
CREATE POLICY "Users can unblock" ON blocked_users
    FOR DELETE USING (auth.uid() = blocker_id);
