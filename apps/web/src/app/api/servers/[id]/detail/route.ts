import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { getSupabaseServer } from "@/lib/supabase/server"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Firma atamasinin tutuldugu kolonlar — biri bile eslesiyorsa firma bu sunucuya ait */
const ATAMA_KOLONLARI = [
  "windows_server_id",
  "ad_server_id",
  "sql_server_id",
  "file_server_id",
] as const

type AdKullanici = {
  username: string; displayName: string; email: string; ou: string
  enabled: boolean; lastLogin: string; groups: string[]
}

/**
 * Bu sunucuya ATANMIS firmalar ve kullanicilari.
 *
 * Neden ajandan degil DB'den: ajanin `ad` raporunu yalniz Active Directory
 * sunucusu uretiyor (domain taramasi orada calisiyor). Terminal, SQL, Depo
 * sunucularinin raporunda `ad` alani hic yok, bu yuzden sunucu detayinda
 * Firmalar ve Kullanicilar sekmeleri bombos geliyordu — oysa atama bilgisi
 * `hub.companies` icinde duruyor ve ajandan tamamen bagimsiz.
 *
 * Ajan kapaliyken de dolu gelmesi bilincli: bir sunucuya hangi firmalarin
 * atandigi, o sunucunun ayakta olup olmamasindan bagimsiz bir gercek.
 */
async function atanmisFirmalar(
  sb: Awaited<ReturnType<typeof getSupabaseServer>>,
  serverId: string,
) {
  const or = ATAMA_KOLONLARI.map((k) => `${k}.eq.${serverId}`).join(",")
  const { data: firmalar } = await sb
    .schema("hub").from("companies")
    .select("company_id, name")
    .or(or)

  const kodlar = (firmalar ?? [])
    .map((f) => (f as { company_id: string | null }).company_id)
    .filter((k): k is string => Boolean(k))

  if (!kodlar.length) return { companies: [], users: [] as AdKullanici[] }

  /*  Kullanicilar OU (= firkod) uzerinden bagli. `in` listesi firma
   *  sayisi kadar; su an en fazla ~60, sayfalama gerekmiyor.            */
  const { data: satirlar } = await sb
    .schema("hub").from("ad_users")
    .select("username, display_name, email, ou, enabled, last_login")
    .in("ou", kodlar)

  const users: AdKullanici[] = (satirlar ?? []).map((u) => {
    const x = u as {
      username: string; display_name: string | null; email: string | null
      ou: string | null; enabled: boolean | null; last_login: string | null
    }
    return {
      username:    x.username,
      displayName: x.display_name ?? x.username,
      email:       x.email ?? "",
      ou:          x.ou ?? "",
      enabled:     x.enabled ?? true,
      lastLogin:   x.last_login ?? "",
      /*  Grup uyeligi DB'de tutulmuyor (yalniz canli AD taramasinda var).  */
      groups:      [],
    }
  })

  const kullaniciByOu = new Map<string, AdKullanici[]>()
  for (const u of users) {
    const liste = kullaniciByOu.get(u.ou) ?? []
    liste.push(u)
    kullaniciByOu.set(u.ou, liste)
  }

  /*  Kullanicisi olmayan firma da listede kaliyor: "atanmis ama henuz
   *  kullanici acilmamis" gorunur bir durum, gizlenmesi yaniltirdi.     */
  const companies = kodlar
    .map((kod) => ({
      firmaNo:   kod,
      userCount: kullaniciByOu.get(kod)?.length ?? 0,
      users:     kullaniciByOu.get(kod) ?? [],
    }))
    .sort((a, b) => b.userCount - a.userCount)

  return { companies, users }
}

/**
 * GET /api/servers/[id]/detail
 * Agent store'daki son rapor verisini döner (sessions, security, logs, ad, sql, iis).
 * Sunucu id veya name(slug) ile eşleşir.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const sb = await getSupabaseServer()
  let srv = (await sb.schema("hub").from("servers").select("id, ip, name").eq("id", id).maybeSingle()).data as
    { id: string; ip: string; name: string } | null
  if (!srv) {
    const { data: all } = await sb.schema("hub").from("servers").select("id, ip, name")
    srv = ((all ?? []) as { id: string; ip: string; name: string }[]).find((s) => slugify(s.name) === id) ?? null
  }

  const serverId = srv?.id
  const serverIp = srv?.ip
  const serverName = srv?.name

  if (!serverId) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  // Agent store'dan son raporu al (liste route ile aynı 3'lü eşleşme)
  const agents = getAllAgents()
  const agent = agents.find(
    (a) => a.agentId === serverId || a.hostname === serverName || a.ip === serverIp
  )

  const atanmis = await atanmisFirmalar(sb, serverId)

  if (!agent || !agent.lastReport) {
    return NextResponse.json({
      sessions: [],
      security: null,
      logs: null,
      /*  Ajan kapali olsa da atama verisi gecerli — sekmeler bos kalmasin. */
      ad: { users: atanmis.users, ouTree: [], companies: atanmis.companies },
      sql: null,
      iis: null,
      roles: [],
    })
  }

  const r = agent.lastReport
  const resp = NextResponse.json({
    sessions:   r.sessions ?? [],
    security:   r.security ?? null,
    logs:       r.logs ?? null,
    /*  Canli AD taramasi varsa (yalniz Active Directory sunucusu) o
     *  kullaniliyor: grup uyeligi gibi DB'de olmayan alanlari tasiyor.
     *  Diger butun sunucularda atama verisinden uretiliyor.             */
    ad:         r.ad?.companies?.length
                  ? r.ad
                  : { users: atanmis.users, ouTree: r.ad?.ouTree ?? [], companies: atanmis.companies },
    localUsers: r.localUsers ?? null,
    sql:        r.sql ?? null,
    iis:        r.iis ?? null,
    roles:      r.roles ?? [],
    ram:        r.metrics?.ram ?? null,   // totalMB / usedMB / freeMB / cacheMB / realUsedMB
  })
  resp.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
  return resp
}
