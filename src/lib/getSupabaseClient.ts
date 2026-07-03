let supabaseClientPromise: Promise<typeof import('./supabase')['supabase']> | null = null;

export function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('./supabase').then((mod) => mod.supabase);
  }

  return supabaseClientPromise;
}
