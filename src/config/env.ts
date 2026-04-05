import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  VITE_BASE_PATH: z.string().optional(),
  VITE_ENABLE_MOCK_FALLBACK: z.string().optional(),
})

const parsedEnv = envSchema.safeParse(import.meta.env)

if (!parsedEnv.success) {
  console.error('Invalid Vite environment variables detected.', parsedEnv.error.flatten().fieldErrors)
}

const env = parsedEnv.success ? parsedEnv.data : {}

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback
  }

  return value.toLowerCase() !== 'false'
}

const normalizeBasePath = (value: string | undefined): string => {
  if (!value) {
    return '/'
  }

  if (!value.startsWith('/')) {
    return `/${value}`
  }

  return value.endsWith('/') ? value : `${value}/`
}

const supabaseUrl = env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? ''

export const appEnv = {
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  basePath: normalizeBasePath(env.VITE_BASE_PATH),
  enableMockFallback: toBoolean(env.VITE_ENABLE_MOCK_FALLBACK, false),
} as const
