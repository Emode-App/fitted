-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Run this in the Supabase SQL Editor AFTER schema.sql / styling_payments.sql.
-- It is written to be idempotent: safe to run more than once.
--
-- Fixes:
--   CRIT-1  Block clients from self-granting entitlements (verified/business/pro)
--   HIGH-1  Stop anon from reading every user's email + Stripe IDs
--   HIGH-4  Stop conversation participants from editing each other's messages
--   CRIT-4  Private storage bucket for DM media + face photos
-- ============================================================

-- ------------------------------------------------------------
-- CRIT-1: Protect monetised flags on `users`
-- These columns stay on `users` (they are public badges) but may only be
-- changed by the service role (the sync-entitlement edge function), never by
-- a normal authenticated client editing its own row.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_user_entitlement_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- auth.role() = 'service_role' only when the request uses the service key
    -- (i.e. the sync-entitlement edge function after verifying with RevenueCat).
    -- Normal clients may turn an entitlement OFF (a harmless self-downgrade) but
    -- may never turn one ON — that requires a verified purchase via the server.
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        IF NEW.is_verified_stylist = TRUE AND OLD.is_verified_stylist IS DISTINCT FROM TRUE THEN
            NEW.is_verified_stylist := OLD.is_verified_stylist;
        END IF;
        IF NEW.is_business_account = TRUE AND OLD.is_business_account IS DISTINCT FROM TRUE THEN
            NEW.is_business_account := OLD.is_business_account;
        END IF;
        -- Clients may only reset subscription_status to 'none'; any elevation
        -- (active / pro_tryons) must come from the server.
        IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
           AND NEW.subscription_status <> 'none' THEN
            NEW.subscription_status := OLD.subscription_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_user_entitlements ON users;
CREATE TRIGGER protect_user_entitlements
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION protect_user_entitlement_columns();

-- Allow 'pro_tryons' as a subscription_status value (the app writes it but the
-- original CHECK constraint rejected it).
DO $$
DECLARE
    con_name TEXT;
BEGIN
    SELECT conname INTO con_name
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%subscription_status%';
    IF con_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', con_name);
    END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
    CHECK (subscription_status IN ('none', 'active', 'expired', 'canceled', 'pro_tryons'));

-- ------------------------------------------------------------
-- HIGH-1: Move email + Stripe identifiers off the publicly-readable `users`
-- table into a private 1:1 table that only the owner (and service role) can read.
-- `users` keeps the public profile fields + public badges.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private_users (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    stripe_account_id TEXT,
    stripe_customer_id TEXT,
    stripe_onboarding_complete BOOLEAN DEFAULT FALSE
);

ALTER TABLE private_users ENABLE ROW LEVEL SECURITY;

-- Only the owner can read their private row. No INSERT/UPDATE/DELETE policy
-- exists, so writes are possible ONLY via the service role (edge functions).
DROP POLICY IF EXISTS "Owner can read private row" ON private_users;
CREATE POLICY "Owner can read private row" ON private_users
    FOR SELECT USING (auth.uid() = id);

-- Backfill from existing columns (guarded so it works before/after the drop).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        INSERT INTO private_users (id, email, stripe_account_id, stripe_customer_id, stripe_onboarding_complete)
        SELECT id, email, stripe_account_id, stripe_customer_id, stripe_onboarding_complete
        FROM users
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            stripe_account_id = EXCLUDED.stripe_account_id,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_onboarding_complete = EXCLUDED.stripe_onboarding_complete;
    END IF;
END $$;

-- Auto-create the private row whenever a new user profile is created.
-- Email is sourced from auth.users so the client never has to send it.
CREATE OR REPLACE FUNCTION create_private_user_row()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO private_users (id, email)
    VALUES (NEW.id, (SELECT email FROM auth.users WHERE id = NEW.id))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_private ON users;
CREATE TRIGGER on_user_created_private
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_private_user_row();

-- Now remove the sensitive columns from the publicly-readable table.
ALTER TABLE users DROP COLUMN IF EXISTS email;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_onboarding_complete;

-- ------------------------------------------------------------
-- HIGH-4: Stop participants from editing each other's messages.
-- The existing UPDATE policy lets any participant update ANY column of ANY
-- message in the conversation. Restrict client updates to is_read (read
-- receipts) and payment_request (accept/decline). Content fields and sender_id
-- become immutable from the client; only the service role may change them.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_message_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        NEW.sender_id        := OLD.sender_id;
        NEW.conversation_id  := OLD.conversation_id;
        NEW.text             := OLD.text;
        NEW.image_url        := OLD.image_url;
        NEW.shared_face_url  := OLD.shared_face_url;
        NEW.styling_delivery := OLD.styling_delivery;
        NEW.created_at       := OLD.created_at;
        -- is_read and payment_request remain client-updatable (by participants,
        -- as enforced by the existing RLS USING clause).
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_messages ON messages;
CREATE TRIGGER protect_messages
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION protect_message_columns();

-- ------------------------------------------------------------
-- MED-3 (light): keep conversations to exactly two real participants and force
-- the creator to be one of them. Prevents stuffing arbitrary IDs into the array.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (
        auth.uid() = ANY(participant_ids)
        AND array_length(participant_ids, 1) = 2
    );

-- ------------------------------------------------------------
-- CRIT-4: Private storage bucket for DM media + face photos.
-- Public profile/feed images stay in the existing public buckets; only private
-- conversation media and biometric face photos move here.
-- Layout:
--   private-media/messages/{conversationId}/...   (readable by participants)
--   private-media/faces/{userId}/...              (readable by owner only)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('private-media', 'private-media', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- DM media: any participant of the conversation in the path may read/insert.
DROP POLICY IF EXISTS "DM media readable by participants" ON storage.objects;
CREATE POLICY "DM media readable by participants" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'messages'
        AND EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = ((storage.foldername(name))[2])::uuid
              AND auth.uid() = ANY(c.participant_ids)
        )
    );

DROP POLICY IF EXISTS "DM media writable by participants" ON storage.objects;
CREATE POLICY "DM media writable by participants" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'messages'
        AND EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = ((storage.foldername(name))[2])::uuid
              AND auth.uid() = ANY(c.participant_ids)
        )
    );

-- Face photos: only the owner (folder = their uid) may read/insert/update.
DROP POLICY IF EXISTS "Face photos owned by user" ON storage.objects;
CREATE POLICY "Face photos owned by user" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'faces'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Face photos writable by owner" ON storage.objects;
CREATE POLICY "Face photos writable by owner" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'faces'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Face photos updatable by owner" ON storage.objects;
CREATE POLICY "Face photos updatable by owner" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'private-media'
        AND (storage.foldername(name))[1] = 'faces'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

-- ------------------------------------------------------------
-- Notes (not enforced here, see SECURITY_FIXES.md):
--   * styling_sessions remains participant-writable for the in-app (simulated)
--     accept flow. Real-money status is authoritative only via the Stripe
--     webhook. Do not treat client-written session rows as proof of payment.
-- ------------------------------------------------------------
