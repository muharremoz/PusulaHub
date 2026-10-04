/**
 * Firmanın terminal (RDP) sunucusunu değiştir.
 *
 *   GET  ?hedef=<serverId>   ön kontrol (hiçbir şey değiştirmez)
 *   POST { hedefId, oturumlarRagmen? }   taşıma — SSE: step { stepId, label, status, output?, error? }, done, error
 *
 * Sıra önemli: atama (companies.windows_server_id) EN SON değişir. Kopya yarıda kalırsa firma eski
 * sunucuda çalışmaya devam eder; işlem yeniden başlatılabilir (robocopy kaldığı yerden sürer).
 * Eski klasör silinmez, "<firkod>.tasindi-YYYYMMDD" olarak yeniden adlandırılır.
 * Ayrıntı ve adımlar: lib/terminal-tasima.ts
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { getAgentById } from "@/lib/agent-store"
import { decrypt } from "@/lib/crypto"
import { buildSetNtfsPermissions, buildWriteDesktopIni, buildWriteFirmanoBak } from "@/lib/setup-fileops"
import {
  buildEskiyiAdlandir, buildHedefOzeti, buildHedefSay, buildKaynakOzeti, buildKopyaBaslat, buildKopyaDurumu, firmaKlasoru,
} from "@/lib/terminal-tasima"

export const dynamic = "force-dynamic"
export const maxDuration = 3600

interface Sunucu { id: string; name: string; ip: string; port: number; apiKey: string; kullanici: string | null; sifre: string | null }

async function sunucu(id: string | null | undefined): Promise<Sunucu | null> {
  if (!id) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("servers").select("id, name, ip, agent_port, api_key, username, password").eq("id", id).maybeSingle()
  const r = data as { id: string; name: string; ip: string; agent_port: number | null; api_key: string | null; username: string | null; password: string | null } | null
  if (!r || !r.agent_port || !r.api_key) return null
  return { id: r.id, name: r.name, ip: r.ip, port: r.agent_port, apiKey: decrypt(r.api_key) ?? r.api_key, kullanici: r.username, sifre: decrypt(r.password) }
}

const calistir = (s: Sunucu, komut: string, sure = 60) => execOnAgent(s.ip, s.port, s.apiKey, komut, sure)

function json<T>(stdout: string): T {
  const satir = (stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "").trim()
  // Ajan çıktısı konsol kod sayfasından geçer — Türkçe karakter bozulmasın diye komutlar JSON'u base64 basar
  return JSON.parse(satir.startsWith("B64:") ? Buffer.from(satir.slice(4), "base64").toString("utf8") : satir) as T
}

interface KaynakOzet { var: boolean; dosya: number; bayt: number; alt: string[] | string | null; firmanoBak: string[] | string | null; masaustu: string | null }
interface HedefOzet { var: boolean; oge: number; isaret: boolean; smb: boolean; netUse: number; bosBayt: number }
const dizi = (x: string[] | string | null | undefined) => (x == null ? [] : Array.isArray(x) ? x : [x])

/** Firmanın eski sunucudaki oturumları — ajan raporundan (exec yok). Kullanıcı adları "<firkod>.<ad>". */
function firmaOturumlari(sunucuId: string, firkod: string) {
  const r = getAgentById(sunucuId)?.lastReport
  const on = `${firkod}.`.toLowerCase()
  return (r?.sessions ?? [])
    .filter((s) => (s.username ?? "").toLowerCase().split("\\").pop()!.startsWith(on))
    .map((s) => ({ kullanici: s.username, durum: s.state }))
}

async function onKontrol(firkod: string, hedefId: string) {
  const sb = await getSupabaseServer()
  const { data: c } = await sb.schema("hub").from("companies").select("name, windows_server_id").eq("company_id", firkod).maybeSingle()
  const firma = c as { name: string | null; windows_server_id: string | null } | null
  if (!firma) throw new Error("Firma bulunamadı")
  if (!firma.windows_server_id) throw new Error("Firmaya atanmış terminal sunucusu yok")
  if (firma.windows_server_id === hedefId) throw new Error("Hedef, firmanın şu anki sunucusu")
  const [eski, hedef] = await Promise.all([sunucu(firma.windows_server_id), sunucu(hedefId)])
  if (!eski) throw new Error("Eski sunucunun ajan bilgisi eksik")
  if (!hedef) throw new Error("Hedef sunucunun ajan bilgisi eksik")

  const [k, h] = await Promise.all([
    calistir(eski, buildKaynakOzeti(firkod), 120),
    calistir(hedef, buildHedefOzeti(firkod, eski.ip, eski.kullanici, eski.sifre), 60),
  ])
  if (k.exitCode !== 0) throw new Error(`${eski.name}: ${k.stderr || k.stdout || "ajan yanıt vermedi"}`)
  if (h.exitCode !== 0) throw new Error(`${hedef.name}: ${h.stderr || h.stdout || "ajan yanıt vermedi"}`)
  const kaynak = json<KaynakOzet>(k.stdout)
  const hedefOzet = json<HedefOzet>(h.stdout)
  const oturumlar = firmaOturumlari(eski.id, firkod)

  const engeller: string[] = []
  const uyarilar: string[] = []
  if (!kaynak.var) engeller.push(`${eski.name} üzerinde ${firmaKlasoru(firkod)} yok`)
  if (hedefOzet.var && hedefOzet.oge > 0 && !hedefOzet.isaret)
    engeller.push(`${hedef.name} üzerinde ${firmaKlasoru(firkod)} zaten var ve boş değil (${hedefOzet.oge} öğe) — elle kontrol edin`)
  if (!hedefOzet.smb) engeller.push(`${hedef.name}, ${eski.name} sunucusunun C$ paylaşımına erişemiyor${hedefOzet.netUse ? ` (net use ${hedefOzet.netUse})` : ""} — sunucu kullanıcı adı/şifresini kontrol edin`)
  if (kaynak.bayt * 1.1 > hedefOzet.bosBayt) engeller.push(`${hedef.name} C: sürücüsünde yer yetersiz`)
  if (oturumlar.length) uyarilar.push(`${eski.name} üzerinde firmanın ${oturumlar.length} oturumu açık — taşıma sırasında açık dosyalar kopyalanamayabilir; kullanıcıları çıkartın`)
  if (hedefOzet.isaret) uyarilar.push("Hedefte yarıda kalmış bir taşıma var — kaldığı yerden devam edilir")
  if (!dizi(kaynak.firmanoBak).length) uyarilar.push("Hiçbir program klasöründe firmano.bak yok — program açılmayabilir")

  return {
    firma: { kod: firkod, ad: firma.name },
    eski: { id: eski.id, ad: eski.name, ip: eski.ip },
    hedef: { id: hedef.id, ad: hedef.name, ip: hedef.ip },
    kaynak: { ...kaynak, alt: dizi(kaynak.alt), firmanoBak: dizi(kaynak.firmanoBak) },
    hedefDurum: hedefOzet,
    oturumlar,
    engeller,
    uyarilar,
    _ic: { eski, hedef, firmaAdi: firma.name ?? firkod },
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const hedef = req.nextUrl.searchParams.get("hedef")
  if (!hedef) return NextResponse.json({ error: "hedef gerekli" }, { status: 400 })
  try {
    const { _ic, ...sonuc } = await onKontrol(firkod, hedef)
    void _ic
    return NextResponse.json(sonuc)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const body = (await req.json().catch(() => ({}))) as { hedefId?: string; oturumlarRagmen?: boolean }
  if (!body.hedefId) return NextResponse.json({ error: "hedefId gerekli" }, { status: 400 })
  const yapan = (await auth())?.user?.name ?? null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* istemci gitti — iş sürer */ }
      }
      const adim = (stepId: string, label: string, status: "running" | "done" | "error", extra?: { output?: string; error?: string }) =>
        send("step", { stepId, label, status, ...extra })
      const bitir = (hata?: string) => {
        if (hata) send("error", { error: hata })
        try { controller.close() } catch { /* kapalı */ }
      }

      try {
        // 1) Ön kontrol (yeniden — arada durum değişmiş olabilir)
        adim("kontrol", "Ön kontrol", "running")
        const k = await onKontrol(firkod, body.hedefId!)
        const { eski, hedef, firmaAdi } = k._ic
        if (k.engeller.length) { adim("kontrol", "Ön kontrol", "error", { error: k.engeller.join(" · ") }); return bitir("Ön kontrol geçmedi") }
        if (k.oturumlar.length && !body.oturumlarRagmen) {
          adim("kontrol", "Ön kontrol", "error", { error: `Firmanın ${k.oturumlar.length} oturumu açık` })
          return bitir("Açık oturum var")
        }
        adim("kontrol", "Ön kontrol", "done", { output: `${eski.name} → ${hedef.name} · ${k.kaynak.dosya} dosya, ${(k.kaynak.bayt / 1048576).toFixed(0)} MB` })
        console.log(`[terminal-degistir] ${firkod}: ${eski.name} -> ${hedef.name} basladi (${yapan ?? "?"})`)

        // 2) Kopya (hedef ajanı eski sunucudan çeker; arka planda)
        const etiket = `Dosyalar kopyalanıyor: ${eski.name} → ${hedef.name}`
        adim("kopya", etiket, "running")
        const bas = await calistir(hedef, buildKopyaBaslat(firkod, eski.ip, eski.kullanici, eski.sifre, k.kaynak.masaustu), 60)
        if (bas.exitCode !== 0 || !bas.stdout.includes("STARTED")) { adim("kopya", etiket, "error", { error: bas.stderr || bas.stdout }); return bitir("Kopya başlatılamadı") }
        let durum: { bitti: boolean; rc: number | null; dosya: number; hata: string[] | string | null } | null = null
        let hataSayisi = 0
        for (;;) {
          await new Promise((r) => setTimeout(r, 5000))
          const d = await calistir(hedef, buildKopyaDurumu(firkod), 60)
          if (d.exitCode !== 0) { if (++hataSayisi > 12) { adim("kopya", etiket, "error", { error: "Hedef ajan yanıt vermiyor" }); return bitir("Kopya izlenemedi") } continue }
          hataSayisi = 0
          durum = json(d.stdout)
          if (durum!.bitti) break
          const yuzde = k.kaynak.dosya ? Math.min(99, Math.round((durum!.dosya / k.kaynak.dosya) * 100)) : 0
          adim("kopya", `${etiket} — ${durum!.dosya} / ${k.kaynak.dosya} dosya (%${yuzde})`, "running")
        }
        if (durum!.rc == null || durum!.rc >= 8) {
          adim("kopya", etiket, "error", { error: `robocopy ${durum!.rc}: ${dizi(durum!.hata).join(" | ") || "bilinmeyen hata"}` })
          return bitir("Kopya hatalı bitti")
        }
        adim("kopya", etiket, "done", { output: `robocopy ${durum!.rc}` })

        // 3) Doğrulama: dosya sayısı
        adim("dogrula", "Kopya doğrulanıyor", "running")
        const say = await calistir(hedef, buildHedefSay(firkod), 300)
        const hs = say.exitCode === 0 ? json<{ dosya: number; bayt: number }>(say.stdout) : null
        const kaynakDosya = k.kaynak.dosya - k.kaynak.firmanoBak.length   // firmano.bak kopyalanmaz
        if (!hs || hs.dosya < kaynakDosya) {
          adim("dogrula", "Kopya doğrulanıyor", "error", { error: hs ? `Hedefte ${hs.dosya} dosya, kaynakta ${kaynakDosya}` : say.stderr })
          return bitir("Kopya eksik — atama değiştirilmedi")
        }
        adim("dogrula", "Kopya doğrulandı", "done", { output: `${hs.dosya} dosya, ${(hs.bayt / 1048576).toFixed(0)} MB` })

        // 4) firmano.bak — hedef sürücünün seri numarasıyla
        for (const alt of k.kaynak.firmanoBak) {
          const r = await calistir(hedef, buildWriteFirmanoBak(`${firmaKlasoru(firkod)}\\${alt}`, firkod))
          if (r.exitCode !== 0 || r.stderr.trim()) { adim(`firmano_${alt}`, `firmano.bak: ${alt}`, "error", { error: r.stderr || r.stdout }); return bitir("firmano.bak yazılamadı") }
          adim(`firmano_${alt}`, `firmano.bak yeniden üretildi: ${alt}`, "done")
        }

        // 5) NTFS yetkileri + desktop.ini
        adim("ntfs", `NTFS yetkileri: ${firmaKlasoru(firkod)} → ${firkod}_users`, "running")
        const n = await calistir(hedef, buildSetNtfsPermissions(firmaKlasoru(firkod), `${firkod}_users`), 900)
        if (n.exitCode !== 0) { adim("ntfs", "NTFS yetkileri", "error", { error: n.stderr || n.stdout }); return bitir("Yetkiler verilemedi") }
        adim("ntfs", `NTFS yetkileri: ${firkod}_users`, "done")
        await calistir(hedef, buildWriteDesktopIni(firmaKlasoru(firkod), firmaAdi))

        // 6) Atama — buradan sonra Connect / Aktarım / Firmalar yeni sunucuyu kullanır
        adim("atama", "Firmanın terminal sunucusu güncelleniyor", "running")
        const sb = await getSupabaseServer()
        const { error: dbHata } = await sb.schema("hub").from("companies").update({ windows_server_id: hedef.id }).eq("company_id", firkod)
        if (dbHata) { adim("atama", "Atama", "error", { error: dbHata.message }); return bitir("Atama değiştirilemedi") }
        adim("atama", `Terminal sunucusu: ${hedef.name}`, "done")

        // 7) Eski klasör yeniden adlandırılır (silinmez) — açık dosya varsa kalır, uyarı verilir
        const ek = `.tasindi-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`
        adim("eski", `Eski klasör yeniden adlandırılıyor (${eski.name})`, "running")
        const e = await calistir(eski, buildEskiyiAdlandir(firkod, k.kaynak.masaustu, ek))
        if (e.exitCode !== 0 || e.stderr.trim())
          adim("eski", `Eski klasör adlandırılamadı (${eski.name})`, "error", { error: `${e.stderr || e.stdout} — taşıma tamam; klasörü elle ${firkod}${ek} yapın` })
        else adim("eski", `Eski klasör: ${firmaKlasoru(firkod)}${ek} (${eski.name})`, "done")

        console.log(`[terminal-degistir] ${firkod}: ${eski.name} -> ${hedef.name} tamam`)
        send("done", { eski: eski.name, hedef: hedef.name })
        bitir()
      } catch (err) {
        bitir(err instanceof Error ? err.message : String(err))
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  })
}
