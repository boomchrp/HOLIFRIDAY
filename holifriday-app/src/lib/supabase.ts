const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabaseClientPromise: Promise<any | null> | null = null;

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function getSupabase() {
  if (!hasSupabaseConfig()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      return createClient(supabaseUrl as string, supabaseAnonKey as string, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    });
  }
  return supabaseClientPromise;
}
