import { NextResponse } from "next/server"
import { getSpareBackupOffline } from "@/lib/sparebackup-offline"

/**
 * GET /api/sparebackup/offline
 *
 * SpareBackup offline firma özetini (10.15.2.6:3000/offline-firms) proxy'ler.
 * Token Hub env'inde gizli; client doğrudan LAN'a erişemez. 60 sn cache
 * (lib/sparebackup-offline). Upstream'e ulaşılamazsa `ok:false` döner.
 *
 * Auth yok — /api/monitoring ile aynı: /tv kiosk ekranı (oturumsuz) da bu
 * veriyi çeker. Token zaten server-side gizli, dönen veri offline firma adı
 * + IP (LAN izleme kapsamında).
 */
export async function GET() {
  const data = await getSpareBackupOffline()
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "SpareBackup servisine ulaşılamadı" },
      { status: 200 }, // dashboard 200 bekliyor, ok:false ile ayırt eder
    )
  }
  return NextResponse.json(data)
}
