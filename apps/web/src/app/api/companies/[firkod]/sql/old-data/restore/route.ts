/**
 * POST /api/companies/[firkod]/sql/old-data/restore   (SSE / text-event-stream)
 *
 * "Yeni Veritabanı Ekle" — firmanın Depo'sundaki `D:\Eski Datalar\{firmaId}`
 * klasöründen seçilen .bak dosyalarını, sihirbazın SQL adımıyla BİREBİR
 * şekilde geri yükler:
 *
 *   1) .bak'ı Depo'dan SQL sunucusuna kimlik-doğrulamalı kopyala (net use)
 *   2) RESTORE DATABASE  → hedef ad: {firmaId}_{databaseName}
 *   3) DB owner = firmanın mevcut SQL login'i ({firmaId}_*)
 *   4) sirket DB erişimi (idempotent)
 *   5) sirket.dbo.guvenlik kaydı (programCode)
 *   6) geçici .bak temizliği
 *
 * Firma SQL login'i zaten sihirbazda oluşturulmuş olmalı; burada yeniden
 * oluşturulmaz, sadece owner/erişim için kullanılır.
 */

import { NextRequest } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer, firmaDataDir } from "@/lib/sql-restore"
import { setDbOwner, grantSirketAccess } from "@/lib/sql-firma-login"
import { insertGuvenlikRow } from "@/lib/sirket-guvenlik"
import { buildPullBakFromDepo, buildDeleteFile } from "@/lib/sql-backup-powershell"

interface FileReq {
  fileName:     string
  databaseName: string   // baz ad (firma prefix'siz) — hedef = {firmaId}_{base}
  programCode:  string
}

interface AgentInfo { ip: string; port: number; apiKey: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params

  let body: { files?: FileReq[] }
  try { body = await req.json() } catch { return json({ error: "Geçersiz JSON" }, 400) }
  const files = (body.files ?? []).filter((f) => f.fileName && f.databaseName)
  if (!files.length) return json({ error: "En az bir yedek dosyası seçilmeli" }, 400)

  // SQL hedefi (bağlantı creds)
  const sqlTarget = await resolveFirmaSqlTarget(firkod)
  if (!sqlTarget) return json({ error: "Firmaya tanımlı SQL sunucusu/credential yok" }, 404)

  // SQL sunucusunun agent'ı (kopya işlemi için) + Depo sunucusu + Windows creds.
  // Firma SQL login'i Hub DB'sinden DEĞİL, aşağıda canlı firma SQL sunucusundan
  // (sys.sql_logins) çekilir — doğru sunucu odur.
  const [sqlAgentRows, depoRows] = await Promise.all([
    query<{ ApiKey: string | null; AgentPort: number | null }[]>`
      SELECT ApiKey, AgentPort FROM Servers WHERE Id = ${sqlTarget.serverId}
    `,
    query<{ IP: string; Username: string | null; Password: string | null }[]>`
      SELECT s.IP, s.Username, s.Password
      FROM Companies c INNER JOIN Servers s ON s.Id = c.FileServerId
      WHERE c.CompanyId = ${firkod}
    `,
  ])

  const sqlAgentRow = sqlAgentRows[0]
  if (!sqlAgentRow?.ApiKey || !sqlAgentRow?.AgentPort) {
    return json({ error: "SQL sunucusunda PusulaAgent yapılandırılmamış (kopya için gerekli)" }, 400)
  }
  const sqlAgent: AgentInfo = { ip: sqlTarget.ip, port: sqlAgentRow.AgentPort, apiKey: sqlAgentRow.ApiKey }

  const depo = depoRows[0]
  if (!depo) return json({ error: "Firmaya tanımlı Depo sunucusu yok (FileServerId boş)" }, 400)
  const depoUser = depo.Username ?? ""
  const depoPass = depo.Password ? (decrypt(depo.Password) ?? "") : ""
  if (!depoUser || !depoPass) {
    return json({ error: "Depo sunucusunun Windows credential'ı (Username/Password) tanımlı değil" }, 400)
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
            const lg = await masterPool.request()
              .input("p", firkod + "\\_%")
              .query<{ name: string }>(`SELECT TOP 1 name FROM sys.sql_logins WHERE name LIKE @p ESCAPE '\\' ORDER BY LEN(name)`)
            firmaLogin = lg.recordset[0]?.name ?? null

            if (!firmaLogin) {
              // Login yoksa restore'u İPTAL ETME — DB'ler yine yüklensin, sadece
              // owner/sirket adımları atlanır (uyarı). Login sonradan oluşturulup
              // owner manuel atanabilir. (Örn. sihirbazı SQL adımında yarıda kalan firma.)
              step("login_check", `Firma SQL login'i (${firkod}_*) bulunamadı — DB owner/sirket adımları atlanacak`, "error", {
                error: "DB'ler restore edilecek ama owner firma login'ine devredilmeyecek. Login'i sihirbaz kullanıcı akışından veya manuel oluşturup owner'ı atayın.",
              })
            } else {
              step("login_check", `Firma SQL login'i: ${firmaLogin}`, "done")
            }

            const hasSirket = await masterPool.request()
              .query<{ c: number }>(`SELECT COUNT(*) c FROM sys.databases WHERE name = 'sirket'`)
            const sirketExists = (hasSirket.recordset[0]?.c ?? 0) > 0

            for (const f of files) {
              const targetDb = `${firkod}_${f.databaseName}`
              const localBak = `${localDir}\\${f.fileName}`

              // 1) Depo'dan kopyala
              step(`copy_${f.fileName}`, `Depo'dan kopyalanıyor: ${f.fileName}`, "running")
              const cp = await execOnAgent(
                sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey,
                buildPullBakFromDepo({ depoIp: depo.IP, depoUser, depoPass, firmaId: firkod, fileName: f.fileName, destDir: localDir }),
                600,
              )
              if (cp.exitCode !== 0 || (cp.stderr ?? "").trim()) {
                step(`copy_${f.fileName}`, `Kopyalama başarısız: ${f.fileName}`, "error", { error: (cp.stderr || cp.stdout || `exit ${cp.exitCode}`).slice(0, 300) })
                continue
              }
              step(`copy_${f.fileName}`, `Kopyalandı: ${f.fileName}`, "done")

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
                // temizlik dene, sonra sıradaki dosya
                await execOnAgent(sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey, buildDeleteFile(localBak), 60).catch(() => {})
                continue
              }

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
                    { server: sqlTarget.ip, user: sqlTarget.username, password: sqlTarget.password, database: "sirket", requestTimeout: 120000 },
                    async (sirketPool) => {
                      await insertGuvenlikRow(sirketPool, { dbName: targetDb, srkAdi: f.databaseName, firmaId: firkod, programCode: f.programCode || "" })
                    },
                  )
                  step(`guvenlik_${targetDb}`, `Güvenlik kaydı eklendi: ${targetDb}`, "done")
                } catch (err) {
                  step(`guvenlik_${targetDb}`, `Güvenlik kaydı eklenemedi: ${targetDb}`, "error", { error: err instanceof Error ? err.message : String(err) })
                }
              }

              // 6) geçici .bak temizliği
              await execOnAgent(sqlAgent.ip, sqlAgent.port, sqlAgent.apiKey, buildDeleteFile(localBak), 60).catch(() => {})
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
