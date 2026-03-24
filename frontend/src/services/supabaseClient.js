import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim()

export const hasSupabaseAuthConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseAuthConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
