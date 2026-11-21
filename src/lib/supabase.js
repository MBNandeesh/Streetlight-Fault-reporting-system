import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The app is useless without the backend, so the UI refuses to render
// until both values are present instead of failing with cryptic errors.
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured ? createClient(url, anonKey) : null

export const PHOTO_BUCKET = 'streetlight-photos'
