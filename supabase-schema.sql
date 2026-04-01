-- =============================================
-- WebinarStudio SaaS - Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Profiles table - stores user profile data
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT DEFAULT 'психолог',
  photo_url TEXT,
  phone TEXT,
  telegram TEXT,
  instagram TEXT,
  youtube TEXT,
  facebook TEXT,
  website TEXT,
  support_link TEXT,
  brand_color TEXT DEFAULT '#3b82f6',
  watermark_text TEXT,
  splash_text TEXT DEFAULT 'Скоро начнём',
  -- Legal info
  legal_name TEXT,
  legal_address TEXT,
  legal_email TEXT,
  privacy_policy_url TEXT,
  offer_url TEXT,
  disclaimer_url TEXT,
  -- Subscription
  subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'pro', 'business')),
  subscription_until TIMESTAMP WITH TIME ZONE,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for profiles
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Add user_id column to waiting_clients for isolation
ALTER TABLE waiting_clients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE waiting_clients ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- 5. RLS for waiting_clients - each psychologist sees only their clients
ALTER TABLE waiting_clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "psychologist sees own clients" ON waiting_clients;

-- Create new policy
CREATE POLICY "psychologist sees own clients" ON waiting_clients
  FOR ALL USING (
    user_id = auth.uid() OR user_id IS NULL
  );

-- 6. Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policy for avatars
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- 8. Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'title', 'психолог')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Trigger for auto profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. Index for faster queries
CREATE INDEX IF NOT EXISTS idx_waiting_clients_user_id ON waiting_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_waiting_clients_status ON waiting_clients(status);

-- 11. Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
