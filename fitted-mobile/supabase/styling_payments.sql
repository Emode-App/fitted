-- ============================================
-- STYLING PAYMENTS SCHEMA
-- Run after schema.sql
-- ============================================

-- Add Stripe fields to users (for future Stripe Connect integration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'expired', 'canceled'));

-- ============================================
-- STYLING SESSIONS TABLE
-- Tracks completed styling transactions between stylists and clients
-- ============================================
CREATE TABLE IF NOT EXISTS styling_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stylist_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'declined', 'refunded')),
    stripe_payment_intent_id TEXT, -- for future Stripe integration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE styling_sessions ENABLE ROW LEVEL SECURITY;

-- Stylists and clients can view their own sessions
CREATE POLICY "Users can view own styling sessions" ON styling_sessions
    FOR SELECT USING (auth.uid() = stylist_id OR auth.uid() = client_id);

-- Only the system/stylist can create sessions (created when payment request is accepted)
CREATE POLICY "Stylists can create styling sessions" ON styling_sessions
    FOR INSERT WITH CHECK (auth.uid() = stylist_id OR auth.uid() = client_id);

-- Only participants can update session status
CREATE POLICY "Participants can update styling sessions" ON styling_sessions
    FOR UPDATE USING (auth.uid() = stylist_id OR auth.uid() = client_id);

-- ============================================
-- UPDATE POLICY FOR MESSAGES
-- Allow participants to update payment_request status on messages
-- ============================================
CREATE POLICY "Users can update messages in their conversations" ON messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE id = messages.conversation_id 
            AND auth.uid() = ANY(participant_ids)
        )
    );

-- ============================================
-- OUTFIT DELIVERY & FACE SHARING
-- Additional columns on messages for styling workflow
-- ============================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS styling_delivery JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS shared_face_url TEXT;
-- General photo attachments sent in a conversation (public URL in the `posts` bucket)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
