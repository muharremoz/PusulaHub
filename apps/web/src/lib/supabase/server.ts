import "server-only";

import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { stripPersistence } from "./session-cookies";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server (Server Component / Route Handler) — cookie tabanlı Supabase session.
// İstek başına tekilleştirilir. auth() bunu kullanıp kimliği doğrular; kullanıcı
// kimliği (mssql AppUsers.Id) için email köprüsü pusula-session.ts'te.
export const getSupabaseServer = cache(async () => {
  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, stripPersistence(value, options)),
          );
        } catch {
          // Server Component'ten set çağrılırsa yutulur (middleware refresh eder)
        }
      },
    },
  });
  await client.auth.getUser();
  return client;
});
