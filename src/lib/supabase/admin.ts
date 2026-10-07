import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role klijent — zaobilazi RLS u potpunosti. SAMO za server-side kod
 * (Route Handlers), nikad za import u "use client" komponente. SUPABASE_SERVICE_ROLE_KEY
 * namjerno nema NEXT_PUBLIC_ prefiks pa Next.js ne ugrađuje njegovu vrijednost u browser bundle.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
