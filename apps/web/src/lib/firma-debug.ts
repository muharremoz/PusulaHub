/**
 * Firma debug izleme — Pusula programının `debugsql.txt` dosyası.
 *
 * Program kendi klasöründe (C:\MUSTERI\{firkod}\{program}) bu dosya VARSA
 * çalıştırdığı her SQL'i oraya yazar. Burada agent ile dosya açılır, parça
 * parça okunur, silinir. İki tüketici var:
 *   - Hub firma detay → Debug   (/api/companies/[firkod]/debug)
 *   - SQL Konsol, CRM üzerinden (/api/hub/firma-debug, x-internal-key)
 *
 * Kurallar:
 *   - Okuma ofsetli: her seferinde yalnız yeni eklenen kısım (en fazla
 *     OKUMA_PARCA). Dosyanın tamamı her 5 sn'de taşınmaz.
 *   - Her izleyici hub.firma_debug'da bir satır. Dosya SON izleyici durunca
 *     silinir; 10 dk okunmayan izleyiciyi poller kapatır (debugTemizle).
 *   - Dosya BOYUT_SINIRI'nı aşarsa izleme kendiliğinden durur.
 *   - Agent PS komutlarında çift tırnak ve ^ yok (CLAUDE.md, agent exec).
 */
// Göreli import: server.ts (tsx) de yüklüyor — poller temizliği.
import { getSupabaseAdmin } from "./supabase/admin"
import { execOnAgent } from "./agent-poller"

const hub = () => getSupabaseAdmin().schema("hub")

export const OKUMA_PARCA   = 128 * 1024
export const BOYUT_SINIRI  = 20 * 1024 * 1024
export const ZAMAN_ASIMI_DK = 10

export type DurmaSebebi = "kullanici" | "zaman-asimi" | "boyut" | "dosya-yok"

export class DebugHatasi extends Error {
  constructor(message: string, public durum = 500, public sunucuGerekli = false) { super(message) }
}

interface Agent { id: string; name: string; ip: string; port: number; key: string }
interface AgentRow { id: string; name: string; ip: string; agent_port: number | null; api_key: string | null }

const toAgent = (r: AgentRow | null): Agent | null =>
  r && r.agent_port != null && r.api_key ? { id: r.id, name: r.name, ip: r.ip, port: r.agent_port, key: r.api_key } : null

async function sunucuGetir(id: string): Promise<Agent | null> {
  const { data } = await hub().from("servers").select("id, name, ip, agent_port, api_key").eq("id", id).maybeSingle()
  return toAgent(data as AgentRow | null)
}

/** Firmanın Windows (terminal) sunucusu; serverId verilirse o. */
async function firmaAgent(firkod: string, serverId?: string): Promise<Agent> {
  if (serverId) {
    const a = await sunucuGetir(serverId)
    if (!a) throw new DebugHatasi("Sunucu bulunamadı ya da agent'ı yok", 404, true)
    return a
  }
  const { data } = await hub().from("companies").select("windows_server_id").eq("company_id", firkod).maybeSingle()
  const wsid = (data as { windows_server_id: string | null } | null)?.windows_server_id
  const a = wsid ? await sunucuGetir(wsid) : null
  if (!a) throw new DebugHatasi("Bu firmaya Windows sunucusu tanımlı değil", 404, true)
  return a
}

/** Agent'lı tüm sunucular — firmaya sunucu tanımlı değilse Hub ekranı seçtirir. */
export async function agentliSunucular(): Promise<{ Id: string; Name: string; IP: string }[]> {
  const { data } = await hub().from("servers").select("id, name, ip, agent_port, api_key").order("name")
  return ((data ?? []) as AgentRow[])
    .filter((s) => s.agent_port != null && s.api_key)
    .map((s) => ({ Id: s.id, Name: s.name, IP: s.ip }))
}

/* ── yol / komut yardımcıları ── */

const ps = (s: string) => s.replace(/'/g, "''")
const firmaKoku = (firkod: string) => `C:\\MUSTERI\\${firkod}`

function firkodGecerli(firkod: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(firkod)) throw new DebugHatasi("firkod geçersiz", 400)
}

/** Alt klasör adı: yol ayıracı ve Windows'ta geçersiz karakter yok. */
function altKlasorGecerli(s: string): void {
  if (!s || !/^[^\\/:*?"<>|]+$/.test(s) || s === "." || s === "..") throw new DebugHatasi("Program klasörü geçersiz", 400)
}

async function calistir(a: Agent, cmd: string): Promise<string> {
  const r = await execOnAgent(a.ip, a.port, a.key, cmd, 15)
  if (r.exitCode !== 0) throw new DebugHatasi(r.stderr || r.stdout || "Agent komutu başarısız")
  return r.stdout ?? ""
}

async function dosyaSil(a: Agent, path: string): Promise<void> {
  await calistir(a, `if(Test-Path -LiteralPath '${ps(path)}'){ Remove-Item -LiteralPath '${ps(path)}' -Force }; Write-Output 'OK'`)
}

/* ── klasörler ── */

export async function klasorler(firkod: string, serverId?: string) {
  firkodGecerli(firkod)
  const a = await firmaAgent(firkod, serverId)
  const kok = firmaKoku(firkod)
  const out = (await calistir(a,
    `if(Test-Path -LiteralPath '${ps(kok)}'){ (Get-ChildItem -LiteralPath '${ps(kok)}' -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join [char]10 } else { Write-Output '__NOROOT__' }`,
  )).trim()
  if (out === "__NOROOT__") return { klasorler: [] as string[], kok, eksik: true, sunucu: a.name }
  return { klasorler: out ? out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [], kok, eksik: false, sunucu: a.name }
}

/* ── başlat ── */

export interface Baslatildi { id: string; path: string; sunucu: string; paylasimli: boolean }

/**
 * Dosya yoksa boş açılır. Varsa (başka izleyici açmış ya da elle konmuş)
 * KESİLMEZ — aynı dosya okunur; `paylasimli` bunu söyler.
 */
export async function baslat(
  firkod: string, altKlasor: string,
  o: { serverId?: string; kaynak: "hub" | "sql-konsol"; kim: string | null },
): Promise<Baslatildi> {
  firkodGecerli(firkod)
  altKlasorGecerli(altKlasor)
  const a = await firmaAgent(firkod, o.serverId)
  const klasor = `${firmaKoku(firkod)}\\${altKlasor}`
  const path = `${klasor}\\debugsql.txt`

  const out = (await calistir(a,
    `if(-not (Test-Path -LiteralPath '${ps(klasor)}')){ Write-Output '__NOFOLDER__'; exit 0 }; ` +
    `if(Test-Path -LiteralPath '${ps(path)}'){ Write-Output 'VAR' } else { New-Item -ItemType File -Path '${ps(path)}' | Out-Null; if(Test-Path -LiteralPath '${ps(path)}'){ Write-Output 'YENI' } else { Write-Output '__FAIL__' } }`,
  )).trim()
  if (out === "__NOFOLDER__") throw new DebugHatasi(`Klasör yok: ${klasor}`, 404)
  if (out !== "VAR" && out !== "YENI") throw new DebugHatasi("debugsql.txt oluşturulamadı")

  const { data, error } = await hub().from("firma_debug").insert({
    company_id: firkod, server_id: a.id, subfolder: altKlasor, path, kaynak: o.kaynak, started_by: o.kim,
  }).select("id").single()
  if (error || !data) {
    // Kayıt tutulamadıysa açtığımız dosyayı sahipsiz bırakma
    if (out === "YENI") await dosyaSil(a, path).catch(() => {})
    throw new DebugHatasi(error?.message ?? "Debug kaydı oluşturulamadı")
  }
  return { id: (data as { id: string }).id, path, sunucu: a.name, paylasimli: out === "VAR" }
}

/* ── oku ── */

interface DebugRow { id: string; company_id: string; server_id: string; path: string; stopped_at: string | null; stop_reason: string | null }

async function kayitGetir(firkod: string, id: string): Promise<DebugRow> {
  const { data } = await hub().from("firma_debug")
    .select("id, company_id, server_id, path, stopped_at, stop_reason").eq("id", id).maybeSingle()
  const r = data as DebugRow | null
  // Başka firmanın kaydı da "yok" sayılır
  if (!r || r.company_id !== firkod) throw new DebugHatasi("Debug kaydı bulunamadı", 404)
  return r
}

export interface Okunan {
  icerik: string
  /** Bir sonraki okumanın başlayacağı bayt. */
  ofset: number
  boyut: number
  /** Okunmamış veri kaldı — hemen tekrar okunabilir. */
  devami: boolean
  /** Doluysa izleme bitti (bu okumada ya da önceden). */
  durdu: DurmaSebebi | null
}

/** Pusula dosyayı ANSI (Türkçe Windows → 1254) yazar. */
const cozucu = new TextDecoder("windows-1254")

export async function oku(firkod: string, id: string, ofset: number): Promise<Okunan> {
  const r = await kayitGetir(firkod, id)
  if (r.stopped_at) return { icerik: "", ofset, boyut: 0, devami: false, durdu: (r.stop_reason as DurmaSebebi) ?? "kullanici" }
  const a = await sunucuGetir(r.server_id)
  if (!a) throw new DebugHatasi("Sunucunun agent'ı yok", 404)

  const o = Number.isFinite(ofset) && ofset > 0 ? Math.floor(ofset) : 0
  // Program dosyayı açık tutar → ReadWrite+Delete paylaşımıyla aç; kopyaya gerek yok.
  const out = (await calistir(a,
    `$p='${ps(r.path)}'; if(-not (Test-Path -LiteralPath $p)){ Write-Output '__NOFILE__'; exit 0 }; ` +
    `$fs=[IO.File]::Open($p,'Open','Read','ReadWrite,Delete'); try { ` +
    `$len=$fs.Length; $o=[long]${o}; if($o -gt $len){ $o=0 }; $n=[int][Math]::Min($len-$o,${OKUMA_PARCA}); ` +
    `$buf=New-Object byte[] $n; [void]$fs.Seek($o,'Begin'); $r=0; while($r -lt $n){ $k=$fs.Read($buf,$r,$n-$r); if($k -le 0){ break }; $r+=$k }; ` +
    `Write-Output ('__OK__' + $len + '|' + $o + '|' + [Convert]::ToBase64String($buf,0,$r)) } finally { $fs.Close() }`,
  )).trim()

  if (out === "__NOFILE__") {
    // Elle silinmiş ya da program/başka izleyici kaldırmış
    await kapat(r.id, "dosya-yok")
    return { icerik: "", ofset: o, boyut: 0, devami: false, durdu: "dosya-yok" }
  }
  const m = out.match(/__OK__(\d+)\|(\d+)\|([A-Za-z0-9+/=]*)/)
  if (!m) throw new DebugHatasi("Agent yanıtı çözülemedi")
  const boyut = Number(m[1])
  const bas = Number(m[2])
  const bayt = Buffer.from(m[3], "base64")
  const yeniOfset = bas + bayt.length

  await hub().from("firma_debug").update({ last_read_at: new Date().toISOString() }).eq("id", r.id)

  if (boyut > BOYUT_SINIRI) {
    await durdur(firkod, r.id, "boyut").catch(() => {})
    return { icerik: cozucu.decode(bayt), ofset: yeniOfset, boyut, devami: false, durdu: "boyut" }
  }
  return { icerik: cozucu.decode(bayt), ofset: yeniOfset, boyut, devami: yeniOfset < boyut, durdu: null }
}

/* ── durdur ── */

async function kapat(id: string, sebep: DurmaSebebi): Promise<void> {
  await hub().from("firma_debug").update({ stopped_at: new Date().toISOString(), stop_reason: sebep })
    .eq("id", id).is("stopped_at", null)
}

/** Bu izleyiciyi kapatır; dosyayı başka izleyen yoksa siler. */
export async function durdur(firkod: string, id: string, sebep: DurmaSebebi = "kullanici"): Promise<{ silindi: boolean }> {
  const r = await kayitGetir(firkod, id)
  return kapatVeTemizle(r, sebep)
}

/**
 * Önce dosya (başka açık izleyici yoksa), SONRA satır kapanır: agent'a
 * ulaşılamazsa satır açık kalır ve poller bir sonraki turda yeniden dener.
 */
async function kapatVeTemizle(r: Pick<DebugRow, "id" | "server_id" | "path">, sebep: DurmaSebebi): Promise<{ silindi: boolean }> {
  const { count } = await hub().from("firma_debug").select("id", { count: "exact", head: true })
    .eq("server_id", r.server_id).eq("path", r.path).is("stopped_at", null).neq("id", r.id)
  let silindi = false
  if ((count ?? 0) === 0) {
    const a = await sunucuGetir(r.server_id)
    if (a) { await dosyaSil(a, r.path); silindi = true }
  }
  await kapat(r.id, sebep)
  return { silindi }
}

/* ── poller: sahipsiz izleyiciler ── */

/** ZAMAN_ASIMI_DK boyunca okunmayan izleyicileri kapatır, dosyayı siler. */
export async function debugTemizle(): Promise<void> {
  const sinir = new Date(Date.now() - ZAMAN_ASIMI_DK * 60_000).toISOString()
  const { data } = await hub().from("firma_debug").select("id, server_id, path")
    .is("stopped_at", null).lt("last_read_at", sinir).limit(20)
  for (const r of (data ?? []) as Pick<DebugRow, "id" | "server_id" | "path">[]) {
    try {
      const { silindi } = await kapatVeTemizle(r, "zaman-asimi")
      console.log(`[Debug] Zaman aşımı: ${r.path}${silindi ? " silindi" : " (başka izleyici var)"}`)
    } catch (err) {
      // Satır açık kalır → bir sonraki turda yeniden denenir.
      console.error(`[Debug] Temizlenemedi: ${r.path}`, err instanceof Error ? err.message : err)
    }
  }
}
