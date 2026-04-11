import { NextRequest, NextResponse } from "next/server"
import { google, gmail_v1 }          from "googleapis"
import { getAuthorizedClient }       from "@/lib/google-oauth"

export interface MailMessage {
  id:         string
  threadId:   string
  subject:    string
  from:       string
  fromName:   string
  to:         string
  date:       string
  snippet:    string
  isRead:     boolean
  isStarred:  boolean
  labels:     string[]
  hasAttachment: boolean
}

function parseHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*?)\s*<(.+?)>$/)
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2] }
  return { name: raw, email: raw }
}

// GET /api/mail/messages?label=INBOX&q=&pageToken=&maxResults=25
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const label      = searchParams.get("label")      ?? "INBOX"
  const q          = searchParams.get("q")          ?? ""
  const pageToken  = searchParams.get("pageToken")  ?? undefined
  const maxResults = parseInt(searchParams.get("maxResults") ?? "25")

  const client = await getAuthorizedClient()
  if (!client) return NextResponse.json({ error: "Bağlı değil" }, { status: 401 })

  try {
    const gmail = google.gmail({ version: "v1", auth: client })

    const listRes = await gmail.users.messages.list({
      userId:     "me",
      labelIds:   [label],
      q:          q || undefined,
      pageToken,
      maxResults,
    })

    const messages = listRes.data.messages ?? []
    if (!messages.length) {
      return NextResponse.json({ messages: [], nextPageToken: null })
    }

    // Toplu fetch (paralel, max 25)
    const details = await Promise.all(
      messages.map(m =>
        gmail.users.messages.get({
          userId: "me",
          id:     m.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date"],
        })
      )
    )

    const result: MailMessage[] = details.map(d => {
      const msg     = d.data
      const headers = msg.payload?.headers ?? []
      const from    = parseFrom(parseHeader(headers, "From"))
      return {
        id:            msg.id!,
        threadId:      msg.threadId!,
        subject:       parseHeader(headers, "Subject") || "(Konu yok)",
        from:          from.email,
        fromName:      from.name || from.email,
        to:            parseHeader(headers, "To"),
        date:          parseHeader(headers, "Date"),
        snippet:       msg.snippet ?? "",
        isRead:        !(msg.labelIds ?? []).includes("UNREAD"),
        isStarred:     (msg.labelIds ?? []).includes("STARRED"),
        labels:        msg.labelIds ?? [],
        hasAttachment: (msg.payload?.parts ?? []).some(p => p.filename && p.filename.length > 0),
      }
    })

    return NextResponse.json({ messages: result, nextPageToken: listRes.data.nextPageToken ?? null })
  } catch (e: unknown) {
    console.error(e)
    const msg = e instanceof Error ? e.message : "Gmail hatası"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
