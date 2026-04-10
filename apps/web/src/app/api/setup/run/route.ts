import { NextRequest } from "next/server"
import { query, execute } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { restoreBackupOnServer } from "@/lib/sql-restore"
import { insertGuvenlikRow } from "@/lib/sirket-guvenlik"
import { deriveDataName } from "@/lib/demo-database-naming"
import {
  buildEnsureFirmalarOu,
  buildEnsureFirmaOu,
  buildEnsureGroup,
  buildCreateUser,
  buildAddGroupMember,
} from "@/lib/ad-powershell"
import {
  buildCreateDir,
  buildCopyFolder,
  buildSetNtfsPermissions,
  buildUpdateParamTxt,
} from "@/lib/setup-fileops"
import {
  buildReplaceInFile,
  buildCreateIisSite,
} from "@/lib/setup-iisops"
import {
  buildCreateShortcut,
  sanitizeWindowsName,
} from "@/lib/setup-shortcuts"
import type {
  ServiceType,
  ServiceConfig,
  PusulaProgramConfig,
  IisSiteConfig,
} from "@/app/api/services/route"

/**
 * POST /api/setup/run
 *
 * Firma kurulum sihirbazının "Çalıştır" adımı. AD sunucusunda OU + güvenlik
 * grubu + kullanıcılar + grup üyeliklerini oluşturur. İlerlemeyi SSE
 * (text/event-stream) olarak akıtır.
 *
 * Event tipleri:
 *   - step  { stepId, label, status: "running"|"done"|"error", output?, error? }
 *   - done  { ok: true, summary }
 *   - error { message }                    (toplam akışı bozan hata)
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface RunUser {
  username:    string
  displayName: string
  email:       string
  phone:       string
  password:    string
}

interface RunService {
  id:     number
  name:   string
  type:   ServiceType
  config: ServiceConfig | null
}

/** Pattern içindeki {firmaKod} / {port} placeholder'larını değiştirir. */
function expandPattern(pattern: string, firmaId: string, port?: number): string {
  return pattern
    .replace(/\{firmaKod\}/gi, firmaId)
    .replace(/\{firmaId\}/gi,  firmaId)
    .replace(/\{port\}/gi,     port !== undefined ? String(port) : "")
}

/**
 * Verilen aralıktaki ilk boş portu bulup WizardPortAssignments'a ekler.
 * UNIQUE constraint sayesinde race-safe: çakışma olursa bir sonraki portu dener.
 */
async function allocatePort(
  rangeId:   number,
  serviceId: number,
  companyId: string,
  siteName:  string,
): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
  const ranges = await query<{ PortStart: number; PortEnd: number; IsActive: boolean }[]>`
    SELECT PortStart, PortEnd, IsActive FROM WizardPortRanges WHERE Id = ${rangeId}
  `
  if (!ranges.length)         return { ok: false, error: "Port aralığı bulunamadı" }
  if (!ranges[0].IsActive)    return { ok: false, error: "Port aralığı pasif" }

  const used = await query<{ Port: number }[]>`
    SELECT Port FROM WizardPortAssignments WHERE PortRangeId = ${rangeId}
  `
  const usedSet = new Set(used.map((u) => u.Port))

  for (let p = ranges[0].PortStart; p <= ranges[0].PortEnd; p++) {
    if (usedSet.has(p)) continue
    try {
      await execute`
        INSERT INTO WizardPortAssignments (PortRangeId, ServiceId, CompanyId, Port, SiteName)
        VALUES (${rangeId}, ${serviceId}, ${companyId}, ${p}, ${siteName})
      `
      return { ok: true, port: p }
    } catch {
      // UNIQUE çakışması — başka bir kurulum aynı anda aldı, sıradaki portu dene
      continue
    }
  }
  return { ok: false, error: "Aralıkta boş port kalmadı" }
}

interface RunBackupFile {
  /** Kaynak .bak dosya adı (backupFolderPath altında) */
  fileName:     string
  /** Hedef DB adı — kullanıcı sheet'te düzenledi (firma prefix yok) */
  databaseName: string
}

interface RunPayload {
  /** AD sunucusu — OU/grup/kullanıcı adımları (1-4) bu agent'a gider. */
  serverId:         string
  /** Windows/RDP sunucusu — pusula-program klasör/copy/param/NTFS adımları bu agent'a gider. */
  windowsServerId?: string
  /** IIS sunucusu — iis-site klasör/copy/port/config/site adımları bu agent'a gider. */
  iisServerId?:     string
  firmaId:          string
  firmaName:        string
  users:            RunUser[]
  /** Opsiyonel: hizmet kopyalama adımları. Boş ise sadece AD akışı çalışır. */
  services?:        RunService[]

  /* ── 4. adım: SQL ─────────────────────────────────────────────
   * Tamamen opsiyonel. `sqlServerId` yoksa SQL akışı tamamen atlanır.
   * Aksi halde seçili mod'a göre yedekten yükleme veya demo DB restore'u
   * çalıştırılır ve (addToSirketDb ? → sirket.dbo.guvenlik) kayıt eklenir.
   */
  sqlServerId?:      string
  /** 0: Yedekten Yükle  1: Demo Veritabanı */
  sqlMode?:          0 | 1
  /** Mode 0 için: backupFolderPath altındaki seçili .bak dosyaları */
  backupFolderPath?: string
  backupFiles?:      RunBackupFile[]
  /** Mode 1 için: seçili demo DB id'leri (DemoDatabases tablosundan okunacak) */
  selectedDemoDbIds?: number[]
  /** Her iki mod için: firma ID prefix ekle (`{firmaId}_{dbName}`) */
  addFirmaPrefix?:   boolean
  /** sirket.dbo.guvenlik tablosuna kayıt eklensin mi */
  addToSirketDb?:    boolean
}

interface ServerRow {
  IP:        string
  AgentPort: number | null
  ApiKey:    string | null
}

interface SqlServerRow {
  Id:          string
  Name:        string
  IP:          string
  SqlUsername: string | null
  SqlPassword: string | null
}

interface AgentTarget {
  ip:        string
  port:      number
  apiKey:    string
}

interface SqlTarget {
  id:       string
  name:     string
  ip:       string
  username: string
  password: string
}

/** Demo DB tablosundan run akışı için gerekli alanlar. */
interface DemoDbRow {
  Id:           number
  Name:         string
  DataName:     string
  LocationType: string
  LocationPath: string | null
}

export async function POST(req: NextRequest) {
  let payload: RunPayload
  try {
    payload = (await req.json()) as RunPayload
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!payload.serverId || !payload.firmaId || !Array.isArray(payload.users)) {
    return new Response(JSON.stringify({ error: "serverId, firmaId, users zorunlu" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // AD sunucusu (1-4. adımlar)
  const adRows = await query<ServerRow[]>`
    SELECT IP, AgentPort, ApiKey FROM Servers WHERE Id = ${payload.serverId}
  `
  if (!adRows.length || !adRows[0].ApiKey || !adRows[0].AgentPort) {
    return new Response(JSON.stringify({ error: "AD sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const adAgent: AgentTarget = {
    ip:     adRows[0].IP,
    port:   adRows[0].AgentPort!,
    apiKey: adRows[0].ApiKey!,
  }

  // Hizmetleri tipine göre ayır
  const services       = payload.services ?? []
  const pusulaServices = services.filter((s) => s.type === "pusula-program")
  const iisServices    = services.filter((s) => s.type === "iis-site")

  // Windows/RDP sunucusu — yalnızca pusula-program varsa zorunlu
  let winAgent: AgentTarget | null = null
  if (pusulaServices.length > 0) {
    if (!payload.windowsServerId) {
      return new Response(JSON.stringify({ error: "Pusula programları için windowsServerId zorunlu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const winRows = await query<ServerRow[]>`
      SELECT IP, AgentPort, ApiKey FROM Servers WHERE Id = ${payload.windowsServerId}
    `
    if (!winRows.length || !winRows[0].ApiKey || !winRows[0].AgentPort) {
      return new Response(JSON.stringify({ error: "Windows sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    winAgent = {
      ip:     winRows[0].IP,
      port:   winRows[0].AgentPort!,
      apiKey: winRows[0].ApiKey!,
    }
  }

  // IIS sunucusu — yalnızca iis-site varsa zorunlu
  let iisAgent: AgentTarget | null = null
  if (iisServices.length > 0) {
    if (!payload.iisServerId) {
      return new Response(JSON.stringify({ error: "IIS hizmetleri için iisServerId zorunlu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const iisRows = await query<ServerRow[]>`
      SELECT IP, AgentPort, ApiKey FROM Servers WHERE Id = ${payload.iisServerId}
    `
    if (!iisRows.length || !iisRows[0].ApiKey || !iisRows[0].AgentPort) {
      return new Response(JSON.stringify({ error: "IIS sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    iisAgent = {
      ip:     iisRows[0].IP,
      port:   iisRows[0].AgentPort!,
      apiKey: iisRows[0].ApiKey!,
    }
  }

  // Depo sunucusu — Role='Depo' olan sunucu. Opsiyonel; yoksa depo adımları atlanır.
  let depoAgent: AgentTarget | null = null
  const depoRows = await query<ServerRow[]>`
    SELECT s.IP, s.AgentPort, s.ApiKey
    FROM Servers s
    INNER JOIN ServerRoles r ON r.ServerId = s.Id
    WHERE r.Role = 'Depo'
  `
  if (depoRows.length > 0 && depoRows[0].AgentPort && depoRows[0].ApiKey) {
    depoAgent = {
      ip:     depoRows[0].IP,
      port:   depoRows[0].AgentPort!,
      apiKey: depoRows[0].ApiKey!,
    }
  }

  // SQL sunucusu — 4. adımda seçildiyse. Tamamen opsiyonel; seçilmemişse
  // SQL akışı sessizce atlanır.
  let sqlTarget: SqlTarget | null = null
  let demoDbsForRun: DemoDbRow[] = []
  const runSqlMode     = payload.sqlMode === 1 ? 1 : 0
  const runAddPrefix   = payload.addFirmaPrefix !== false
  const runAddSirket   = payload.addToSirketDb === true
  const runBackupFiles = Array.isArray(payload.backupFiles) ? payload.backupFiles : []
  const runBackupFolder = (payload.backupFolderPath ?? "").trim().replace(/[\\/]+$/, "")
  const runDemoDbIds   = Array.isArray(payload.selectedDemoDbIds) ? payload.selectedDemoDbIds : []

  const hasSqlWork =
    !!payload.sqlServerId &&
    ((runSqlMode === 0 && runBackupFiles.length > 0) ||
     (runSqlMode === 1 && runDemoDbIds.length > 0))

  if (hasSqlWork) {
    const sqlRows = await query<SqlServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.SqlUsername, s.SqlPassword
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${payload.sqlServerId!} AND r.Role = 'SQL'
    `
    if (!sqlRows.length) {
      return new Response(JSON.stringify({ error: "SQL sunucusu bulunamadı veya SQL rolü atanmamış" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const row = sqlRows[0]
    if (!row.SqlUsername || !row.SqlPassword) {
      return new Response(JSON.stringify({
        error: `${row.Name} sunucusu için SA kullanıcı adı/şifresi tanımlanmamış. Sunucu ayarlarından ekleyin.`,
      }), { status: 400, headers: { "Content-Type": "application/json" } })
    }
    const decrypted = decrypt(row.SqlPassword)
    if (!decrypted) {
      return new Response(JSON.stringify({
        error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin.",
      }), { status: 500, headers: { "Content-Type": "application/json" } })
    }
    sqlTarget = {
      id:       row.Id,
      name:     row.Name,
      ip:       row.IP,
      username: row.SqlUsername,
      password: decrypted,
    }

    // Mode 1: demo DB bilgilerini DB'den çek (client'a güvenmiyoruz; kaynak/yol
    // sunucu tarafında gerçek olmalı).
    if (runSqlMode === 1 && runDemoDbIds.length > 0) {
      // SQL Server'ın parametreli IN clause'u için tek tek template literal
      const placeholders = runDemoDbIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
      if (placeholders.length > 0) {
        // `query` tagged template IN () doğrudan desteklemiyor — yardımcı
        const rows = await query<DemoDbRow[]>`
          SELECT Id, Name, DataName, LocationType, LocationPath
          FROM DemoDatabases
          WHERE IsActive = 1
        `
        demoDbsForRun = rows.filter((r) => placeholders.includes(r.Id))
      }
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      const runStep = async (
        agent:   AgentTarget,
        stepId:  string,
        label:   string,
        command: string,
      ): Promise<boolean> => {
        send("step", { stepId, label, status: "running" })

        const result = await execOnAgent(agent.ip, agent.port, agent.apiKey, command, 60)

        // PowerShell hata: exitCode != 0 VEYA stderr doluysa
        const stderr = (result.stderr ?? "").trim()
        if (result.exitCode !== 0 || stderr) {
          send("step", {
            stepId,
            label,
            status: "error",
            error:  stderr || result.stdout || `exit ${result.exitCode}`,
          })
          return false
        }

        send("step", {
          stepId,
          label,
          status: "done",
          output: (result.stdout ?? "").trim(),
        })
        return true
      }

      /** SQL bloğunda kullanılacak — async task'ı sarmalar, hata → step error. */
      const runSqlStep = async (
        stepId: string,
        label:  string,
        fn:     () => Promise<string | void>,
      ): Promise<boolean> => {
        send("step", { stepId, label, status: "running" })
        try {
          const output = await fn()
          send("step", {
            stepId,
            label,
            status: "done",
            output: typeof output === "string" ? output : undefined,
          })
          return true
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          send("step", { stepId, label, status: "error", error: msg })
          return false
        }
      }

      try {
        // ── 1-4) AD adımları → AD agent ─────────────────────────────

        // 1) Firmalar root OU
        if (!(await runStep(
          adAgent,
          "ou_root",
          "'Firmalar' OU kontrolü",
          buildEnsureFirmalarOu(),
        ))) { controller.close(); return }

        // 2) Firma OU
        if (!(await runStep(
          adAgent,
          "ou_firma",
          `OU oluşturuluyor: Firmalar\\${payload.firmaId}`,
          buildEnsureFirmaOu(payload.firmaId),
        ))) { controller.close(); return }

        // 3) Güvenlik grubu
        if (!(await runStep(
          adAgent,
          "group",
          `Güvenlik grubu: ${payload.firmaId}_users`,
          buildEnsureGroup(payload.firmaId),
        ))) { controller.close(); return }

        // 4) Kullanıcılar (her biri için: oluştur + gruba ekle)
        let createdCount = 0
        for (const u of payload.users) {
          const fullUsername = `${payload.firmaId}.${u.username.trim()}`

          const userOk = await runStep(
            adAgent,
            `user_${u.username}`,
            `Kullanıcı oluşturuluyor: ${fullUsername}`,
            buildCreateUser(payload.firmaId, {
              username:    fullUsername,
              password:    u.password,
              displayName: u.displayName || fullUsername,
              email:       u.email,
              phone:       u.phone,
              office:      payload.firmaName,
            }),
          )
          if (!userOk) { controller.close(); return }

          const memberOk = await runStep(
            adAgent,
            `member_${u.username}`,
            `Gruba ekleniyor: ${fullUsername} → ${payload.firmaId}_users`,
            buildAddGroupMember(payload.firmaId, fullUsername),
          )
          if (!memberOk) { controller.close(); return }

          createdCount++
        }

        // ── 4b) Depo sunucusu — resim klasörü (opsiyonel, non-critical) ──
        if (depoAgent) {
          const depoPath = `D:\\Resimler\\${payload.firmaId}`
          // Klasör oluştur — hata olursa kurulum durmaz
          await runStep(
            depoAgent,
            "depo_dir",
            `Depo: resim klasörü oluşturuluyor: ${depoPath}`,
            buildCreateDir(depoPath),
          )
          // NTFS yetkileri — hata olursa kurulum durmaz
          await runStep(
            depoAgent,
            "depo_ntfs",
            `Depo: NTFS yetkileri: ${depoPath} → ${payload.firmaId}_users`,
            buildSetNtfsPermissions(depoPath, `${payload.firmaId}_users`),
          )
        }

        // ── 5) Pusula programları → Windows/RDP agent ───────────────
        let servicesInstalled = 0
        const firmaRoot = `C:\\MUSTERI\\${payload.firmaId}`

        if (pusulaServices.length > 0 && winAgent) {
          // 5a) Firma root klasörü
          if (!(await runStep(
            winAgent,
            "firma_root",
            `Firma klasörü oluşturuluyor: ${firmaRoot}`,
            buildCreateDir(firmaRoot),
          ))) { controller.close(); return }

          // 5b) Her hizmet: klasör + kopya + (varsa) parametre TXT
          for (const s of pusulaServices) {
            const cfg = s.config as PusulaProgramConfig | null
            if (!cfg || !cfg.sourceFolderPath) {
              send("step", {
                stepId: `svc_skip_${s.id}`,
                label:  `Hizmet config eksik: ${s.name}`,
                status: "error",
                error:  "config.sourceFolderPath tanımlı değil",
              })
              controller.close()
              return
            }

            const hizmetPath = `${firmaRoot}\\${s.name}`

            if (!(await runStep(
              winAgent,
              `svc_dir_${s.id}`,
              `Hizmet klasörü: ${s.name}`,
              buildCreateDir(hizmetPath),
            ))) { controller.close(); return }

            if (!(await runStep(
              winAgent,
              `svc_copy_${s.id}`,
              `Dosyalar kopyalanıyor: ${s.name}`,
              buildCopyFolder(cfg.sourceFolderPath, hizmetPath),
            ))) { controller.close(); return }

            if (cfg.paramFileName && cfg.paramFileName.trim()) {
              const paramFile = `${hizmetPath}\\${cfg.paramFileName.trim()}`
              // Parametre TXT adımı kritik değil — hata devam ettirir
              await runStep(
                winAgent,
                `svc_param_${s.id}`,
                `Parametre güncelleniyor: ${cfg.paramFileName}`,
                buildUpdateParamTxt(paramFile, payload.firmaId),
              )
            }

            servicesInstalled++
          }

          // 5c) NTFS yetkileri — firma root'una tek seferde
          if (!(await runStep(
            winAgent,
            "ntfs",
            `NTFS yetkileri: ${firmaRoot} → ${payload.firmaId}_users`,
            buildSetNtfsPermissions(firmaRoot, `${payload.firmaId}_users`),
          ))) { controller.close(); return }

          // 5d) Masaüstü MUSTERILER klasörü + kısayollar (non-critical, hata devam ettirir)
          const safeFirmaName    = sanitizeWindowsName(payload.firmaName) || payload.firmaId
          const mustelierSubdir  = `C:\\Users\\Public\\Desktop\\MUSTERILER\\${safeFirmaName}`

          await runStep(
            winAgent,
            "desktop_dir",
            `Masaüstü: MUSTERILER\\${safeFirmaName} klasörü`,
            buildCreateDir(mustelierSubdir),
          )

          // Her pusula servisi için exe kısayolu
          for (const s of pusulaServices) {
            const cfg = s.config as PusulaProgramConfig | null
            const exeName = cfg?.exeName?.trim() ?? ""
            if (!exeName) continue

            const lnkName     = sanitizeWindowsName(s.name)
            const shortcutPath = `${mustelierSubdir}\\${lnkName}.lnk`
            const targetPath   = `${firmaRoot}\\${s.name}\\${exeName}`

            await runStep(
              winAgent,
              `shortcut_exe_${s.id}`,
              `Kısayol: ${s.name} → ${exeName}`,
              buildCreateShortcut(shortcutPath, targetPath),
            )
          }

          // Resimler kısayolu → Depo sunucusundaki resim klasörü
          if (depoAgent) {
            const resimlerTarget = `\\\\${depoAgent.ip}\\D$\\Resimler\\${payload.firmaId}`
            const resimlerLnk    = `${mustelierSubdir}\\Resimler.lnk`

            await runStep(
              winAgent,
              "shortcut_resim",
              `Kısayol: Resimler → Depo (${depoAgent.ip})`,
              buildCreateShortcut(resimlerLnk, resimlerTarget),
            )
          }
        }

        // ── 6) IIS siteleri → IIS agent ─────────────────────────────
        if (iisServices.length > 0 && iisAgent) {
          for (const s of iisServices) {
            const cfg = s.config as IisSiteConfig | null
            if (!cfg) {
              send("step", {
                stepId: `svc_skip_${s.id}`,
                label:  `Hizmet config eksik: ${s.name}`,
                status: "error",
                error:  "iis-site config tanımlı değil",
              })
              controller.close()
              return
            }

            // Pattern'leri firmaKod ile genişlet
            const destPath = expandPattern(cfg.iisDestPath,    payload.firmaId)
            const siteName = expandPattern(cfg.siteNamePattern, payload.firmaId)

            // i) Hedef klasör
            if (!(await runStep(
              iisAgent,
              `iis_dir_${s.id}`,
              `IIS hedef klasörü: ${destPath}`,
              buildCreateDir(destPath),
            ))) { controller.close(); return }

            // ii) Robocopy kaynak → hedef
            if (!(await runStep(
              iisAgent,
              `iis_copy_${s.id}`,
              `Dosyalar kopyalanıyor: ${s.name}`,
              buildCopyFolder(cfg.sourceFolderPath, destPath),
            ))) { controller.close(); return }

            // iii) Port ata (DB tarafında, agent çağrısı yok)
            send("step", {
              stepId: `iis_port_${s.id}`,
              label:  `Port atanıyor: ${siteName}`,
              status: "running",
            })
            const alloc = await allocatePort(cfg.portRangeId, s.id, payload.firmaId, siteName)
            if (!alloc.ok) {
              send("step", {
                stepId: `iis_port_${s.id}`,
                label:  `Port atanıyor: ${siteName}`,
                status: "error",
                error:  alloc.error,
              })
              controller.close()
              return
            }
            send("step", {
              stepId: `iis_port_${s.id}`,
              label:  `Port atandı: ${siteName} → ${alloc.port}`,
              status: "done",
            })

            // iv) Config dosyası placeholder replace (varsa)
            if (cfg.configFileName && cfg.configFileName.trim()) {
              const configPath = `${destPath}\\${cfg.configFileName.trim()}`
              if (!(await runStep(
                iisAgent,
                `iis_cfg_${s.id}`,
                `Config güncelleniyor: ${cfg.configFileName}`,
                buildReplaceInFile(configPath, {
                  "{firmaKod}": payload.firmaId,
                  "{firmaId}":  payload.firmaId,
                  "{port}":     String(alloc.port),
                  "{siteName}": siteName,
                }),
              ))) { controller.close(); return }
            }

            // v) IIS sitesi oluştur + başlat
            if (!(await runStep(
              iisAgent,
              `iis_site_${s.id}`,
              `IIS sitesi: ${siteName} (port ${alloc.port})`,
              buildCreateIisSite(siteName, destPath, alloc.port),
            ))) { controller.close(); return }

            servicesInstalled++
          }
        }

        // ── 7) SQL — veritabanı restore + guvenlik insert ───────────
        let sqlRestored  = 0
        let sqlGuvenlik  = 0
        if (sqlTarget) {
          // Mod 0 veya 1'e göre restore edilecek (bakPath, targetDbName, programCode) listesi
          interface RestoreTask {
            bakPath:      string
            dbName:       string
            /** Bu DB için guvenlik kaydında kullanılacak program kodu (null → insert atlanır) */
            programCode:  string | null
          }
          const tasks: RestoreTask[] = []

          const prefix = runAddPrefix ? `${payload.firmaId}_` : ""

          if (runSqlMode === 0) {
            // Mod 0: seçili .bak dosyaları için backupFolderPath\fileName yolu
            const firstPusulaProgramCode = pusulaServices
              .map((s) => (s.config as PusulaProgramConfig | null)?.programCode ?? null)
              .find((c) => !!c) ?? null

            for (const bf of runBackupFiles) {
              const fileName = (bf.fileName ?? "").trim()
              const dbName   = (bf.databaseName ?? "").trim()
              if (!fileName || !dbName) continue
              const bakPath = runBackupFolder
                ? `${runBackupFolder}\\${fileName}`
                : fileName
              tasks.push({
                bakPath,
                dbName:      `${prefix}${dbName}`,
                programCode: firstPusulaProgramCode,
              })
            }
          } else {
            // Mod 1: demo DB'lerin locationPath'inden .bak restore; programCode
            // demo DB ↔ serviceIds junction'ından ilk pusula servisinin kodu
            // Önce junction'ı tek sorguda çek
            const dbIds = demoDbsForRun.map((d) => d.Id)
            if (dbIds.length > 0) {
              const junctions = await query<{ DemoDatabaseId: number; ServiceId: number }[]>`
                SELECT DemoDatabaseId, ServiceId FROM DemoDatabaseServices
              `
              const junctionMap = new Map<number, number[]>()
              for (const j of junctions) {
                if (!dbIds.includes(j.DemoDatabaseId)) continue
                const list = junctionMap.get(j.DemoDatabaseId) ?? []
                list.push(j.ServiceId)
                junctionMap.set(j.DemoDatabaseId, list)
              }
              // Pusula program kodlarını çek (tek sorguda)
              const pusulaCatalog = await query<{ Id: number; Config: string | null }[]>`
                SELECT Id, Config FROM WizardServices WHERE Type = 'pusula-program' AND IsActive = 1
              `
              const codeById = new Map<number, string | null>()
              for (const row of pusulaCatalog) {
                let code: string | null = null
                if (row.Config) {
                  try {
                    const parsed = JSON.parse(row.Config) as { programCode?: string | null }
                    code = parsed?.programCode && parsed.programCode.trim() ? parsed.programCode.trim() : null
                  } catch { /* noop */ }
                }
                codeById.set(row.Id, code)
              }

              for (const demo of demoDbsForRun) {
                const bakPath = (demo.LocationPath ?? "").trim()
                if (!bakPath) {
                  // Path yok → restore yapılamaz (ör. "Şablon" modu), sessizce atla
                  send("step", {
                    stepId: `sql_skip_${demo.Id}`,
                    label:  `Demo DB atlandı (yol yok): ${demo.Name}`,
                    status: "done",
                  })
                  continue
                }
                const linkedServiceIds = junctionMap.get(demo.Id) ?? []
                let programCode: string | null = null
                for (const sid of linkedServiceIds) {
                  const code = codeById.get(sid) ?? null
                  if (code) { programCode = code; break }
                }
                const rawName = deriveDataName(demo.Name) || demo.DataName || demo.Name
                tasks.push({
                  bakPath,
                  dbName:      `${prefix}${rawName}`,
                  programCode,
                })
              }
            }
          }

          if (tasks.length > 0) {
            // Tüm restore + guvenlik işleri tek bir SQL pool üzerinden yapılsın.
            // Hata olursa kurulum durmaz — eski davranışla uyumlu; her task ayrı
            // step olarak raporlanır.
            try {
              await withSqlConnection(
                {
                  server:   sqlTarget.ip,
                  port:     1433,
                  user:     sqlTarget.username,
                  password: sqlTarget.password,
                  database: "master",
                },
                async (masterPool) => {
                  for (const t of tasks) {
                    await runSqlStep(
                      `sql_restore_${t.dbName}`,
                      `Veritabanı restore ediliyor: ${t.dbName}`,
                      async () => {
                        await restoreBackupOnServer(masterPool, t.bakPath, t.dbName)
                        sqlRestored++
                        return `${t.bakPath} → [${t.dbName}]`
                      },
                    )
                  }
                },
              )
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              send("step", {
                stepId: "sql_connect",
                label:  `SQL sunucusuna bağlanılamadı: ${sqlTarget.name}`,
                status: "error",
                error:  msg,
              })
            }

            // Guvenlik insert'leri ayrı bağlantı (sirket DB) üzerinden
            if (runAddSirket && sqlRestored > 0) {
              try {
                await withSqlConnection(
                  {
                    server:   sqlTarget.ip,
                    port:     1433,
                    user:     sqlTarget.username,
                    password: sqlTarget.password,
                    database: "sirket",
                  },
                  async (sirketPool) => {
                    for (const t of tasks) {
                      if (!t.programCode) continue
                      await runSqlStep(
                        `sql_guvenlik_${t.dbName}`,
                        `Güvenlik kaydı: ${t.dbName} (${t.programCode})`,
                        async () => {
                          await insertGuvenlikRow(sirketPool, {
                            dbName:      t.dbName,
                            firmaId:     payload.firmaId,
                            programCode: t.programCode!,
                          })
                          sqlGuvenlik++
                        },
                      )
                    }
                  },
                )
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                send("step", {
                  stepId: "sql_sirket_connect",
                  label:  `sirket veritabanına bağlanılamadı: ${sqlTarget.name}`,
                  status: "error",
                  error:  msg,
                })
              }
            }
          }
        }

        send("done", {
          ok: true,
          summary: {
            firmaId:           payload.firmaId,
            usersCreated:      createdCount,
            servicesInstalled,
            sqlRestored,
            sqlGuvenlik,
          },
        })
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
