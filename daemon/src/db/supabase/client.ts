import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDbConfig } from "../../config/storage-config.js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const dbConfig = getDbConfig();
    const url = dbConfig.supabaseUrl;
    const serviceKey = dbConfig.supabaseServiceKey;
    if (!url || !serviceKey) {
      throw new Error(
        "Supabase not configured. Set supabaseUrl and supabaseServiceKey in Settings → Storage.",
      );
    }
    client = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export function resetSupabaseClient(): void {
  client = null;
}
