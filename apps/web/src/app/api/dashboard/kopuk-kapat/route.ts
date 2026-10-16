import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { getAllAgents } from "@/lib/agent-store"
import { execOnAgent } from "@/lib/agent-poller"
import { decrypt } from "@/lib/crypto"

/**
 * POST /api/dashboard/kopuk-kapat — terminallerdeki KOPUK (Disconnected)
 * oturumları kapatır (logoff). Aktif oturumlara dokunmaz.
 *
 * Hedefler agent son raporundan: state Disconnected, console/services değil.
 * Sunucuda `query session` satırı yeniden doğrulanır: kopuk oturumun satırında
 * oturum adı sütunu BOŞ olur → kırpılmış satırın 1. alanı kullanıcı adı,
 * 2. alanı oturum kimliği. Aktif satır "rdp-tcp#N" ile başladığı için bu
 * kalıba uymaz; aynı kullanıcının aktif oturumu yanlışlıkla kapanmaz.
 * Sistem dili (Disc / Bağlantı kesildi) bu kontrolü etkilemez.
 *
 * Gövde (isteğe bağlı): { sunucular: string[] } — yalnız bu sunucu id'leri; yoksa tüm terminaller.
 * Yetki: servers:write. Komut tek satır, çift tırnaksız (agent exec kuralı).
 */

export interface KopukKapatSonuc {
  ok: boolean
  kapatilan: number
  sunucular: { ad: string; hedef: number; kapatilan: number | null; hata?: string }[]
}

const psQuote = (s: string) => (s ?? "").replace(/'/g, "''")
const sadeAd = (u: string) => (u.includes("\\") ? u.split("\\").pop()! : u)

export async function POST(req: Request) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  try {
    const sb = await getSupabaseServer()
    const [{ data: rolData }, { data: srvData }] = await Promise.all([
      sb.schema("hub").from("server_roles").select("server_id").eq("role", "RDP"),
      sb.schema("hub").from("servers").select("id, name, ip, agent_port, api_key"),
    ])
    const rdp = new Set(((rolData ?? []) as { server_id: string }[]).map((r) => r.server_id))
    type Srv = { id: string; name: string; ip: string; agent_port: number | null; api_key: string | null }
    const govde = (await req.json().catch(() => null)) as { sunucular?: unknown } | null
    const secili = Array.isArray(govde?.sunucular) ? new Set(govde.sunucular.filter((x): x is string => typeof x === "string")) : null
    if (secili && secili.size === 0) return NextResponse.json({ error: "Terminal seçilmedi" }, { status: 400 })
    const srvler = ((srvData ?? []) as Srv[]).filter((s) => rdp.has(s.id) && (!secili || secili.has(s.id)))
    const ajanlar = getAllAgents()

    const sunucular = await Promise.all(srvler.map(async (s): Promise<KopukKapatSonuc["sunucular"][number]> => {
      const a = ajanlar.find((x) => x.agentId === s.id || x.hostname === s.name || x.ip === s.ip)
      if (a?.status !== "online") return { ad: s.name, hedef: 0, kapatilan: null, hata: "agent çevrimdışı" }
      const kopuk = (a.lastReport?.sessions ?? [])
        .filter((o) => o.username && !/console|services/i.test(o.sessionType ?? "") && !/^active$/i.test(o.state ?? ""))
        .map((o) => sadeAd(o.username))
      const adlar = [...new Set(kopuk.map((u) => u.toLowerCase()))]
      if (adlar.length === 0) return { ad: s.name, hedef: 0, kapatilan: 0 }
      if (!s.agent_port || !s.api_key) return { ad: s.name, hedef: adlar.length, kapatilan: null, hata: "agent bilgisi eksik" }

      const liste = adlar.map((u) => `'${psQuote(u)}'`).join(",")
      const cmd =
        `$n = 0; $adlar = @(${liste}); ` +
        `foreach ($l in @(query session 2>$null)) { ` +
        `$t = ($l.Trim() -replace '^>', '') -split '\\s+'; ` +
        `if ($t.Count -ge 2 -and $adlar -contains $t[0] -and $t[1] -match '^\\d+$') { ` +
        `try { logoff $t[1]; $n++ } catch { } } }; ` +
        `Write-Output ('KAPATILAN=' + $n)`
      try {
        const res = await execOnAgent(s.ip, s.agent_port, decrypt(s.api_key) ?? "", cmd, 60)
        const m = /KAPATILAN=(\d+)/.exec(res.stdout ?? "")
        return m ? { ad: s.name, hedef: adlar.length, kapatilan: Number(m[1]) }
          : { ad: s.name, hedef: adlar.length, kapatilan: null, hata: (res.stderr || res.stdout || "yanıt okunamadı").trim().slice(0, 200) }
      } catch (e) {
        return { ad: s.name, hedef: adlar.length, kapatilan: null, hata: e instanceof Error ? e.message : String(e) }
      }
    }))

    const sonuc: KopukKapatSonuc = {
      ok: sunucular.every((x) => !x.hata),
      kapatilan: sunucular.reduce((t, x) => t + (x.kapatilan ?? 0), 0),
      sunucular: sunucular.sort((a, b) => a.ad.localeCompare(b.ad, "tr", { numeric: true })),
    }
    return NextResponse.json(sonuc)
  } catch (err) {
    console.error("[POST /api/dashboard/kopuk-kapat]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
