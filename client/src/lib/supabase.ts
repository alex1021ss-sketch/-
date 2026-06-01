import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// The Supabase client expects the project's base origin
// (e.g. https://<ref>.supabase.co). If the env var accidentally includes a
// path such as "/auth/v1/", every request resolves to an invalid path and
// returns 404 ("Invalid path specified in request URL"). Normalize to the
// origin so a misconfigured value still works.
const supabaseUrl = new URL(rawSupabaseUrl).origin;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
