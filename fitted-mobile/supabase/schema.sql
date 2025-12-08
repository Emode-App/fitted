- Fitted Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/scvvbjheyfnxlsiiozta/sql/new

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    header_url TEXT,
    ai_face_url TEXT,
    bio TEXT DEFAULT '',
    location TEXT DEFAULT '',
    website TEXT,
    is_business_account BOOLEAN DEFAULT FALSE,
    is_verified_stylist BOOLEAN DEFAULT FALSE,
    rate TEXT,
    favorite_brand TEXT,
    favorite_song JSONB,
    socials JSONB,
    show_activity_status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    generated_image TEXT NOT NULL,
    board_image TEXT,
    caption TEXT DEFAULT '',
    items JSONB DEFAULT '[]',
    background_config JSONB,
    music JSONB,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FOLLOWS (Many-to-Many)
-- ============================================
CREATE TABLE follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- ============================================
-- LIKES
-- ============================================
CREATE TABLE likes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

-- ============================================
-- SAVED POSTS
-- ============================================
CREATE TABLE saved_posts (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

-- ============================================
-- COMMENTS
-- ============================================
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONVERSATIONS
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_ids UUID[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    payment_request JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WARDROBE FOLDERS
-- ============================================
CREATE TABLE wardrobe_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WARDROBE ASSETS
-- ============================================
CREATE TABLE wardrobe_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folder_id UUID REFERENCES wardrobe_folders(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    file_signature TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_assets ENABLE ROW LEVEL SECURITY;

-- USERS policies
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- POSTS policies
CREATE POLICY "Posts are viewable by everyone" ON posts FOR SELECT USING (true);
CREATE POLICY "Users can create own posts" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON posts FOR DELETE USING (auth.uid() = user_id);

-- FOLLOWS policies
CREATE POLICY "Follows are viewable by everyone" ON follows FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- LIKES policies
CREATE POLICY "Likes are viewable by everyone" ON likes FOR SELECT USING (true);
CREATE POLICY "Users can like posts" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON likes FOR DELETE USING (auth.uid() = user_id);

-- SAVED_POSTS policies
CREATE POLICY "Users can view own saved posts" ON saved_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save posts" ON saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave posts" ON saved_posts FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS policies
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);

-- CONVERSATIONS policies
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "Users can create conversations" ON conversations FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));

-- MESSAGES policies
CREATE POLICY "Users can view messages in their conversations" ON messages FOR SELECT 
    USING (EXISTS (SELECT 1 FROM conversations WHERE id = messages.conversation_id AND auth.uid() = ANY(participant_ids)));
CREATE POLICY "Users can send messages" ON messages FOR INSERT 
    WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)));

-- WARDROBE policies
CREATE POLICY "Users can view own wardrobe folders" ON wardrobe_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create wardrobe folders" ON wardrobe_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wardrobe folders" ON wardrobe_folders FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own wardrobe assets" ON wardrobe_assets FOR SELECT 
    USING (EXISTS (SELECT 1 FROM wardrobe_folders WHERE id = folder_id AND user_id = auth.uid()));
CREATE POLICY "Users can add wardrobe assets" ON wardrobe_assets FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM wardrobe_folders WHERE id = folder_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own wardrobe assets" ON wardrobe_assets FOR DELETE 
    USING (EXISTS (SELECT 1 FROM wardrobe_folders WHERE id = folder_id AND user_id = auth.uid()));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update likes_count on posts
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_like_change
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Function to create default wardrobe folders for new users
CREATE OR REPLACE FUNCTION create_default_wardrobe()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wardrobe_folders (user_id, name, is_default) VALUES
        (NEW.id, 'Last Used', TRUE),
        (NEW.id, 'Shirts', FALSE),
        (NEW.id, 'Jackets', FALSE),
        (NEW.id, 'Pants', FALSE),
        (NEW.id, 'Shoes', FALSE),
        (NEW.id, 'Accessories', FALSE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION create_default_wardrobe();
