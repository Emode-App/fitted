-- Migration: Add board_image, background_config, and music columns to posts table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Add board_image column (stores the captured fit board image)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS board_image TEXT;

-- Add background_config column (stores background settings)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS background_config JSONB;

-- Add music column (stores selected song)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS music JSONB;

-- Verify the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'posts' 
  AND column_name IN ('board_image', 'background_config', 'music');
