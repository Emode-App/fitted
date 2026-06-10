- Fix RLS policy for user signup
-- Run this in Supabase SQL Editor

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

-- Create a new policy that allows any authenticated user to insert their own profile
-- This works because auth.uid() is available immediately after signup
CREATE POLICY "Users can insert own profile" ON users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Alternative: If still having issues, you can temporarily allow all authenticated inserts
-- DROP POLICY IF EXISTS "Users can insert own profile" ON users;
-- CREATE POLICY "Users can insert own profile" ON users 
-- FOR INSERT 
-- TO authenticated
-- WITH CHECK (true);
