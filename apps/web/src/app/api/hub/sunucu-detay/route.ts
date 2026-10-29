import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getAllAgents } from "@/lib/agent-store"
import { execOnAgent } from "@/lib/agent-poller"
import { decrypt } from "@/lib/crypto"
import { icAnahtarKapisi } from "@/lib/hub-ic-anahtar"

/**
 * GET /api/hub/sunucu-detay?id=<server id>
 *
 * CRM mobil Sunucular ekranında karta dokununca açılan ayrıntı (29.10.2026):
 * bağlı kullanıcılar (firma adıyla), tüm diskler ve o an en çok CPU yiyen süreçler.
 *
 * Oturumlar agent'ın son raporundan gelir (ek istek yok). Süreçler ise rapor
 * içinde YOK — ekran açılınca agent'a tek bir exec gider (2 sn örnek, ilk 10).
 * Yalnız kullanıcı açınca çalışır, yoklama yok (CLAUDE.md "Kaynak Tasarrufu").
 */

/*  EncodedCommand ile gider: exec ucunun tırnak/`^`/satır sonu tuzakları (CLAUDE.md) devre dışı. CPU
 *  yüzdesi tüm çekirdeklere göre — Görev Yöneticisi'nin gösterdiği gibi.       */
const SUREC_KOMUTU = [
  "$a=@{}",
  "Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $a[$_.Id]=$_.TotalProcessorTime.TotalSeconds }",
  "Start-Sleep -Seconds 2",
  "$n=[Environment]::ProcessorCount",
  "Get-Process -IncludeUserName -ErrorAction SilentlyContinue | ForEach-Object { $o=$a[$_.Id]; if ($o -ne $null) { New-Object PSObject -Property @{ ad=$_.ProcessName; no=$_.Id; kul=$_.UserName; cpu=[math]::Round(($_.TotalProcessorTime.TotalSeconds-$o)/2/$n*100,1); ramMB=[math]::Round($_.WorkingSet64/1MB) } } } | Sort-Object cpu -Descending | Select-Object -First 10 ad,no,kul,cpu,ramMB | ConvertTo-Json -Compress",
].join("; ")

interface Surec { ad: string; no: number; kul: string | null; cpu: number; ramMB: number }

export async function GET(req: NextRequest) {
  const kapi = icAnahtarKapisi(req)
  if (kapi) return kapi
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: srv } = await sb.schema("hub").from("servers").select("id, name, ip, agent_port, api_key").eq("id", id).maybeSingle()
  if (!srv) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  const s = srv as { id: string; name: string; ip: string; agent_port: number | null; api_key: string | null }

  const agent = getAllAgents().find((a) => a.agentId === s.id || a.hostname === s.name || a.ip === s.ip)
  const rap = agent?.lastReport

  // Kullanıcı adı "2246.yakupoglu4" → firma kodu 2246 → firma adı.
  const oturumlar = (rap?.sessions ?? []).filter((o) => o.username && !/services/i.test(o.sessionType ?? ""))
  const kodlar = [...new Set(oturumlar.map((o) => o.username.split(".")[0]).filter((k) => /^\d+$/.test(k)))]
  const { data: firmalar } = kodlar.length
    ? await sb.schema("hub").from("companies").select("company_id, name").in("company_id", kodlar)
    : { data: [] }
  const firmaAdi = new Map(((firmalar ?? []) as { company_id: string; name: string }[]).map((f) => [String(f.company_id), f.name]))

  let surecler: Surec[] | null = null
  let surecHata: string | null = null
  const anahtar = decrypt(s.api_key)
  if (agent?.status === "online" && s.agent_port && anahtar) {
    const r = await execOnAgent(s.ip, s.agent_port, anahtar, `powershell -NoProfile -EncodedCommand ${Buffer.from(SUREC_KOMUTU, "utf16le").toString("base64")}`, 20)
    try {
      const j = JSON.parse(r.stdout.trim() || "[]") as Surec | Surec[]
      surecler = (Array.isArray(j) ? j : [j]).map((p) => ({ ...p, kul: p.kul ? p.kul.split("\\").pop() ?? p.kul : null }))
    } catch {
      surecHata = r.stderr?.slice(0, 200) || "Süreç listesi okunamadı"
    }
  } else {
    surecHata = "Agent çevrimdışı"
  }

  return NextResponse.json({
    id: s.id,
    ad: s.name,
    oturumlar: oturumlar
      .map((o) => {
        const kod = o.username.split(".")[0]
        return { kullanici: o.username, firma: firmaAdi.get(kod) ?? null, durum: o.state, istemciIp: o.clientIp || null, giris: o.logonTime || null }
      })
      .sort((a, b) => (a.durum === b.durum ? a.kullanici.localeCompare(b.kullanici, "tr", { numeric: true }) : a.durum === "Active" ? -1 : 1)),
    diskler: (rap?.metrics?.disks ?? []).map((d) => ({ surucu: d.drive.replace(/[:\\]/g, ""), yuzde: Math.round(d.percent), bosGB: Math.round(d.totalGB - d.usedGB), toplamGB: Math.round(d.totalGB) })),
    surecler,
    surecHata,
    zaman: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } })
}
