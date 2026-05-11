/**
 * GET /api/aktarim/by-token/[token]/info
 *
 * Müşteri sayfasından çağrılır — auth gerekmez, sadece token validation.
 * Yalnızca müşteriye gösterilecek bilgileri döner (sunucu IP/credentials YOK).
 */

import { NextResponse } from "next/server"
import { getTransferSessionByToken, updateTransferProgress } from "@/lib/transfer-sessions"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const sess = await getTransferSessionByToken(token)
  if (!sess) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 })
  }
  if (sess.Status === "cancelled" || sess.Status === "expired") {
    return NextResponse.json({ ok: false, reason: sess.Status }, { status: 410 })
  }
  if (sess.Status === "completed") {
    return NextResponse.json({ ok: false, reason: "completed" }, { status: 410 })
  }
  if (new Date(sess.ExpiresAt) < new Date()) {
    await updateTransferProgress(token, { status: "expired" })
    return NextResponse.json({ ok: false, reason: "expired" }, { status: 410 })
  }

  // Sadece müşteriye uygun alanlar — server ID'leri, createdBy gibi
  // internal bilgiler dışarıda tutulur.
  return NextResponse.json({
    ok: true,
    firmaId:             sess.CompanyId,
    firmaName:           sess.FirmaName,
    status:              sess.Status,
    createdAt:           sess.CreatedAt,
    expiresAt:           sess.ExpiresAt,
    completedAt:         sess.CompletedAt,
    dataBytesTotal:      sess.DataBytesTotal,
    dataBytesReceived:   sess.DataBytesReceived,
    imageFilesTotal:     sess.ImageFilesTotal,
    imageFilesReceived:  sess.ImageFilesReceived,
    imageBytesTotal:     sess.ImageBytesTotal,
    imageBytesReceived:  sess.ImageBytesReceived,
    notes:               sess.Notes,
  })
}
