import { NextRequest, NextResponse } from "next/server"
import { google, gmail_v1 }          from "googleapis"
import { getAuthorizedClient }       from "@/lib/google-oauth"

type Params = { params: Promise<{ id: string }> }

function decodeBase64(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
}

function extractBody(payload: gmail_v1.Schema$MessagePart | null | undefined): { html: string; text: string } {
  if (!payload) return { html: "", text: "" }

  // Tek parça
  if (payload.mimeType === "text/html" && payload.body?.data)
    return { html: decodeBase64(payload.body.data), text: "" }
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return { html: "", text: decodeBase64(payload.body.data) }

  // Çok parçalı
  const parts = payload.parts ?? []
  let html = ""; let text = ""
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data)  html = decodeBase64(part.body.data)
    if (part.mimeType === "text/plain" && part.body?.data) text = decodeBase64(part.body.data)
    // iç içe multipart
    if (part.parts) {
      const inner = extractBody(part)
      if (!html && inner.html) html = inner.html
      if (!text && inner.text) text = inner.text
    }
  }
  return { html, text }
}

function parseHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

export interface MailDetail {
  id:          string
  threadId:    string
  subject:     string
  from:        string
  to:          string
  cc:          string
  date:        string
  html:        string
  text:        string
  isRead:      boolean
  isStarred:   boolean
  attachments: { id: string; name: string; mimeType: string; size: number }[]
}

// GET /api/mail/messages/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const client  = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  try {
    const gmail = google.gmail({ version: "v1", auth: client })
    const res   = await gmail.users.messages.get({ userId: "me", id, format: "full" })
    const msg   = res.data
    const headers = msg.payload?.headers ?? []

    // Okundu işaretle
    if ((msg.labelIds ?? []).includes("UNREAD")) {
      await gmail.users.messages.modify({
        userId: "me", id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      }).catch(() => {})
    }

    const { html, text } = extractBody(msg.payload ?? undefined)

    const attachments = (msg.payload?.parts ?? [])
      .filter(p => p.filename && p.filename.length > 0 && p.body?.attachmentId)
      .map(p => ({
        id:       p.body!.attachmentId!,
        name:     p.filename!,
        mimeType: p.mimeType ?? "application/octet-stream",
        size:     p.body?.size ?? 0,
      }))

    const detail: MailDetail = {
      id:        msg.id!,
      threadId:  msg.threadId!,
      subject:   parseHeader(headers, "Subject") || "(Konu yok)",
      from:      parseHeader(headers, "From"),
      to:        parseHeader(headers, "To"),
      cc:        parseHeader(headers, "Cc"),
      date:      parseHeader(headers, "Date"),
      html, text,
      isRead:    !(msg.labelIds ?? []).includes("UNREAD"),
      isStarred: (msg.labelIds ?? []).includes("STARRED"),
      attachments,
    }

    return NextResponse.json(detail)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Mesaj alınamadı" }, { status: 500 })
  }
}

// PATCH /api/mail/messages/[id]  { star?, read?, archive? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id }  = await params
  const body    = await req.json()
  const client  = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  const gmail = google.gmail({ version: "v1", auth: client })
  const addLabels: string[] = []; const removeLabels: string[] = []

  if (body.star === true)    addLabels.push("STARRED")
  if (body.star === false)   removeLabels.push("STARRED")
  if (body.read === true)    removeLabels.push("UNREAD")
  if (body.read === false)   addLabels.push("UNREAD")
  if (body.archive === true) removeLabels.push("INBOX")

  await gmail.users.messages.modify({
    userId: "me", id,
    requestBody: { addLabelIds: addLabels, removeLabelIds: removeLabels },
  })
  return NextResponse.json({ ok: true })
}

// DELETE /api/mail/messages/[id]  →  çöp kutusuna taşı
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const client  = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  const gmail = google.gmail({ version: "v1", auth: client })
  await gmail.users.messages.trash({ userId: "me", id })
  return NextResponse.json({ ok: true })
}
