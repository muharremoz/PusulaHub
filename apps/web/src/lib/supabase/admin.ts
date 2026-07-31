import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client (RLS bypass).
 *
 * Kullanım: kullanıcı session'ı OLMAYAN sunucu-tarafı bağlamlar —
 *  - agent-poller (arka plan, background) → mesaj teslim/okundu güncellemeleri
 *  - agent-facing route'lar (/api/agent/*, kendi token auth'ları var)
 *  - mesaj/şablon veri katmanı (messages-db, templates-db)
 *
 * Session'lı UI route'ları getSupabaseServer (authenticated RLS) kullanır.
 * SUPABASE_SERVICE_ROLE_KEY server-only env (NEXT_PUBLIC olmadan).
 *
 * NOT: `import "server-only"` BİLEREK yok. Bu modül custom `server.ts`
 * (node -r tsx/cjs) tarafından poller/firma-sync üzerinden yükleniyor; orada
 * Next RSC bundler'ı olmadığı için server-only paketi throw ediyor. Modül
 * yalnız server route + custom server tarafından import ediliyor (client'a
 * girmez); guard yerine bu not. Service key sadece server env'inde.
 */
// Gevşek schema tipi (any) — `.schema("hub")` erişimi için (generated types yok).
let _client: SupabaseClient<any, any, any> | null = null;

export function getSupabaseAdmin(): SupabaseClient<any, any, any> {
  if (_client) return _client;
  // ⚠ Env MODÜL YÜKLENİRKEN DEĞİL, ilk kullanımda okunur. `server.ts` bu modülü
  // (poller/firma-sync üzerinden) import ediyor; ESM import'ları hoist edildiği
  // için modül gövdesi `config()` (dotenv) çağrısından ÖNCE çalışıyor. Env'i
  // top-level const'a alırsak lokalde hep undefined kalır ve poller her turda
  // "supabaseUrl is required" ile patlar (prod'da Coolify env verdiği için görünmez).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as SupabaseClient<any, any, any>;
  return _client;
}
