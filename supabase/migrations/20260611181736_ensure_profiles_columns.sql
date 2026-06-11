-- Ensure profiles table has all required columns
-- Add total_xp column if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0 NOT NULL;

-- Add level column if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1 NOT NULL;

-- Create index on profiles.id for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
