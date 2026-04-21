import { NextRequest, NextResponse } from "next/server"
import { google }                    from "googleapis"
import { getAuthorizedClient }       from "@/lib/google-oauth"

interface Attachment { name: string; type: string; data: string } // data = base64

function encodeHeader(value: string) {
  // Non-ASCII için RFC 2047 encoded-word
  return /[^\x20-\x7E]/.test(value)
    ? `=?utf-8?B?${Buffer.from(value).toString("base64")}?=`
    : value
}

function buildRaw(
  to: string, cc: string, subject: string, body: string, fromEmail: string,
  attachments: Attachment[] = [],
) {
  const boundary = `=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const headers = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ].filter((l): l is string => l !== null)

  let message: string
  if (!attachments.length) {
    headers.push("Content-Type: text/html; charset=utf-8")
    headers.push("Content-Transfer-Encoding: base64")
    message = headers.join("\r\n") + "\r\n\r\n" + Buffer.from(body).toString("base64")
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    const parts: string[] = []
    // HTML body part
    parts.push([
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body).toString("base64"),
    ].join("\r\n"))
    // Attachments
    for (const a of attachments) {
      parts.push([
        `--${boundary}`,
        `Content-Type: ${a.type}; name="${encodeHeader(a.name)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${encodeHeader(a.name)}"`,
        "",
        a.data.replace(/(.{76})/g, "$1\r\n"),
      ].join("\r\n"))
    }
    parts.push(`--${boundary}--`)
    message = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n")
  }

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export const maxDuration = 60

// POST /api/mail/send  { to, cc?, subject, body, replyToMessageId?, attachments? }
export async function POST(req: NextRequest) {
  const body   = await req.json()
  const client = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  try {
    const gmail   = google.gmail({ version: "v1", auth: client })
    const profile = await gmail.users.getProfile({ userId: "me" })
    const from    = profile.data.emailAddress ?? ""

    const raw = buildRaw(
      body.to, body.cc ?? "", body.subject, body.body, from,
      Array.isArray(body.attachments) ? body.attachments : [],
    )

    let threadId: string | undefined

    // Yanıt ise threadId al
    if (body.replyToMessageId) {
      const orig = await gmail.users.messages.get({ userId: "me", id: body.replyToMessageId, format: "metadata" })
      threadId = orig.data.threadId ?? undefined
    }

    await gmail.users.messages.send({
      userId:      "me",
      requestBody: { raw, ...(threadId ? { threadId } : {}) },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Gönderilemedi" }, { status: 500 })
  }
}
