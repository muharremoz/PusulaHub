import { NextRequest, NextResponse } from "next/server"
import { google }                    from "googleapis"
import { getAuthorizedClient }       from "@/lib/google-oauth"

function buildRaw(to: string, cc: string, subject: string, body: string, fromEmail: string) {
  const lines = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
  ].filter(l => l !== null).join("\r\n")

  return Buffer.from(lines)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// POST /api/mail/send  { to, cc?, subject, body, replyToMessageId? }
export async function POST(req: NextRequest) {
  const body   = await req.json()
  const client = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  try {
    const gmail   = google.gmail({ version: "v1", auth: client })
    const profile = await gmail.users.getProfile({ userId: "me" })
    const from    = profile.data.emailAddress ?? ""

    const raw = buildRaw(body.to, body.cc ?? "", body.subject, body.body, from)

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
