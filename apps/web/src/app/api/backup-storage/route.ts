import { NextResponse } from "next/server"
import { backupStorageConfigured, fetchBackupStorage } from "@/lib/backup-storage"

/**
 * GET /api/backup-storage
 *
 * Müşteri yedeklerinin yazıldığı SFTP sunucusunun disk doluluğu.
 * /tv disk kartı bunu gösteriyor.
 *
 * Ayrı bir uç olmasının sebebi: /api/esxi fiziksel host ile ilgili,
 * burası bambaşka bir sunucu. Tek uçta birleştirmek birinin arızası
 * diğerini de sessizce boş bırakırdı.
 *
 * Cache lib tarafında (5 dk) — her istekte SSH açılmaz.
 */
export async function GET() {
  if (!backupStorageConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "SFTP kimlik bilgileri tanımlı değil" },
      { status: 200 },
    )
  }

  try {
    const storage = await fetchBackupStorage()
    if (!storage) {
      return NextResponse.json({ ok: false, reason: "Yedek sunucusuna ulaşılamadı" }, { status: 200 })
    }
    const res = NextResponse.json({ ok: true, fetchedAt: new Date().toISOString(), storage })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[GET /api/backup-storage]", msg)
    return NextResponse.json({ ok: false, reason: msg }, { status: 200 })
  }
}
