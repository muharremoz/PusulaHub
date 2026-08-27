import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getAllAgents } from "@/lib/agent-store"
import { execOnAgent } from "@/lib/agent-poller"
import { listCompanyUsers } from "@/lib/company-users"
import { requirePermission } from "@/lib/require-permission"

/**
 * POST /api/companies/[firkod]/panic — "Panik" düğmesi.
 *
 * Firmanın erişimini tek hamlede keser:
 *   1. AD'de firmanın TÜM aktif kullanıcılarını devre dışı bırakır
 *      (Disable-ADAccount) — yeni oturum açılamaz.
 *   2. O an açık olan oturumları kapatır (logoff) — çalışanlar anında düşer.
 *
 * Sıra önemli: önce devre dışı, sonra logoff. Tersi olsaydı kullanıcı
 * logoff ile düşüp hemen yeniden giriş yapabilirdi.
 *
 * Gövdede `{ mod: "geri" }` gelirse TERSİ yapılır: firmanın pasif
 * hesapları yeniden açılır. Oturum kapatma adımı geri almada atlanır —
 * erişimi açarken kimseyi düşürmenin anlamı yok.
 *
 * Geri alınamaz bir işlem DEĞİL; ama açık oturumlarda kaydedilmemiş veri
 * kaybolur. Bu yüzden UI tarafında AlertDialog ile onay alınır.
 *
 * ⚠ Agent `/api/exec` gövdesini regex ile ayrıştırıyor: komutlarda çift
 * tırnak YASAK, tek tırnak + '' escape (bkz. CLAUDE.md).
 */

interface PanicSonuc {
  ok: boolean
  /** Devre dışı bırakılan hesap sayısı (geri almada: açılan hesap sayısı). */
  devreDisi: number
  /** Kapatılan oturum sayısı. Geri almada her zaman 0. */
  kapatilanOturum: number
  /** Zaten istenen durumda olduğu için atlanan hesap sayısı. */
  atlanan: number
  /** Kullanıcıya gösterilecek hata satırları (işlem kısmen başarılıysa dolu). */
  hatalar: string[]
}

/** "panik" = erişimi kes, "geri" = hesapları yeniden aç. */
type Mod = "panik" | "geri"

function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/** "DOMAIN\\ad" → "ad" */
function sadeAd(u: string): string {
  return u.includes("\\") ? u.split("\\").pop()! : u
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Yıkıcı işlem — okuma yetkisi yetmez.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  const hatalar: string[] = []

  // Gövde boş gelebilir (eski çağrılar) — varsayılan "panik".
  const govde = await req.json().catch(() => null)
  const mod: Mod = (govde as { mod?: string } | null)?.mod === "geri" ? "geri" : "panik"
  const geriAl = mod === "geri"

  try {
    const sb = await getSupabaseServer()

    /* ── 1) Firmanın kullanıcıları ── */
    const users = await listCompanyUsers(sb, firkod)
    if (users.length === 0) {
      return NextResponse.json(
        { error: "Firmaya ait kullanıcı bulunamadı" },
        { status: 404 },
      )
    }
    // Panikte aktif olanlara dokunulur, geri almada pasif olanlara.
    const hedefler = users.filter((u) => (geriAl ? !u.enabled : u.enabled))
    const atlanan = users.length - hedefler.length

    /* ── 2) AD'de hesap durumunu değiştir ── */
    let devreDisi = 0
    if (hedefler.length > 0) {
      const { data: comp } = await sb.schema("hub").from("companies")
        .select("ad_server_id").eq("company_id", firkod).maybeSingle()
      const adId = (comp as { ad_server_id: string | null } | null)?.ad_server_id

      let adAgent: { ip: string; port: number; key: string } | null = null
      if (adId) {
        const { data: srv } = await sb.schema("hub").from("servers")
          .select("ip, agent_port, api_key").eq("id", adId).maybeSingle()
        const s = srv as { ip: string; agent_port: number | null; api_key: string | null } | null
        if (s?.agent_port && s?.api_key) adAgent = { ip: s.ip, port: s.agent_port, key: s.api_key }
      }

      if (!adAgent) {
        hatalar.push(
          geriAl
            ? "AD sunucusu tanımsız — hesaplar açılamadı."
            : "AD sunucusu tanımsız — hesaplar devre dışı bırakılamadı.",
        )
      } else {
        // Tek komutta topluca: N kullanıcı için N ayrı exec, AD sunucusunu
        // gereksiz yorardı (proje prensibi: bağlı sunucularda ağır işlem yok).
        const liste = hedefler.map((u) => `'${psQuote(u.username)}'`).join(",")
        const komut = geriAl ? "Enable-ADAccount" : "Disable-ADAccount"
        const cmd =
          `Import-Module ActiveDirectory; $n = 0; ` +
          `foreach ($u in @(${liste})) { ` +
          `try { ${komut} -Identity $u -ErrorAction Stop; $n++ } catch { } }; ` +
          `Write-Output ('DISABLED=' + $n)`

        const res = await execOnAgent(adAgent.ip, adAgent.port, adAgent.key, cmd, 60)
        const m = /DISABLED=(\d+)/.exec(res.stdout ?? "")
        if (m) {
          devreDisi = Number(m[1])
          if (devreDisi < hedefler.length) {
            const eksik = hedefler.length - devreDisi
            hatalar.push(
              geriAl
                ? `${eksik} hesap açılamadı.`
                : `${eksik} hesap devre dışı bırakılamadı.`,
            )
          }
        } else {
          hatalar.push(
            `AD komutu başarısız: ${(res.stderr || res.stdout || "yanıt yok").trim().slice(0, 200)}`,
          )
        }
      }
    }

    /* ── 3) Açık oturumları kapat ── */
    // Oturumlar agent raporlarında; firmanın kullanıcı adlarıyla eşleşen
    // oturumu olan her sunucuya tek logoff komutu gönderilir.
    // Geri almada bu adım atlanır: hesapları açarken kimseyi düşürmemeliyiz.
    const firmaAdlari = new Set(users.map((u) => sadeAd(u.username).toLowerCase()))
    let kapatilanOturum = 0

    for (const agent of geriAl ? [] : getAllAgents()) {
      if (agent.status !== "online") continue
      const oturumlar = agent.lastReport?.sessions ?? []
      const hedefler = oturumlar.filter((s) =>
        firmaAdlari.has(sadeAd(s.username).toLowerCase()),
      )
      if (hedefler.length === 0) continue

      const srv = await sb.schema("hub").from("servers")
        .select("ip, agent_port, api_key").eq("id", agent.agentId).maybeSingle()
      const s = srv.data as { ip: string; agent_port: number | null; api_key: string | null } | null
      if (!s?.agent_port || !s?.api_key) {
        hatalar.push(`${agent.hostname}: agent bilgisi eksik, oturumlar kapatılamadı.`)
        continue
      }

      const adlar = hedefler.map((h) => `'${psQuote(sadeAd(h.username))}'`).join(",")
      // `query session` çıktısında kullanıcıyı bul, 3. sütundaki oturum
      // kimliğiyle logoff. Bulunamayan kullanıcı sessizce atlanır.
      const cmd =
        `$n = 0; ` +
        `foreach ($u in @(${adlar})) { ` +
        `try { ` +
        `$q = (query session) | Where-Object { $_ -match [regex]::Escape($u) }; ` +
        `if ($q) { $id = ($q[0].Trim() -split '\\s+')[2]; logoff $id; $n++ } ` +
        `} catch { } }; ` +
        `Write-Output ('LOGGEDOFF=' + $n)`

      try {
        const res = await execOnAgent(s.ip, s.agent_port, s.api_key, cmd, 45)
        const m = /LOGGEDOFF=(\d+)/.exec(res.stdout ?? "")
        if (m) kapatilanOturum += Number(m[1])
        else hatalar.push(`${agent.hostname}: oturum kapatma yanıtı okunamadı.`)
      } catch (e) {
        hatalar.push(`${agent.hostname}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const sonuc: PanicSonuc = {
      ok: hatalar.length === 0,
      devreDisi,
      kapatilanOturum,
      atlanan,
      hatalar,
    }
    return NextResponse.json(sonuc)
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/panic]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
