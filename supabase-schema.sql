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

-- =============================================
-- 12. Telegram Integration
-- =============================================

-- Add telegram fields to profiles for bot notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER DEFAULT 60;

-- 13. Calendar sessions table for scheduled appointments
CREATE TABLE IF NOT EXISTS calendar_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_name TEXT,
  session_type TEXT CHECK (session_type IN ('primary', 'followup', 'group', 'supervision', 'training')),
  session_date DATE NOT NULL,
  session_time TIME NOT NULL,
  duration INTEGER DEFAULT 60,
  notes TEXT,
  todoist_task_id TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for calendar_sessions
ALTER TABLE calendar_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own calendar sessions" ON calendar_sessions;
CREATE POLICY "Users can manage own calendar sessions" ON calendar_sessions
  FOR ALL USING (user_id = auth.uid());

-- Index for faster reminder queries
CREATE INDEX IF NOT EXISTS idx_calendar_sessions_datetime ON calendar_sessions(session_date, session_time);
CREATE INDEX IF NOT EXISTS idx_calendar_sessions_user_reminder ON calendar_sessions(user_id, reminder_sent);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_calendar_sessions_updated_at ON calendar_sessions;
CREATE TRIGGER update_calendar_sessions_updated_at
  BEFORE UPDATE ON calendar_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Function to get upcoming calendar sessions for reminders
CREATE OR REPLACE FUNCTION get_calendar_reminders(minutes_before INTEGER DEFAULT 60)
RETURNS TABLE (
  session_id UUID,
  user_id UUID,
  client_name TEXT,
  session_type TEXT,
  session_datetime TIMESTAMP WITH TIME ZONE,
  telegram_chat_id BIGINT,
  telegram_bot_token TEXT,
  notifications_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id as session_id,
    cs.user_id,
    cs.client_name,
    cs.session_type,
    (cs.session_date + cs.session_time)::timestamp with time zone as session_datetime,
    p.telegram_chat_id,
    p.telegram_bot_token,
    p.telegram_notifications_enabled as notifications_enabled
  FROM calendar_sessions cs
  JOIN profiles p ON cs.user_id = p.id
  WHERE
    cs.reminder_sent = false
    AND p.telegram_chat_id IS NOT NULL
    AND p.telegram_bot_token IS NOT NULL
    AND p.telegram_notifications_enabled = true
    AND (cs.session_date + cs.session_time)::timestamp with time zone
        BETWEEN NOW() AND NOW() + (minutes_before || ' minutes')::interval;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 15. Todoist Integration
-- =============================================

-- Add todoist API key to profiles for task sync
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_enabled BOOLEAN DEFAULT false;
