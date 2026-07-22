import { NextRequest } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById, sqlServerById, serversWithRole } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { restoreBackupOnServer, attachDatabaseOnServer, firmaDataDir } from "@/lib/sql-restore"
import { buildCopyAttachFiles } from "@/lib/sql-backup-powershell"
import { ensureSqlLogin, denyViewAnyDatabase, setDbOwner, grantSirketAccess } from "@/lib/sql-firma-login"
import { saveCompanyUserPassword } from "@/lib/firma-credentials"
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
  buildUpdateDataKoduXml,
  buildWriteDesktopIni,
} from "@/lib/setup-fileops"
import {
  buildReplaceInFile,
  buildCreateIisSite,
  buildPatchWebConfig,
  buildPatchUsersXml,
  buildListIisUsedPorts,
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
  /** IIS'te canlı olarak kullanılan portlar — sayaç (WizardPortAssignments)
   *  dışında elle kurulmuş siteleri de dışlamak için. Bkz: 26003 çakışması. */
  liveUsedPorts?: ReadonlySet<number>,
): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
  const sb = await getSupabaseServer()
  const { data: range } = await sb.schema("hub").from("wizard_port_ranges")
    .select("port_start, port_end, is_active").eq("id", rangeId).maybeSingle()
  if (!range)            return { ok: false, error: "Port aralığı bulunamadı" }
  if (!range.is_active)  return { ok: false, error: "Port aralığı pasif" }

  const { data: used } = await sb.schema("hub").from("wizard_port_assignments")
    .select("port").eq("port_range_id", rangeId)
  const usedSet = new Set(((used ?? []) as { port: number }[]).map((u) => u.port))

  for (let p = range.port_start; p <= range.port_end; p++) {
    if (usedSet.has(p)) continue
    if (liveUsedPorts?.has(p)) continue
    // UNIQUE(port_range_id, port) sayesinde race-safe: çakışma → sıradaki portu dene
    const { error } = await sb.schema("hub").from("wizard_port_assignments").insert({
      port_range_id: rangeId, service_id: serviceId, company_id: companyId, port: p, site_name: siteName,
    })
    if (!error) return { ok: true, port: p }
  }
  return { ok: false, error: "Aralıkta boş port kalmadı" }
}

interface RunBackupFile {
  /** Kaynak .bak dosya adı (backupFolderPath altında) — kind="bak" için */
  fileName:     string
  /** Hedef DB adı — kullanıcı sheet'te düzenledi (firma prefix yok) */
  databaseName: string
  /** Bu .bak hangi pusula-program servisine ait (sirket.guvenlik.prgtur için).
   *  Birden fazla pusula programı seçildiğinde her .bak'ı bir programa bağlamak için
   *  kullanıcı UI'da seçer. Tek program varsa wizard otomatik atar. null ise client
   *  taraf eski olabilir → backend ilk pusula servisinin koduna fallback yapar. */
  programServiceId?: number | null
  /** "bak" → RESTORE · "attach" → kopyala + CREATE DATABASE FOR ATTACH.
   *  Eski client'larda olmayabilir → "bak" default. */
  kind?:        "bak" | "attach"
  /** kind="attach" için ham .mdf dosya adı (backupFolderPath altında). */
  mdfFileName?: string
  /** kind="attach" için ham .ldf dosya adı — yoksa ATTACH_REBUILD_LOG. */
  ldfFileName?: string
}

interface RunPayload {
  /** AD sunucusu — OU/grup/kullanıcı adımları (1-4) bu agent'a gider. */
  serverId:         string
  /** Windows/RDP sunucusu — pusula-program klasör/copy/param/NTFS adımları bu agent'a gider. */
  windowsServerId?: string
  /** IIS sunucusu — iis-site klasör/copy/port/config/site adımları bu agent'a gider. */
  iisServerId?:     string
  /** Depo sunucusu — D:\Resimler\<firmaId> klasörü + NTFS yetkisi bu agent'a gider. */
  depoServerId?:    string
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
  /** true → depo (resim klasörü / NTFS / desktop.ini) adımları atlanır.
   *  Tekil kullanıcı ekleme gibi depo ile ilgisiz akışlar için. */
  skipDepo?:         boolean
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
  /** SQL sunucusunun PusulaAgent'ı — ATTACH için .mdf/.ldf kopyalamada kullanılır. */
  agent:    AgentTarget | null
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
  const adSrv = await serverAgentById(payload.serverId)
  if (!adSrv || !adSrv.api_key || !adSrv.agent_port) {
    return new Response(JSON.stringify({ error: "AD sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const adAgent: AgentTarget = {
    ip:     adSrv.ip,
    port:   adSrv.agent_port,
    apiKey: adSrv.api_key,
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
    const winSrv = await serverAgentById(payload.windowsServerId)
    if (!winSrv || !winSrv.api_key || !winSrv.agent_port) {
      return new Response(JSON.stringify({ error: "Windows sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    winAgent = {
      ip:     winSrv.ip,
      port:   winSrv.agent_port,
      apiKey: winSrv.api_key,
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
    const iisSrv = await serverAgentById(payload.iisServerId)
    if (!iisSrv || !iisSrv.api_key || !iisSrv.agent_port) {
      return new Response(JSON.stringify({ error: "IIS sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    iisAgent = {
      ip:     iisSrv.ip,
      port:   iisSrv.agent_port,
      apiKey: iisSrv.api_key,
    }
  }

  // Depo sunucusu — sihirbazda Pusula programı seçilmişse payload.depoServerId
  // gelir; aksi halde sistemdeki ilk Role='Depo' sunucusu fallback olarak kullanılır.
  let depoAgent: AgentTarget | null = null
  let depoSrv: { ip: string; agent_port: number | null; api_key: string | null } | null = null
  if (!payload.skipDepo) {
    if (payload.depoServerId) {
      depoSrv = await serverAgentById(payload.depoServerId)
    } else {
      const fileSrvs = await serversWithRole("File", "ip, agent_port, api_key")
      depoSrv = (fileSrvs[0] as unknown as typeof depoSrv) ?? null
    }
  }
  if (depoSrv && depoSrv.agent_port && depoSrv.api_key) {
    depoAgent = {
      ip:     depoSrv.ip,
      port:   depoSrv.agent_port,
      apiKey: depoSrv.api_key,
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
    const row = await sqlServerById(payload.sqlServerId!)
    if (!row) {
      return new Response(JSON.stringify({ error: "SQL sunucusu bulunamadı veya SQL rolü atanmamış" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (!row.sql_username || !row.sql_password) {
      return new Response(JSON.stringify({
        error: `${row.name} sunucusu için SA kullanıcı adı/şifresi tanımlanmamış. Sunucu ayarlarından ekleyin.`,
      }), { status: 400, headers: { "Content-Type": "application/json" } })
    }
    const decrypted = decrypt(row.sql_password)
    if (!decrypted) {
      return new Response(JSON.stringify({
        error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin.",
      }), { status: 500, headers: { "Content-Type": "application/json" } })
    }
    sqlTarget = {
      id:       row.id,
      name:     row.name,
      ip:       row.ip,
      username: row.sql_username,
      password: decrypted,
      // ATTACH akışı için SQL sunucusunun agent'ı (varsa). Yoksa attach
      // adımında net hata verilir; .bak restore agent gerektirmez.
      agent: (row.api_key && row.agent_port)
        ? { ip: row.ip, port: row.agent_port, apiKey: row.api_key }
        : null,
    }

    // Mode 1: demo DB bilgilerini DB'den çek (client'a güvenmiyoruz; kaynak/yol
    // sunucu tarafında gerçek olmalı).
    if (runSqlMode === 1 && runDemoDbIds.length > 0) {
      const ids = runDemoDbIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
      if (ids.length > 0) {
        const sb = await getSupabaseServer()
        const { data: rows } = await sb.schema("hub").from("demo_databases")
          .select("id, name, data_name, location_type, location_path")
          .eq("is_active", true).in("id", ids)
        demoDbsForRun = ((rows ?? []) as { id: number; name: string; data_name: string; location_type: string; location_path: string | null }[])
          .map((r) => ({ Id: r.id, Name: r.name, DataName: r.data_name, LocationType: r.location_type, LocationPath: r.location_path }))
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

          // Şifreyi encrypted olarak sakla — firma detayındaki "Erişim
          // Bilgileri" modal'ında okunabilsin. Hata kurulumu bozmasın.
          try {
            await saveCompanyUserPassword(payload.firmaId, fullUsername, u.password)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            send("step", {
              stepId: `cred_save_${u.username}`,
              label:  `Şifre saklama atlandı: ${fullUsername}`,
              status: "error",
              error:  msg,
            })
          }

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
          // desktop.ini — klasör tooltip'i olarak firma adı görünür
          await runStep(
            depoAgent,
            "depo_tooltip",
            `Depo: klasör açıklaması (desktop.ini): ${payload.firmaName}`,
            buildWriteDesktopIni(depoPath, payload.firmaName),
          )
        } else if (pusulaServices.length > 0) {
          send("step", {
            stepId: "depo_skip",
            label:  "Depo: resim klasörü atlandı — Depo sunucusu seçilmedi",
            status: "error",
            error:  "D:\\Resimler\\<firmaId> klasörü oluşturulamadı. Hizmetler adımında bir Depo sunucusu seçin veya /servers sayfasından bir sunucuya 'Depo' rolü atayın.",
          })
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
              // Perakende (programCode 909) istisnası: data kodu [DATA KODU]
              // satırı yerine <DATAKODU> bloğuyla yazılır. Değer yine firmaId.
              const isPerakende = (cfg.programCode ?? "").trim() === "909"
              // Parametre TXT adımı kritik değil — hata devam ettirir
              await runStep(
                winAgent,
                `svc_param_${s.id}`,
                isPerakende
                  ? `Parametre güncelleniyor (Perakende · DATAKODU): ${cfg.paramFileName}`
                  : `Parametre güncelleniyor: ${cfg.paramFileName}`,
                isPerakende
                  ? buildUpdateDataKoduXml(paramFile, payload.firmaId)
                  : buildUpdateParamTxt(paramFile, payload.firmaId),
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
          // Sadece Administrator masaüstüne — Public\Desktop tüm kullanıcılara yansırdı.
          const safeFirmaName    = sanitizeWindowsName(payload.firmaName) || payload.firmaId
          const mustelierSubdir  = `C:\\Users\\Administrator\\Desktop\\MUSTERILER\\${safeFirmaName}`

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

          // Resimler kısayolu → Depo sunucusundaki Resimler SMB share'i
          // (D$ admin share değil — paylaşılan klasör adı doğrudan 'Resimler')
          if (depoAgent) {
            const resimlerTarget = `\\\\${depoAgent.ip}\\Resimler\\${payload.firmaId}`
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
        // Users.xml patch'i SQL restore'dan sonra çalışır — bu yüzden
        // burada her başarılı IIS hizmetinin destPath'ini topluyoruz.
        const installedIisServices: Array<{ id: number; name: string; destPath: string }> = []

        if (iisServices.length > 0 && iisAgent) {
          // 6a) Firma root klasörü — C:\Pusula\Service\<firmaKod>
          const iisFirmaRoot = `C:\\Pusula\\Service\\${payload.firmaId}`
          if (!(await runStep(
            iisAgent,
            "iis_firma_root",
            `IIS firma klasörü oluşturuluyor: ${iisFirmaRoot}`,
            buildCreateDir(iisFirmaRoot),
          ))) { controller.close(); return }

          // 6a.5) Canlı IIS port envanteri — sayaç (WizardPortAssignments)
          // dışında elle kurulmuş siteler de port kullanıyor olabilir.
          // Tahsis edilen portun IIS'te gerçekten boş olduğunu garantiler.
          const liveUsedPorts = new Set<number>()
          {
            send("step", { stepId: "iis_ports_scan", label: "IIS port envanteri alınıyor", status: "running" })
            const portRes = await execOnAgent(
              iisAgent.ip, iisAgent.port, iisAgent.apiKey,
              buildListIisUsedPorts(), 60,
            )
            const m = (portRes.stdout ?? "").match(/PORTS:([\d,]*)/)
            if (portRes.exitCode === 0 && m) {
              for (const seg of m[1].split(",")) {
                const n = parseInt(seg, 10)
                if (Number.isFinite(n)) liveUsedPorts.add(n)
              }
              send("step", {
                stepId: "iis_ports_scan",
                label:  "IIS port envanteri alınıyor",
                status: "done",
                output: `${liveUsedPorts.size} port kullanımda: ${[...liveUsedPorts].sort((a, b) => a - b).join(", ")}`,
              })
            } else {
              // Canlı envanter alınamadı — kurulumu kesme ama net uyar.
              // Sayaç (WizardPortAssignments) yine de devrede.
              send("step", {
                stepId: "iis_ports_scan",
                label:  "IIS port envanteri alınamadı — yalnızca sayaç kullanılacak",
                status: "done",
                output: (portRes.stderr || portRes.stdout || `exit ${portRes.exitCode}`).slice(0, 200),
              })
            }
          }

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

            // IIS hedef yolu: C:\Pusula\Service\<firmaKod>\<serviceName>
            const destPath = `${iisFirmaRoot}\\${sanitizeWindowsName(s.name)}`
            // siteNamePattern opsiyonel — yoksa servis adı + firmaId fallback
            const siteName = expandPattern(
              cfg.siteNamePattern && cfg.siteNamePattern.trim()
                ? cfg.siteNamePattern
                : `${s.name}_{firmaKod}`,
              payload.firmaId,
            )

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
            const alloc = await allocatePort(cfg.portRangeId, s.id, payload.firmaId, siteName, liveUsedPorts)
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

            // iv.b) Web.config patch — connection string (SQL IP + firma user)
            //       ve httpRuntime/@maxRequestLength = 51200.
            //       SQL parametreleri varsa connection string güncellenir;
            //       maxRequestLength her zaman uygulanır. Dosya yoksa SKIP.
            {
              const webCfgPath = `${destPath}\\Web.config`
              const firstUser  = payload.users[0]
              const hasSqlForCfg = !!sqlTarget && !!firstUser?.username && !!firstUser?.password
              if (!(await runStep(
                iisAgent,
                `iis_webcfg_${s.id}`,
                hasSqlForCfg
                  ? `Web.config güncelleniyor: ${s.name} (SQL + maxRequestLength)`
                  : `Web.config güncelleniyor: ${s.name} (maxRequestLength)`,
                buildPatchWebConfig({
                  configPath:  webCfgPath,
                  sqlIp:       hasSqlForCfg ? sqlTarget!.ip : undefined,
                  sqlUserId:   hasSqlForCfg ? `${payload.firmaId}_${firstUser!.username}` : undefined,
                  sqlPassword: hasSqlForCfg ? firstUser!.password : undefined,
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

            // Users.xml patch'i için listeye ekle — SQL restore sonrası işlenecek
            installedIisServices.push({ id: s.id, name: s.name, destPath })

            servicesInstalled++
          }
        }

        // ── 7) SQL — veritabanı restore + guvenlik insert ───────────
        let sqlRestored  = 0
        let sqlGuvenlik  = 0
        if (sqlTarget) {
          // Mod 0 veya 1'e göre restore edilecek (bakPath, targetDbName, programCode) listesi
          interface RestoreTask {
            /** "bak" → RESTORE FROM DISK · "attach" → kopyala + CREATE DATABASE FOR ATTACH */
            kind:         "bak" | "attach"
            /** kind="bak": kaynak .bak yolu */
            bakPath:      string
            /** kind="attach": kaynak .mdf yolu + (varsa) .ldf yolu */
            srcMdf:       string
            srcLdf:       string | null
            dbName:       string
            /** guvenlik.srkadi için firma prefix'siz ham data/şirket adı */
            srkAdi:       string
            /** Bu DB için guvenlik kaydında kullanılacak program kodu (null → insert atlanır) */
            programCode:  string | null
          }
          const tasks: RestoreTask[] = []

          const prefix = runAddPrefix ? `${payload.firmaId}_` : ""

          if (runSqlMode === 0) {
            // Mod 0: her .bak için programServiceId → programCode lookup.
            // programServiceId yoksa (eski client) ilk pusula servisinin koduna fallback.
            const codeByServiceId = new Map<number, string | null>()
            for (const s of pusulaServices) {
              const cfg = s.config as PusulaProgramConfig | null
              codeByServiceId.set(s.id, cfg?.programCode?.trim() || null)
            }
            const firstPusulaProgramCode = pusulaServices
              .map((s) => (s.config as PusulaProgramConfig | null)?.programCode ?? null)
              .find((c) => !!c) ?? null

            const joinFolder = (name: string) =>
              runBackupFolder ? `${runBackupFolder}\\${name}` : name

            for (const bf of runBackupFiles) {
              const dbName = (bf.databaseName ?? "").trim()
              if (!dbName) continue
              const programCode = bf.programServiceId != null
                ? (codeByServiceId.get(bf.programServiceId) ?? null)
                : firstPusulaProgramCode

              if (bf.kind === "attach") {
                // ATTACH: ham .mdf (+ varsa .ldf) — kopyala + CREATE DATABASE FOR ATTACH
                const mdf = (bf.mdfFileName ?? bf.fileName ?? "").trim()
                if (!mdf) continue
                const ldf = (bf.ldfFileName ?? "").trim()
                tasks.push({
                  kind:        "attach",
                  bakPath:     "",
                  srcMdf:      joinFolder(mdf),
                  srcLdf:      ldf ? joinFolder(ldf) : null,
                  dbName:      `${prefix}${dbName}`,
                  srkAdi:      dbName,
                  programCode,
                })
              } else {
                const fileName = (bf.fileName ?? "").trim()
                if (!fileName) continue
                tasks.push({
                  kind:        "bak",
                  bakPath:     joinFolder(fileName),
                  srcMdf:      "",
                  srcLdf:      null,
                  dbName:      `${prefix}${dbName}`,
                  srkAdi:      dbName,
                  programCode,
                })
              }
            }
          } else {
            // Mod 1: demo DB'lerin locationPath'inden .bak restore; programCode
            // demo DB ↔ serviceIds junction'ından ilk pusula servisinin kodu
            // Önce junction'ı tek sorguda çek
            const dbIds = demoDbsForRun.map((d) => d.Id)
            if (dbIds.length > 0) {
              const sb = await getSupabaseServer()
              const { data: junctions } = await sb.schema("hub").from("demo_database_services")
                .select("demo_database_id, service_id")
              const junctionMap = new Map<number, number[]>()
              for (const j of ((junctions ?? []) as { demo_database_id: number; service_id: number }[])) {
                if (!dbIds.includes(j.demo_database_id)) continue
                const list = junctionMap.get(j.demo_database_id) ?? []
                list.push(j.service_id)
                junctionMap.set(j.demo_database_id, list)
              }
              // Pusula program kodlarını çek (tek sorguda)
              const { data: pusulaCatalog } = await sb.schema("hub").from("wizard_services")
                .select("id, config").eq("type", "pusula-program").eq("is_active", true)
              const codeById = new Map<number, string | null>()
              for (const row of ((pusulaCatalog ?? []) as { id: number; config: string | null }[])) {
                let code: string | null = null
                if (row.config) {
                  try {
                    const parsed = JSON.parse(row.config) as { programCode?: string | null }
                    code = parsed?.programCode && parsed.programCode.trim() ? parsed.programCode.trim() : null
                  } catch { /* noop */ }
                }
                codeById.set(row.id, code)
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
                  kind:        "bak",
                  bakPath,
                  srcMdf:      "",
                  srcLdf:      null,
                  dbName:      `${prefix}${rawName}`,
                  srkAdi:      rawName,
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
                  const restoredDbNames: string[] = []
                  for (const t of tasks) {
                    if (t.kind === "attach") {
                      // ATTACH: ham .mdf/.ldf → D:\SQLData\{firmaId}'ye agent ile
                      // kopyala, sonra CREATE DATABASE FOR ATTACH.
                      const ok = await runSqlStep(
                        `sql_attach_${t.dbName}`,
                        `Veritabanı attach ediliyor: ${t.dbName}`,
                        async () => {
                          if (!sqlTarget!.agent) {
                            throw new Error("ATTACH için SQL sunucusunda PusulaAgent gerekli (ApiKey/AgentPort eksik)")
                          }
                          const destDir = firmaDataDir(payload.firmaId)
                          const copyCmd = buildCopyAttachFiles({
                            srcMdf:  t.srcMdf,
                            srcLdf:  t.srcLdf ?? undefined,
                            destDir,
                            destMdf: `${t.dbName}.mdf`,
                            destLdf: t.srcLdf ? `${t.dbName}.ldf` : undefined,
                          })
                          const cp = await execOnAgent(
                            sqlTarget!.agent.ip, sqlTarget!.agent.port, sqlTarget!.agent.apiKey, copyCmd, 600,
                          )
                          if (cp.exitCode !== 0) {
                            throw new Error(cp.stderr?.trim() || `Dosya kopyalama başarısız (exit=${cp.exitCode})`)
                          }
                          await attachDatabaseOnServer(masterPool, payload.firmaId, t.dbName, !!t.srcLdf)
                          sqlRestored++
                          return `${t.srcMdf}${t.srcLdf ? " + .ldf" : ""} → [${t.dbName}] (ATTACH)`
                        },
                      )
                      if (ok) restoredDbNames.push(t.dbName)
                    } else {
                      const restoreStepId = `sql_restore_${t.dbName}`
                      const restoreLabel  = `Veritabanı restore ediliyor: ${t.dbName}`
                      const ok = await runSqlStep(
                        restoreStepId,
                        restoreLabel,
                        async () => {
                          await restoreBackupOnServer(masterPool, t.bakPath, t.dbName, {
                            firmaId: payload.firmaId,
                            // Canlı yüzde — aynı stepId ile "running" güncellemesi gönder,
                            // frontend label'ı upsert eder. Büyük DB'lerde adımın
                            // arka planda ilerlediği net görünür.
                            onProgress: (pct) => {
                              send("step", { stepId: restoreStepId, label: `${restoreLabel} — %${pct}`, status: "running" })
                            },
                          })
                          sqlRestored++
                          return `${t.bakPath} → [${t.dbName}]`
                        },
                      )
                      if (ok) restoredDbNames.push(t.dbName)
                    }
                  }

                  // ── Firma 1. kullanıcısı için SQL Authentication login + user mapping ──
                  // Şart: en az 1 başarılı restore + payload.users[0] mevcut
                  const firstUser = payload.users[0]
                  if (restoredDbNames.length > 0 && firstUser && firstUser.username && firstUser.password) {
                    const loginName = `${payload.firmaId}_${firstUser.username}`

                    const loginOk = await runSqlStep(
                      `sql_login_${loginName}`,
                      `SQL login oluşturuluyor: ${loginName}`,
                      async () => {
                        const { created } = await ensureSqlLogin(masterPool, loginName, firstUser.password)
                        return created
                          ? `CREATE LOGIN [${loginName}]`
                          : `ALTER LOGIN [${loginName}] (mevcut — şifre güncellendi)`
                      },
                    )

                    if (loginOk) {
                      // Sunucu seviyesinde DENY VIEW ANY DATABASE → kullanıcı
                      // sadece owner'ı olduğu DB'leri görür.
                      await runSqlStep(
                        `sql_deny_view_${loginName}`,
                        `DENY VIEW ANY DATABASE: ${loginName}`,
                        async () => {
                          await denyViewAnyDatabase(masterPool, loginName)
                          return `DENY VIEW ANY DATABASE TO [${loginName}]`
                        },
                      )

                      // Restore edilen her DB'nin owner'ını bu login'e devret.
                      // Owner otomatik olarak dbo olur → ayrıca rol vermeye gerek yok.
                      for (const dbName of restoredDbNames) {
                        await runSqlStep(
                          `sql_dbowner_${dbName}`,
                          `DB owner ayarlanıyor: [${dbName}] → ${loginName}`,
                          async () => {
                            await setDbOwner(masterPool, dbName, loginName)
                            return `ALTER AUTHORIZATION ON DATABASE::[${dbName}] TO [${loginName}]`
                          },
                        )
                      }

                      // Paylaşımlı sirket DB'sine okuma+yazma erişimi — Pusula
                      // programı açılırken sirket.dbo.guvenlik'i bu kullanıcıyla
                      // okur. DENY VIEW ANY DATABASE diğer firma DB'lerini gizler;
                      // sirket'te USER + db_datareader/datawriter olduğu için bu
                      // paylaşımlı DB erişilebilir kalır (owner değil → şema güvenli).
                      await runSqlStep(
                        `sql_sirket_access_${loginName}`,
                        `sirket DB erişimi: ${loginName} (okuma+yazma)`,
                        async () => {
                          await grantSirketAccess(masterPool, loginName)
                          return `[sirket] db_datareader + db_datawriter → ${loginName}`
                        },
                      )
                    }
                  }

                  // ── IIS hizmetlerinin Users.xml'lerini güncelle ──
                  // Restore edilen DB adlarını ve tüm firma kullanıcılarını
                  // her IIS hizmetinin Config\Users.xml'ine yazar.
                  if (
                    iisAgent &&
                    installedIisServices.length > 0 &&
                    restoredDbNames.length > 0 &&
                    payload.users.length > 0
                  ) {
                    const xmlUsers = payload.users
                      .filter((u) => u.username && u.password)
                      .map((u) => ({
                        username: `${payload.firmaId}_${u.username}`,
                        password: u.password,
                      }))

                    for (const svc of installedIisServices) {
                      await runStep(
                        iisAgent,
                        `iis_usersxml_${svc.id}`,
                        `Users.xml güncelleniyor: ${svc.name}`,
                        buildPatchUsersXml({
                          configPath: `${svc.destPath}\\Config\\Users.xml`,
                          users:      xmlUsers,
                          dbNames:    restoredDbNames,
                        }),
                      )
                    }
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
            // Blok atlanıyorsa nedenini görünür kıl
            if (!runAddSirket) {
              send("step", {
                stepId: "sql_guvenlik_skip_toggle",
                label:  "Güvenlik kaydı atlandı — 'Şirket veritabanına ekle' kapalı",
                status: "done",
                output: `addToSirketDb=${payload.addToSirketDb}`,
              })
            } else if (sqlRestored === 0) {
              send("step", {
                stepId: "sql_guvenlik_skip_restore",
                label:  "Güvenlik kaydı atlandı — hiçbir DB restore edilmedi",
                status: "error",
                error:  "sqlRestored=0; restore adımı başarılı olmadığı için güvenlik kaydı yapılmadı.",
              })
            }

            if (runAddSirket && sqlRestored > 0) {
              const withCode    = tasks.filter((t) => !!t.programCode)
              const withoutCode = tasks.filter((t) => !t.programCode)

              // programCode yoksa kullanıcıya net uyarı ver — sessizce atlama
              if (withoutCode.length > 0) {
                send("step", {
                  stepId: "sql_guvenlik_skip",
                  label:  `Güvenlik kaydı atlandı (${withoutCode.length} DB) — Pusula program kodu yok`,
                  status: "error",
                  error:
                    "Seçili Pusula program servislerinin config'inde 'programCode' tanımlı değil. " +
                    "3. adımda (Servisler) en az bir Pusula Program servisi seç ve servis config'ine " +
                    "programCode ekle (011=Toptan, 909=Perakende, 111=StokCari, 016=Uretim). " +
                    `Atlanan DB'ler: ${withoutCode.map((t) => t.dbName).join(", ")}`,
                })
              }

              if (withCode.length > 0) {
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
                      for (const t of withCode) {
                        await runSqlStep(
                          `sql_guvenlik_${t.dbName}`,
                          `Güvenlik kaydı: ${t.dbName} (${t.programCode})`,
                          async () => {
                            await insertGuvenlikRow(sirketPool, {
                              dbName:      t.dbName,
                              srkAdi:      t.srkAdi,
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
        }

        // Sunucu atamasını hub.companies tablosuna kaydet
        try {
          const sb = await getSupabaseServer()
          await sb.schema("hub").from("companies").update({
            windows_server_id: payload.windowsServerId ?? null,
            ad_server_id:      payload.serverId ?? null,
            sql_server_id:     payload.sqlServerId ?? null,
            file_server_id:    payload.depoServerId ?? null,
          }).eq("company_id", payload.firmaId)
        } catch { /* hub.companies'te kayıt yoksa sessizce geç */ }

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
