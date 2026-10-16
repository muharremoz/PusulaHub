import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { decrypt } from "@/lib/crypto"

/**
 * GET /api/servers/[id]/saglik — sunucu sağlık kontrolleri (SALT OKUMA).
 *
 * Agent'ı güncellemeden: tek satırlık PowerShell /api/exec ile çalışır,
 * hiçbir şey yazmaz. Çıktı ANAHTAR=değer satırları (JSON değil — agent
 * yanıtında çift tırnak sorun çıkarabiliyor). 10 dk sunucu başı önbellek;
 * ?yenile=1 atlar.
 *
 * Kapsam: Defender (gerçek zamanlı koruma, Tamper, imza tarihi), güvenlik
 * duvarı profilleri, NLA, bekleyen yeniden başlatma, son güncelleme
 * (Get-HotFix), son açılış, role göre kritik servisler.
 */

export interface SaglikServis { ad: string; gorunenAd: string; durum: string; baslangic: string; kritik: boolean }
export interface SaglikYanit {
  zaman: string
  defender: { gercekZamanli: boolean; tamper: boolean; imza: string | null; mod: string | null } | null
  guvenlikDuvari: { profil: string; acik: boolean }[]
  nla: boolean | null
  yenidenBaslatmaBekliyor: boolean
  sonGuncelleme: { kb: string; tarih: string } | null
  sonAcilis: string | null
  servisler: SaglikServis[]
}

const onbellek = new Map<string, { at: number; veri: SaglikYanit }>()
const TTL = 10 * 60_000

/** Rol → izlenen servis adları (Name ya da DisplayName). PusulaAgent her yerde. */
const ROL_SERVIS: Record<string, string[]> = {
  RDP: ["ThinRDPSrv", "TermService"],
  SQL: ["MSSQLSERVER", "SQLSERVERAGENT", "SQL Backup Master"],
  IIS: ["W3SVC"],
  AD: ["NTDS", "DNS"],
  File: ["LanmanServer"],
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  const { id } = await params
  const yenile = new URL(req.url).searchParams.get("yenile") === "1"
  const eski = onbellek.get(id)
  if (!yenile && eski && Date.now() - eski.at < TTL) return NextResponse.json(eski.veri)

  try {
    const sb = await getSupabaseServer()
    const [{ data: srv }, { data: rol }] = await Promise.all([
      sb.schema("hub").from("servers").select("ip, agent_port, api_key").eq("id", id).maybeSingle(),
      sb.schema("hub").from("server_roles").select("role").eq("server_id", id),
    ])
    const s = srv as { ip: string; agent_port: number | null; api_key: string | null } | null
    if (!s) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
    if (!s.agent_port || !s.api_key) return NextResponse.json({ error: "Agent bilgisi eksik" }, { status: 400 })

    const roller = ((rol ?? []) as { role: string }[]).map((r) => r.role)
    const izlenen = ["PusulaAgent", ...roller.flatMap((r) => ROL_SERVIS[r] ?? [])]
    const adlar = izlenen.map((a) => `'${a.replace(/'/g, "''")}'`).join(",")

    const cmd = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "try { $m = Get-MpComputerStatus; 'DEF_RT=' + $m.RealTimeProtectionEnabled; 'DEF_TAMPER=' + $m.IsTamperProtected; 'DEF_IMZA=' + $m.AntivirusSignatureLastUpdated.ToString('s'); 'DEF_MOD=' + $m.AMRunningMode } catch { 'DEF_HATA=1' }",
      "foreach ($p in @(Get-NetFirewallProfile)) { 'FW_' + $p.Name + '=' + $p.Enabled }",
      "'NLA=' + (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp').UserAuthentication",
      "'REBOOT_CBS=' + (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending')",
      "'REBOOT_WU=' + (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')",
      "$h = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1",
      "if ($h) { 'HOTFIX=' + $h.HotFixID + '|' + $h.InstalledOn.ToString('s') }",
      "'BOOT=' + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('s')",
      `$ad = @(${adlar})`,
      "foreach ($s in @(Get-Service | Where-Object { $ad -contains $_.Name -or $ad -contains $_.DisplayName })) { 'SVC=' + $s.Name + '|' + $s.DisplayName + '|' + $s.Status + '|' + $s.StartType }",
    ].join("; ")

    const res = await execOnAgent(s.ip, s.agent_port, decrypt(s.api_key) ?? "", cmd, 60)
    const satir = (res.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const deger = (k: string) => satir.find((l) => l.startsWith(k + "="))?.slice(k.length + 1) ?? null
    const evet = (v: string | null) => v?.toLowerCase() === "true"
    if (!satir.length) throw new Error((res.stderr || "Sunucudan yanıt gelmedi").trim().slice(0, 200))

    const hotfix = deger("HOTFIX")?.split("|")
    const bulunan = satir.filter((l) => l.startsWith("SVC=")).map((l) => {
      const [ad, gorunenAd, durum, baslangic] = l.slice(4).split("|")
      return { ad, gorunenAd, durum, baslangic, kritik: true }
    })
    // İzlenen ama sunucuda hiç olmayan servis de listede görünsün (eksik kurulum)
    const servisler: SaglikServis[] = izlenen.map((a) => bulunan.find((b) => b.ad === a || b.gorunenAd === a)
      ?? { ad: a, gorunenAd: a, durum: "Yok", baslangic: "—", kritik: true })

    const veri: SaglikYanit = {
      zaman: new Date().toISOString(),
      defender: deger("DEF_HATA") ? null : {
        gercekZamanli: evet(deger("DEF_RT")), tamper: evet(deger("DEF_TAMPER")),
        imza: deger("DEF_IMZA"), mod: deger("DEF_MOD"),
      },
      guvenlikDuvari: satir.filter((l) => l.startsWith("FW_")).map((l) => {
        const [k, v] = l.slice(3).split("=")
        return { profil: k, acik: evet(v) }
      }),
      nla: deger("NLA") == null || deger("NLA") === "" ? null : deger("NLA") === "1",
      yenidenBaslatmaBekliyor: evet(deger("REBOOT_CBS")) || evet(deger("REBOOT_WU")),
      sonGuncelleme: hotfix ? { kb: hotfix[0], tarih: hotfix[1] } : null,
      sonAcilis: deger("BOOT"),
      servisler,
    }
    onbellek.set(id, { at: Date.now(), veri })
    return NextResponse.json(veri)
  } catch (err) {
    console.error("[GET /api/servers/[id]/saglik]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
