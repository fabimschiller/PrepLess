import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL oder Anon Key fehlt. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in .env.local setzen.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
