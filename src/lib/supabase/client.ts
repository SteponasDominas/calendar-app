import { createClient } from '@supabase/supabase-js'

import { appEnv } from '@/config/env'
import type { Database } from '@/types/database'

export const supabase = appEnv.isSupabaseConfigured
  ? createClient<Database>(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null
