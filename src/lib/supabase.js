import { createClient } from '@supabase/supabase-js'

// ── Replace these with your actual Supabase project values ──────────────────
// You can find them at: https://supabase.com/dashboard → Project Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://joilvslvsioayrjshuxg.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_aozkBamT5C58KY03X9kUgA_iehy73ZU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Storage bucket name (create this in Supabase → Storage) ─────────────────
export const BUCKET = 'news-photos'

// ── Table name (run the SQL migration below to create it) ────────────────────
export const TABLE = 'news_articles'

// ── Homepage slideshow (see supabase-homepage-slides.sql) ────────────────────
export const HOMEPAGE_BUCKET = 'homepage-photos'
export const HOMEPAGE_SLIDES_TABLE = 'homepage_slides'
