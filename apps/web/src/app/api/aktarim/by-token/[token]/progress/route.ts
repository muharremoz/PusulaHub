/**
 * PATCH /api/aktarim/by-token/[token]/progress
 *
 * Ubuntu upload servisi periyodik olarak çağırır — byte sayaçlarını günceller.
 * Auth: X-Service-Key header.
 *
 * Body:
 *   { status?, dataBytesTotal?, dataBytesReceived?,
 *     imageFilesTotal?, imageFilesReceived?,
 *     imageBytesTotal?, imageBytesReceived? }
 */

import { NextRequest, NextResponse } from "next/server"
import { updateTransferProgress, type TransferStatus } from "@/lib/transfer-sessions"

function isServiceAuthorized(req: NextRequest): boolean {
  const expected = process.env.TRANSFER_SERVICE_KEY ?? ""
  if (!expected) return false
  const got = req.headers.get("x-service-key") ?? ""
  return got === expected
}

interface Body {
  status?:             TransferStatus
  dataBytesTotal?:     number
  dataBytesReceived?:  number
  imageFilesTotal?:    number
  imageFilesReceived?: number
  imageBytesTotal?:    number
  imageBytesReceived?: number
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isServiceAuthorized(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 })
  }

  const { token } = await params
  let body: Body
  try { body = (await req.json()) as Body } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }

  const sess = await updateTransferProgress(token, body)
  if (!sess) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true, session: sess })
}
