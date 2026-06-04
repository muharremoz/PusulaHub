import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/require-permission"
import { getSpareBackupOffline } from "@/lib/sparebackup-offline"

/**
 * GET /api/sparebackup/offline
 *
 * SpareBackup offline firma özetini (10.15.2.6:3000/offline-firms) proxy'ler.
 * Token Hub env'inde gizli; client doğrudan LAN'a erişemez. 60 sn cache
 * (lib/sparebackup-offline). Upstream'e ulaşılamazsa `ok:false` döner —
 * dashboard kartı "ulaşılamadı" durumunu gösterir.
 */
export async function GET() {
  const gate = await requireAuth()
  if (gate) return gate

  const data = await getSpareBackupOffline()
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "SpareBackup servisine ulaşılamadı" },
      { status: 200 }, // dashboard 200 bekliyor, ok:false ile ayırt eder
    )
  }
  return NextResponse.json(data)
}
