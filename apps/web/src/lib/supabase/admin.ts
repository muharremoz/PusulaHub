import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client (RLS bypass, server-only).
 *
 * Kullanım: kullanıcı session'ı OLMAYAN sunucu-tarafı bağlamlar —
 *  - agent-poller (arka plan, background) → mesaj teslim/okundu güncellemeleri
 *  - agent-facing route'lar (/api/agent/*, kendi token auth'ları var)
 *  - mesaj/şablon veri katmanı (messages-db, templates-db)
 *
 * Session'lı UI route'ları getSupabaseServer (authenticated RLS) kullanır.
 * SUPABASE_SERVICE_ROLE_KEY server-only env (NEXT_PUBLIC olmadan).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Gevşek schema tipi (any) — `.schema("hub")` erişimi için (generated types yok).
let _client: SupabaseClient<any, any, any> | null = null;

export function getSupabaseAdmin(): SupabaseClient<any, any, any> {
  if (_client) return _client;
  _client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as SupabaseClient<any, any, any>;
  return _client;
}
