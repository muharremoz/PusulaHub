/**
 * POST /api/companies/[firkod]/sql/old-data/restore   (SSE / text-event-stream)
 * Body: { source?: "depo" | "sql", path?: string, files: [...] }
 *
 * "Yeni Veritabanı Ekle" — seçilen .bak dosyalarını sihirbazın SQL adımıyla
 * BİREBİR şekilde geri yükler:
 *
 *   1) .bak SQL sunucusunda değilse Depo'dan kimlik-doğrulamalı kopyala (net use)
 *   2) RESTORE DATABASE  → hedef ad: {firmaId}_{databaseName}
 *   3) DB owner = firmanın mevcut SQL login'i ({firmaId}_*)
 *   4) sirket DB erişimi (idempotent)
 *   5) sirket.dbo.guvenlik kaydı (programCode)
 *   6) yalnız KOPYALANAN geçici .bak temizlenir
 *
 * Kaynak eskiden Depo'daki `D:\Eski Datalar\{firmaId}` klasörüne sabitti.
 * Artık klasör ve sunucu seçilebiliyor: normal/şablon veritabanları da
 * kurulabilsin diye. `source="sql"` ise dosya zaten SQL sunucusunda demektir;
 * kopyalama adımı atlanır ve — önemlisi — kaynak dosya SİLİNMEZ (kullanıcının
 * kendi şablon/yedek dosyası olabilir).
 *
 * Firma SQL login'i zaten sihirbazda oluşturulmuş olmalı; burada yeniden
 * oluşturulmaz, sadece owner/erişim için kullanılır.
 */

import { NextRequest } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer, attachDatabaseOnServer, firmaDataDir } from "@/lib/sql-restore"
import { setDbOwner, grantSirketAccess } from "@/lib/sql-firma-login"
import { sqlLoginArama } from "@/lib/firma-adlandirma"
import { insertGuvenlikRow } from "@/lib/sirket-guvenlik"
import { buildAddDatabasesToBackupJobs } from "@/lib/sql-backup-master"
import {
  buildPullBakFromDepo,
  buildPullAttachFilesFromDepo,
  buildCopyAttachFiles,
  buildDeleteFile,
} from "@/lib/sql-backup-powershell"

interface FileReq {
  fileName:     string
  databaseName: string   // baz ad (firma prefix'siz) — hedef = {firmaId}_{base}
  programCode:  string
  /** ".bak" → RESTORE (varsayılan), ".mdf" → CREATE DATABASE ... FOR ATTACH */
  kind?:        "bak" | "mdf"
  /** kind="mdf" ise eşlik eden log dosyasının adı; yoksa log yeniden üretilir. */
  ldfFileName?: string
}

interface AgentInfo { ip: string; port: number; apiKey: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params

  let body: { files?: FileReq[]; source?: "depo" | "sql"; path?: string; yedekAl?: boolean }
  try { body = await req.json() } catch { return json({ error: "Geçersiz JSON" }, 400) }
  const files = (body.files ?? []).filter((f) => f.fileName && f.databaseName)
  if (!files.length) return json({ error: "En az bir yedek dosyası seçilmeli" }, 400)

  const source = body.source === "sql" ? "sql" : "depo"
  /*  Yedeklensin mi? Varsayılan EVET — istek gövdesinde açıkça `false`
   *  gelmedikçe yedek isteniyor sayılıyor. Yedeği unutmak, gereksiz
   *  yedek almaktan pahalı.                                            */
  const yedekAl = body.yedekAl !== false
  const sourceDir = (body.path ?? "").trim().replace(/[\\/]+$/, "") || `D:\\Eski Datalar\\${firkod}`

  // SQL hedefi (bağlantı creds)
  const sqlTarget = await resolveFirmaSqlTarget(firkod)
  if (!sqlTarget) return json({ error: "Firmaya tanımlı SQL sunucusu/credential yok" }, 404)

  // SQL sunucusunun agent'ı (kopya işlemi için) + Depo sunucusu + Windows creds.
  // Firma SQL login'i Hub DB'sinden DEĞİL, aşağıda canlı firma SQL sunucusundan
  // (sys.sql_logins) çekilir — doğru sunucu odur.
  const sb = await getSupabaseServer()
  const { data: comp } = await sb.schema("hub").from("companies").select("file_server_id").eq("company_id", firkod).maybeSingle()
  const fsid = (comp as { file_server_id: string | null } | null)?.file_server_id
  const [sqlAgentRow, depoRow] = await Promise.all([
    serverAgentById(sqlTarget.serverId),
    fsid
      ? sb.schema("hub").from("servers").select("ip, username, password").eq("id", fsid).maybeSingle().then((r) => r.data as { ip: string; username: string | null; password: string | null } | null)
      : Promise.resolve(null),
  ])

  if (!sqlAgentRow?.api_key || !sqlAgentRow?.agent_port) {
    return json({ error: "SQL sunucusunda PusulaAgent yapılandırılmamış (kopya için gerekli)" }, 400)
  }
  const sqlAgent: AgentInfo = { ip: sqlTarget.ip, port: sqlAgentRow.agent_port, apiKey: sqlAgentRow.api_key }

  // Depo yalnız kopyalama gerektiğinde şart — dosya zaten SQL sunucusundaysa
  // Depo tanımlı olmasa da restore yapılabilmeli.
  const depo = depoRow
  let depoUser = ""
  let depoPass = ""
  if (source === "depo") {
    if (!depo) return json({ error: "Firmaya tanımlı Depo sunucusu yok (FileServerId boş)" }, 400)
    depoUser = depo.username ?? ""
    depoPass = depo.password ? (decrypt(depo.password) ?? "") : ""
    if (!depoUser || !depoPass) {
      return json({ error: "Depo sunucusunun Windows credential'ı (Username/Password) tanımlı değil" }, 400)
    }
  }

  // Firma'nın mevcut SQL login'i — sys.sql_logins LIKE '{firmaId}_%' (bu sorgu
  // Hub'ın kendi DB'sinde değil firma SQL sunucusunda olmalı; aşağıda canlı bağlantıda
  // tekrar sorgulanır). loginRows fallback için tutuldu ama güvenilir kaynak canlı.

  const localDir = `${firmaDataDir(firkod)}\\_eskidata`

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* client gitti */ }
      }
      const step = (stepId: string, label: string, status: string, extra?: Record<string, unknown>) =>
        send("step", { stepId, label, status, ...extra })

      try {
        // Firma login'ini canlı SQL'den çek (güvenilir kaynak)
        let firmaLogin: string | null = null
        await withSqlConnection(
          { server: sqlTarget.ip, user: sqlTarget.username, password: sqlTarget.password, database: "master", requestTimeout: 600000 },
          async (masterPool) => {
            /*  Hem NOKTALI (yeni) hem ALT CIZGILI (eski) giris adini
             *  yakalar: ad kurali degisti ama once kurulan firmalarin
             *  girisleri alt cizgili kaldi. Onceki sorgu alt cizgiyi
             *  ESCAPE ile birebir ariyordu, yani yeni firmalarin
             *  girisini HIC bulamazdi.                                 */
            const lg = await masterPool.request()
              .input("p", sqlLoginArama(firkod))
              .query<{ name: string }>(`SELECT TOP 1 name FROM sys.sql_logins WHERE name LIKE @p ORDER BY LEN(name)`)
            firmaLogin = lg.recordset[0]?.name ?? null

            if (!firmaLogin) {
              // Login yoksa restore'u İPTAL ETME — DB'ler yine yüklensin, sadece
              // owner/sirket adımları atlanır (uyarı). Login sonradan oluşturulup
              // owner manuel atanabilir. (Örn. sihirbazı SQL adımında yarıda kalan firma.)
              step("login_check", `Firma SQL login'i (${firkod}.* / ${firkod}_*) bulunamadı — DB owner/sirket adımları atlanacak`, "error", {
                error: "DB'ler restore edilecek ama owner firma login'ine devredilmeyecek. Login'i sihirbaz kullanıcı akışından veya manuel oluşturup owner'ı atayın.",
              })
            } else {
              step("login_check", `Firma SQL login'i: ${firmaLogin}`, "done")
            }

            const hasSirket = await masterPool.request()
              .query<{ c: number }>(`SELECT COUNT(*) c FROM sys.databases WHERE name = 'sirket'`)
            const sirketExists = (hasSirket.recordset[0]?.c ?? 0) > 0

            /*  Yedek görevine eklenecek adlar; guvenlik kaydı başarılı
             *  olanlar buraya giriyor.                                  */
            const eklenecek: string[] = []

            /*  `sonrakiAdimlar` bir fonksiyon bildirimi (hoisted) olduğu için
             *  TS yukarıdaki `if (!sqlTarget) return` daralmasını içeride
             *  göremiyor; bağlantı ayarını burada sabitliyoruz.            */
            const sirketCfg = {
              server: sqlTarget.ip, user: sqlTarget.username, password: sqlTarget.password,
              database: "sirket", requestTimeout: 120000,
            }

            for (const f of files) {
              const targetDb = `${firkod}_${f.databaseName}`
              // SQL sunucusundaki dosya yerinde kalır; Depo'dakinin kopyası
              // geçici klasöre alınır ve sonunda yalnız o silinir.
              const isLocal  = source === "sql"
              const localBak = isLocal ? `${sourceDir}\\${f.fileName}` : `${localDir}\\${f.fileName}`

              /*  ATTACH dalı — ham .mdf/.ldf.
               *
               *  RESTORE'dan iki farkı var:
               *   - Dosyalar geçici klasöre değil, firmanın kalıcı veri
               *     klasörüne (`D:\SQLData\{firmaId}`) `{targetDb}.mdf`
               *     adıyla kopyalanır: attach sonrası DB bu dosyalar
               *     üzerinden çalışmaya devam eder.
               *   - Bu yüzden sonunda temizlik YAPILMAZ.
               *  Kaynak dosya (Depo'daki ya da SQL'deki) yerinde kalır.    */
              if (f.kind === "mdf") {
                const dataDir = firmaDataDir(firkod)
                const hasLdf  = !!f.ldfFileName
                const copyCmd = isLocal
                  ? buildCopyAttachFiles({
                      srcMdf:  `${sourceDir}\\${f.fileName}`,
                      srcLdf:  hasLdf ? `${sourceDir}\\${f.ldfFileName}` : undefined,
                      destDir: dataDir,
                      destMdf: `${targetDb}.mdf`,
                      destLdf: hasLdf ? `${targetDb}.ldf` : undefined,
                    })
                  : buildPullAttachFilesFromDepo({
                      depoIp: depo!.ip, depoUser, depoPass, sourceDir,
                      mdfName: f.fileName,
                      ldfName: hasLdf ? f.ldfFileName : undefined,
                      destDir: dataDir,
                      destMdf: `${targetDb}.mdf`,
                      destLdf: hasLdf ? `${targetDb}.ldf` : undefined,
                    })

                if (!isLocal && !depo) {
                  step(`attach_${targetDb}`, `Depo sunucusu tanımlı değil: ${f.fileName}`, "error", { error: "MDF Depo'dan kopyalanamıyor." })
                  continue
                }

                const attachLabel = `Veritabanı attach ediliyor: ${targetDb}`
                step(`attach_${targetDb}`, attachLabel, "running")
                try {
                  const cp = await execOnAgent(sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey, copyCmd, 900)
                  if (cp.exitCode !== 0) {
                    throw new Error(cp.stderr?.trim() || cp.stdout?.trim() || `Dosya kopyalama başarısız (exit=${cp.exitCode})`)
                  }
                  await attachDatabaseOnServer(masterPool, firkod, targetDb, hasLdf)
                  step(`attach_${targetDb}`, `${attachLabel.replace(" ediliyor", " edildi")}${hasLdf ? "" : " (log yeniden üretildi)"}`, "done")
                } catch (err) {
                  step(`attach_${targetDb}`, `Attach başarısız: ${targetDb}`, "error", { error: err instanceof Error ? err.message : String(err) })
                  continue
                }

                await sonrakiAdimlar(f, targetDb)
                continue
              }

              // 1) Depo'dan kopyala (dosya SQL sunucusunda değilse)
              if (!isLocal && depo) {
                step(`copy_${f.fileName}`, `Depo'dan kopyalanıyor: ${f.fileName}`, "running")
                const cp = await execOnAgent(
                  sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey,
                  buildPullBakFromDepo({ depoIp: depo.ip, depoUser, depoPass, sourceDir, fileName: f.fileName, destDir: localDir }),
                  600,
                )
                if (cp.exitCode !== 0 || (cp.stderr ?? "").trim()) {
                  step(`copy_${f.fileName}`, `Kopyalama başarısız: ${f.fileName}`, "error", { error: (cp.stderr || cp.stdout || `exit ${cp.exitCode}`).slice(0, 300) })
                  continue
                }
                step(`copy_${f.fileName}`, `Kopyalandı: ${f.fileName}`, "done")
              }

              // 2) RESTORE
              const restoreLabel = `Veritabanı restore ediliyor: ${targetDb}`
              step(`restore_${targetDb}`, restoreLabel, "running")
              try {
                await restoreBackupOnServer(masterPool, localBak, targetDb, {
                  firmaId: firkod,
                  onProgress: (pct) => step(`restore_${targetDb}`, `${restoreLabel} — %${pct}`, "running"),
                })
                step(`restore_${targetDb}`, restoreLabel, "done")
              } catch (err) {
                step(`restore_${targetDb}`, `Restore başarısız: ${targetDb}`, "error", { error: err instanceof Error ? err.message : String(err) })
                // Yalnız bizim kopyaladığımız geçici dosyayı temizle
                if (!isLocal) {
                  await execOnAgent(sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey, buildDeleteFile(localBak), 60).catch(() => {})
                }
                continue
              }

              await sonrakiAdimlar(f, targetDb)

              // 6) geçici .bak temizliği — SADECE Depo'dan kopyaladığımız dosya.
              // SQL sunucusundaki kaynak dosya kullanıcının kendi şablonu/yedeği
              // olabilir, ona dokunulmaz.
              if (!isLocal) {
                await execOnAgent(sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey, buildDeleteFile(localBak), 60).catch(() => {})
              }
            }

            /*  RESTORE ve ATTACH sonrası ortak adımlar (3-5): DB owner,
             *  sirket erişimi ve guvenlik kaydı. İki dal da aynı sırayı
             *  uyguluyor, tek yerde tutuluyor.                            */
            async function sonrakiAdimlar(f: FileReq, targetDb: string) {
              // 3) DB owner = firma login (login varsa)
              if (firmaLogin) {
                step(`owner_${targetDb}`, `DB owner ayarlanıyor: [${targetDb}] → ${firmaLogin}`, "running")
                try {
                  await setDbOwner(masterPool, targetDb, firmaLogin)
                  step(`owner_${targetDb}`, `DB owner: [${targetDb}] → ${firmaLogin}`, "done")
                } catch (err) {
                  step(`owner_${targetDb}`, `DB owner ayarlanamadı: ${targetDb}`, "error", { error: err instanceof Error ? err.message : String(err) })
                }

                // 4) sirket erişimi (idempotent)
                try {
                  await grantSirketAccess(masterPool, firmaLogin)
                  step(`sirket_${targetDb}`, `sirket erişimi doğrulandı: ${firmaLogin}`, "done")
                } catch { /* sirket yoksa atla */ }
              }

              // 5) sirket.dbo.guvenlik kaydı
              if (sirketExists) {
                step(`guvenlik_${targetDb}`, `Güvenlik kaydı: ${targetDb} (${f.programCode || "—"})`, "running")
                try {
                  await withSqlConnection(
                    sirketCfg,
                    async (sirketPool) => {
                      await insertGuvenlikRow(sirketPool, { dbName: targetDb, srkAdi: f.databaseName, firmaId: firkod, programCode: f.programCode || "", yedekAl })
                    },
                  )
                  step(`guvenlik_${targetDb}`, `Güvenlik kaydı eklendi: ${targetDb}`, "done")
                  if (yedekAl) eklenecek.push(targetDb)
                } catch (err) {
                  step(`guvenlik_${targetDb}`, `Güvenlik kaydı eklenemedi: ${targetDb}`, "error", { error: err instanceof Error ? err.message : String(err) })
                }
              }
            }

            /*
             * SQL Backup Master — yedek görevine ekle.
             *
             * KRİTİK DEĞİL: hata restore'u geçersiz kılmıyor, yalnız adım
             * kırmızı görünüyor ve elle eklenmesi gerektiği anlaşılıyor.
             * Üçüncü parti ürünün veri dosyasını düzenliyoruz (bkz.
             * lib/sql-backup-master.ts) ve bu yol kırılgan.
             *
             * `yedekAl` kapalıysa buraya hiç girilmiyor: `guvenlik.YedekAl`
             * de 0 yazıldı, iki taraf tutarlı kalıyor.
             */
            if (eklenecek.length > 0) {
              const etiket = `SQL Backup Master yedek görevine ekleniyor (${eklenecek.length} veritabanı)`
              step("sbm_add", etiket, "running")
              try {
                const r = await execOnAgent(
                  sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey,
                  buildAddDatabasesToBackupJobs(eklenecek), 90,
                )
                const hata = (r.stderr ?? "").trim()
                if (r.exitCode !== 0 || hata) {
                  step("sbm_add", "Yedek görevine eklenemedi — elle eklenmeli", "error", { error: hata || `exit ${r.exitCode}` })
                } else {
                  step("sbm_add", `Yedek görevine eklendi: ${eklenecek.length} veritabanı`, "done")
                }
              } catch (err) {
                step("sbm_add", "Yedek görevine eklenemedi — elle eklenmeli", "error", { error: err instanceof Error ? err.message : String(err) })
              }
            }
          },
        )

        send("done", { ok: true })
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) })
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

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } })
}
