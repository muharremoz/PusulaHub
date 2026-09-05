/**
 * ESXi (vSphere) adapter — fiziksel sunucunun donanım ve sağlık verisi.
 *
 * Üç ayrı kaynaktan okunuyor, hepsi aynı kimlikle ve düz HTTPS üzerinden:
 *
 *   1. `/sdk`     — vSphere SOAP API. Donanım künyesi, anlık CPU/RAM
 *                   kullanımı, çalışma süresi, donanım sensörleri (güç
 *                   kaynağı sağlığı buradan geliyor) ve veri deposu doluluğu.
 *   2. `/folder`  — datastore dosya erişimi. Her sanal makinenin
 *                   `vmware.log` dosyasının SON parçası okunup Veeam'in
 *                   bıraktığı anlık görüntü kayıtlarından son imaj yedeği
 *                   zamanı çıkarılıyor.
 *
 * ── Neden SOAP? ────────────────────────────────────────────────────────
 * Tek başına çalışan ESXi'de (vCenter yok) modern REST API'nin büyük kısmı
 * yok. `/sdk` her sürümde var ve donanım sensörlerini veren tek arayüz.
 * Bağımlılık eklemeden, elle XML kurup regex ile okuyoruz; alınan alanlar
 * sabit ve az olduğu için tam bir XML ayrıştırıcıya gerek yok.
 *
 * ── Neden node:https? ──────────────────────────────────────────────────
 * ESXi kendi imzaladığı sertifikayla geliyor. `fetch` bunu reddediyor ve
 * istisna tanımlamak için undici'ye dokunmak gerekiyor (bağımlılık yok).
 * `node:https` ile istek başına `rejectUnauthorized: false` en az yan
 * etkili yol — global TLS ayarı BOZULMUYOR.
 *
 * Env (Coolify → PusulaHub):
 *   ESXI_HOST      10.15.2.10
 *   ESXI_USER      root
 *   ESXI_PASSWORD  <parola>
 *
 * Kimlik yoksa fonksiyonlar `null` döner; çağıran taraf paneli gizler.
 */

import https from "node:https"

/* ══════════════════════════════════════════════════════════
   Tipler
══════════════════════════════════════════════════════════ */

export type SensorHealth = "green" | "yellow" | "red" | "unknown"

export interface EsxiSensor {
  /** Ham sensör adı — "Power Supply 1 Power Supply 1" */
  name:   string
  health: SensorHealth
  /** Okunabilir özet: "Power Supply AC lost" */
  summary: string
}

export interface EsxiPowerSupply {
  /** 1, 2, ... */
  index:  number
  health: SensorHealth
  summary: string
  /** Giriş gücü (W). Ölçüm yoksa null. */
  inputWatts:  number | null
  /** Çıkış gücü (W). */
  outputWatts: number | null
}

export interface EsxiDatastore {
  name:       string
  capacityGB: number
  freeGB:     number
  usedGB:     number
  percent:    number
}

export interface EsxiHost {
  /** "ProLiant DL380 Gen10" */
  model:  string
  vendor: string
  cpuModel: string
  cpuPackages: number
  cpuCores:    number
  cpuThreads:  number
  cpuMhz:      number
  /** Toplam işlemci kapasitesi (MHz) = çekirdek × hız */
  cpuTotalMhz: number
  /** Anlık kullanım (MHz) */
  cpuUsedMhz:  number
  ramTotalGB:  number
  ramUsedGB:   number
  /** Saniye */
  uptimeSeconds: number
  bootTime:      string | null
  powerSupplies: EsxiPowerSupply[]
  /** Kırmızı ya da sarı olan tüm sensörler (güç kaynakları dahil) */
  problemSensors: EsxiSensor[]
  /** Sensörlerin en kötüsü — panelin genel rengi */
  overallHealth: SensorHealth
  datastores: EsxiDatastore[]
}

export interface EsxiVmBackup {
  /** Sanal makine adı — "RDP Terminal (10.15.2.5)" */
  vmName: string
  /** Son imaj yedeği (ISO) — hiç alınmamışsa null */
  lastBackupAt: string | null
  /** Şu an yedek alınıyor mu (aktif anlık görüntü var) */
  running: boolean
  /** Günlükte görülen yedek sayısı — sıklık göstergesi */
  seenCount: number
}

/* ══════════════════════════════════════════════════════════
   HTTPS yardımcıları
══════════════════════════════════════════════════════════ */

interface HttpResult { status: number; body: string; headers: Record<string, string | string[] | undefined> }

function request(
  opts: { path: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
): Promise<HttpResult> {
  const host = process.env.ESXI_HOST
  if (!host) return Promise.reject(new Error("ESXI_HOST tanımlı değil"))

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        port: 443,
        path: opts.path,
        method: opts.method ?? "GET",
        headers: opts.headers,
        /*  ESXi kendi imzaladığı sertifikayla geliyor. Doğrulama yalnız BU
         *  istek için kapalı; global TLS ayarına dokunulmuyor.            */
        rejectUnauthorized: false,
        timeout: opts.timeoutMs ?? 20_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () =>
          resolve({
            status:  res.statusCode ?? 0,
            body:    Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          }),
        )
      },
    )
    req.on("timeout", () => { req.destroy(new Error("zaman aşımı")) })
    req.on("error", reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

/* ══════════════════════════════════════════════════════════
   SOAP
══════════════════════════════════════════════════════════ */

const SOAP_NS =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:vim25="urn:vim25">'

/** XML özel karakterlerini kaçır — parolada `&` ya da `<` olabilir. */
function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/** İlk `<tag>...</tag>` içeriği; yoksa null. */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)
  return m ? m[1] : null
}

async function soap(body: string, cookie?: string): Promise<HttpResult> {
  return request({
    path:   "/sdk",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction:     "urn:vim25/8.0.3.0",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: SOAP_NS + "<soapenv:Body>" + body + "</soapenv:Body></soapenv:Envelope>",
  })
}

/** Oturum aç → iş gör → oturumu kapat. Kapatma hatası yutulur. */
async function withSession<T>(fn: (cookie: string, pc: string) => Promise<T>): Promise<T> {
  const user = process.env.ESXI_USER
  const pass = process.env.ESXI_PASSWORD
  if (!user || !pass) throw new Error("ESXI_USER / ESXI_PASSWORD tanımlı değil")

  const sc = await soap(
    '<vim25:RetrieveServiceContent><vim25:_this type="ServiceInstance">ServiceInstance</vim25:_this>' +
    "</vim25:RetrieveServiceContent>",
  )
  const sessionMgr = tag(sc.body, "sessionManager")
  const propColl   = tag(sc.body, "propertyCollector")
  if (!sessionMgr || !propColl) throw new Error("ServiceContent okunamadı")

  const setCookie = sc.headers["set-cookie"]
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const cookie = raw ? raw.split(";")[0] : ""

  const login = await soap(
    `<vim25:Login><vim25:_this type="SessionManager">${sessionMgr}</vim25:_this>` +
    `<vim25:userName>${xmlEscape(user)}</vim25:userName>` +
    `<vim25:password>${xmlEscape(pass)}</vim25:password></vim25:Login>`,
    cookie,
  )
  if (login.body.includes("Fault")) {
    throw new Error("ESXi girişi reddedildi: " + (tag(login.body, "localizedMessage") ?? "bilinmeyen"))
  }
  const loginCookie0 = login.headers["set-cookie"]
  const loginRaw = Array.isArray(loginCookie0) ? loginCookie0[0] : loginCookie0
  const sessionCookie = loginRaw ? loginRaw.split(";")[0] : cookie

  try {
    return await fn(sessionCookie, propColl)
  } finally {
    try {
      await soap(
        `<vim25:Logout><vim25:_this type="SessionManager">${sessionMgr}</vim25:_this></vim25:Logout>`,
        sessionCookie,
      )
    } catch { /* oturum zaten düşmüş olabilir */ }
  }
}

/** Tek bir nesnenin istenen özelliklerini çeker. */
async function retrieve(
  cookie: string, propColl: string, type: string, obj: string, paths: string[],
): Promise<string> {
  const pathSet = paths.map((p) => `<vim25:pathSet>${p}</vim25:pathSet>`).join("")
  const res = await soap(
    `<vim25:RetrievePropertiesEx><vim25:_this type="PropertyCollector">${propColl}</vim25:_this>` +
    `<vim25:specSet><vim25:propSet><vim25:type>${type}</vim25:type>` +
    `<vim25:all>false</vim25:all>${pathSet}</vim25:propSet>` +
    `<vim25:objectSet><vim25:obj type="${type}">${obj}</vim25:obj>` +
    "<vim25:skip>false</vim25:skip></vim25:objectSet></vim25:specSet>" +
    "<vim25:options></vim25:options></vim25:RetrievePropertiesEx>",
    cookie,
  )
  return res.body
}

/** `<propSet><name>X</name><val ...>Y</val></propSet>` → Map */
function propMap(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<propSet><name>(.*?)<\/name><val[^>]*>([\s\S]*?)<\/val><\/propSet>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.set(m[1], m[2])
  return out
}

const num = (v: string | undefined | null): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function healthOf(raw: string | null): SensorHealth {
  const k = (raw ?? "").toLowerCase()
  if (k === "green" || k === "yellow" || k === "red") return k
  return "unknown"
}

const WORST: Record<SensorHealth, number> = { green: 0, unknown: 1, yellow: 2, red: 3 }

/* ══════════════════════════════════════════════════════════
   Host + veri deposu
══════════════════════════════════════════════════════════ */

let hostCache: { at: number; data: EsxiHost } | null = null
const HOST_TTL_MS = 60_000

export function esxiConfigured(): boolean {
  return Boolean(process.env.ESXI_HOST && process.env.ESXI_USER && process.env.ESXI_PASSWORD)
}

export async function fetchEsxiHost(force = false): Promise<EsxiHost | null> {
  if (!esxiConfigured()) return null
  if (!force && hostCache && Date.now() - hostCache.at < HOST_TTL_MS) return hostCache.data

  const data = await withSession(async (cookie, pc) => {
    const xml = await retrieve(cookie, pc, "HostSystem", "ha-host", [
      "summary.hardware.model",
      "summary.hardware.vendor",
      "summary.hardware.cpuModel",
      "summary.hardware.numCpuPkgs",
      "summary.hardware.numCpuCores",
      "summary.hardware.numCpuThreads",
      "summary.hardware.cpuMhz",
      "summary.hardware.memorySize",
      "summary.quickStats.overallCpuUsage",
      "summary.quickStats.overallMemoryUsage",
      "summary.quickStats.uptime",
      "runtime.bootTime",
      "runtime.healthSystemRuntime.systemHealthInfo.numericSensorInfo",
      "datastore",
    ])
    const p = propMap(xml)

    /* ── Sensörler ─────────────────────────────────────────────────────
     * Okuma değeri `currentReading × 10^unitModifier` ile ölçeklenir:
     * 21700 / modifier -2 → 217 V. Ölçeklemeyi atlarsak voltajlar yüz kat
     * büyük görünür.                                                     */
    const sensorBlocks = xml.match(/<HostNumericSensorInfo[^>]*>[\s\S]*?<\/HostNumericSensorInfo>/g) ?? []
    const psMap = new Map<number, EsxiPowerSupply>()
    const problems: EsxiSensor[] = []
    let overall: SensorHealth = "green"

    for (const b of sensorBlocks) {
      const name    = tag(b, "name") ?? ""
      const health  = healthOf(tag(b, "key"))
      const summary = tag(b, "summary") ?? ""
      const reading = num(tag(b, "currentReading"))
      const modif   = num(tag(b, "unitModifier"))
      const units   = (tag(b, "baseUnits") ?? "").toLowerCase()
      const value   = reading * Math.pow(10, modif)

      if (WORST[health] > WORST[overall]) overall = health
      if (health === "red" || health === "yellow") problems.push({ name, health, summary })

      const psIdx = /^Power Supply (\d+)/.exec(name)
      if (!psIdx) continue
      const idx = Number(psIdx[1])
      const cur = psMap.get(idx) ?? { index: idx, health: "unknown" as SensorHealth, summary: "", inputWatts: null, outputWatts: null }

      /*  Güç kaynağının GENEL durumu "Power Supply 1 Power Supply 1" gibi
       *  ada sahip ayrık sensörde; voltaj/akım sensörleri hep yeşil
       *  olabildiği için genel durumu onlardan çıkarmak yanıltıcı olurdu. */
      if (/^Power Supply \d+ Power Supply \d+$/.test(name.trim())) {
        cur.health = health
        cur.summary = summary
      }
      if (units.includes("watt")) {
        if (/Input/i.test(name))  cur.inputWatts  = value
        if (/Output/i.test(name)) cur.outputWatts = value
      }
      psMap.set(idx, cur)
    }

    /* ── Veri depoları ── */
    const dsIds = [...(p.get("datastore") ?? "").matchAll(/<ManagedObjectReference[^>]*>(.*?)<\/ManagedObjectReference>/g)]
      .map((m) => m[1])
    const datastores: EsxiDatastore[] = []
    for (const id of dsIds) {
      const dsXml = await retrieve(cookie, pc, "Datastore", id, [
        "summary.name", "summary.capacity", "summary.freeSpace", "summary.accessible",
      ])
      const d = propMap(dsXml)
      const cap  = num(d.get("summary.capacity"))
      const free = num(d.get("summary.freeSpace"))
      if (!cap) continue
      const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10
      datastores.push({
        name:       d.get("summary.name") ?? id,
        capacityGB: gb(cap),
        freeGB:     gb(free),
        usedGB:     gb(cap - free),
        percent:    Math.round(((cap - free) / cap) * 100),
      })
    }

    const cores = num(p.get("summary.hardware.numCpuCores"))
    const mhz   = num(p.get("summary.hardware.cpuMhz"))

    const host: EsxiHost = {
      model:       p.get("summary.hardware.model")    ?? "—",
      vendor:      p.get("summary.hardware.vendor")   ?? "",
      cpuModel:    p.get("summary.hardware.cpuModel") ?? "",
      cpuPackages: num(p.get("summary.hardware.numCpuPkgs")),
      cpuCores:    cores,
      cpuThreads:  num(p.get("summary.hardware.numCpuThreads")),
      cpuMhz:      mhz,
      cpuTotalMhz: cores * mhz,
      cpuUsedMhz:  num(p.get("summary.quickStats.overallCpuUsage")),
      ramTotalGB:  Math.round((num(p.get("summary.hardware.memorySize")) / 1024 ** 3) * 10) / 10,
      ramUsedGB:   Math.round((num(p.get("summary.quickStats.overallMemoryUsage")) / 1024) * 10) / 10,
      uptimeSeconds: num(p.get("summary.quickStats.uptime")),
      bootTime:      p.get("runtime.bootTime") ?? null,
      powerSupplies: [...psMap.values()].sort((a, b) => a.index - b.index),
      problemSensors: problems,
      overallHealth:  overall,
      datastores,
    }
    return host
  })

  hostCache = { at: Date.now(), data }
  return data
}

/* ══════════════════════════════════════════════════════════
   İmaj yedekleri
══════════════════════════════════════════════════════════ */

let backupCache: { at: number; data: EsxiVmBackup[] } | null = null
const BACKUP_TTL_MS = 5 * 60_000

/** Veeam'in günlüğe bıraktığı iz — imaj yedeği bunu oluşturur. */
const VEEAM_SNAPSHOT = /(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)[\s\S]{0,300}?VEEAM BACKUP TEMPORARY SNAPSHOT/g

/**
 * Her sanal makine için son imaj yedeği zamanı.
 *
 * `vmware.log` dosyasının yalnız SON 200 KB'ı okunuyor (HTTP Range):
 * dosya büyük olabiliyor ve bize sadece son kayıtlar lazım. Bu pencerede
 * hiç iz yoksa yedek "alınmamış" sayılıyor — makine yeni kurulmuşsa ya da
 * yedek işine eklenmemişse durum budur.
 */
export async function fetchEsxiBackups(force = false): Promise<EsxiVmBackup[] | null> {
  if (!esxiConfigured()) return null
  if (!force && backupCache && Date.now() - backupCache.at < BACKUP_TTL_MS) return backupCache.data

  const user = process.env.ESXI_USER!
  const pass = process.env.ESXI_PASSWORD!
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")

  const vms = await withSession(async (cookie, pc) => {
    const xml = await retrieve(cookie, pc, "HostSystem", "ha-host", ["vm"])
    const ids = [...(propMap(xml).get("vm") ?? "").matchAll(/<ManagedObjectReference[^>]*>(.*?)<\/ManagedObjectReference>/g)]
      .map((m) => m[1])

    const out: { name: string; ds: string; folder: string; running: boolean }[] = []
    for (const id of ids) {
      const vmXml = await retrieve(cookie, pc, "VirtualMachine", id, [
        "name", "config.files.vmPathName", "snapshot",
      ])
      const v = propMap(vmXml)
      /*  `snapshot` özelliği YALNIZ anlık görüntü varsa yanıtta yer alır.
       *  Metinde "snapshot" aramak yanıltıcıydı: istenen özellik adı da
       *  yanıtta geçtiği için anlık görüntüsü olmayan makineler de
       *  "yedek alınıyor" görünüyordu.                                   */
      const hasSnapshot = v.has("snapshot")
      /*  "[Pusula_2TB] RDP (10.15.2.5)/RDP (10.15.2.5).vmx"
       *  → ds "Pusula_2TB", klasör "RDP (10.15.2.5)"                     */
      const pathName = v.get("config.files.vmPathName") ?? ""
      const m = /^\[(.+?)\]\s*(.+?)\//.exec(pathName)
      if (!m) continue
      out.push({
        name:    v.get("name") ?? "—",
        ds:      m[1],
        folder:  m[2],
        running: hasSnapshot,
      })
    }
    return out
  })

  const results: EsxiVmBackup[] = []
  for (const vm of vms) {
    let lastBackupAt: string | null = null
    let seenCount = 0
    try {
      const path = `/folder/${encodeURIComponent(vm.folder)}/vmware.log?dsName=${encodeURIComponent(vm.ds)}`
      const res = await request({
        path,
        headers: { Authorization: auth, Range: "bytes=-200000" },
        timeoutMs: 15_000,
      })
      if (res.status === 200 || res.status === 206) {
        const times = [...res.body.matchAll(VEEAM_SNAPSHOT)].map((m) => m[1])
        seenCount = times.length
        if (times.length) lastBackupAt = times[times.length - 1] + "Z"
      }
    } catch { /* günlük okunamadı — yedek durumu bilinmiyor sayılır */ }

    results.push({ vmName: vm.name, lastBackupAt, running: vm.running, seenCount })
  }

  results.sort((a, b) => a.vmName.localeCompare(b.vmName, "tr"))
  backupCache = { at: Date.now(), data: results }
  return results
}

export function invalidateEsxiCache(): void {
  hostCache = null
  backupCache = null
}
