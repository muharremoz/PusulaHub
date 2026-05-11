/**
 * Hub → Ubuntu Aktarım servisi proxy helper'ı.
 *
 * Aktarım state'i Ubuntu'nun yerel SQLite'ında — Hub bir thin client.
 * Hub admin tarafından bu helper kullanılarak Ubuntu API'sine HTTP çağrıları
 * yapılır (X-Service-Key auth ile).
 *
 * Env:
 *   AKTARIM_SERVICE_URL    — http://10.15.2.6:5000 (Hub'ın VPN üzerinden Ubuntu)
 *   TRANSFER_SERVICE_KEY   — shared secret (Ubuntu .env ile aynı olmalı)
 */

const BASE = process.env.AKTARIM_SERVICE_URL ?? "http://10.15.2.6:5000"
const KEY  = process.env.TRANSFER_SERVICE_KEY ?? ""

export interface AktarimSession {
  id:                  string
  token:               string
  companyId:           string
  firmaName:           string
  sqlServerName:       string | null
  depoServerName:      string | null
  status:              "pending" | "active" | "completed" | "cancelled" | "expired"
  createdBy:           string | null
  createdAt:           string
  expiresAt:           string
  completedAt:         string | null
  dataBytesTotal:      number
  dataBytesReceived:   number
  imageFilesTotal:     number
  imageFilesReceived:  number
  imageBytesTotal:     number
  imageBytesReceived:  number
  notes:               string | null
}

function headers(): Record<string, string> {
  return {
    "Content-Type":  "application/json",
    "X-Service-Key": KEY,
  }
}

async function asJson<T>(r: Response): Promise<T> {
  const text = await r.text()
  try { return JSON.parse(text) as T } catch {
    throw new Error(`Beklenmedik yanıt (${r.status}): ${text.slice(0, 200)}`)
  }
}

export async function listSessions(): Promise<AktarimSession[]> {
  const r = await fetch(`${BASE}/admin/sessions`, { headers: headers(), cache: "no-store" })
  if (!r.ok) throw new Error(`Ubuntu listSessions: HTTP ${r.status}`)
  return await asJson<AktarimSession[]>(r)
}

export interface CreateInput {
  companyId:       string
  firmaName:       string
  /** Hub Servers tablosundan ID — backend bunları credential'a açar */
  sqlServerId?:    string | null
  depoServerId?:   string | null
  /** Ubuntu'ya geçen alanlar (Hub backend doldurur) */
  sqlServerName?:  string | null
  sqlServerIp?:    string | null
  sqlUsername?:    string | null
  sqlPassword?:    string | null
  depoServerName?: string | null
  depoServerIp?:   string | null
  depoUsername?:   string | null
  depoPassword?:   string | null
  expiresInDays?:  number
  createdBy?:      string | null
  notes?:          string | null
}

export async function createSession(input: CreateInput): Promise<AktarimSession> {
  const r = await fetch(`${BASE}/admin/sessions`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify(input),
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Ubuntu createSession: HTTP ${r.status} — ${body.slice(0, 200)}`)
  }
  return await asJson<AktarimSession>(r)
}

export async function cancelSession(id: string): Promise<void> {
  const r = await fetch(`${BASE}/admin/sessions/${encodeURIComponent(id)}/cancel`, {
    method: "POST", headers: headers(),
  })
  if (!r.ok) throw new Error(`Ubuntu cancelSession: HTTP ${r.status}`)
}

export async function deleteSession(id: string): Promise<void> {
  const r = await fetch(`${BASE}/admin/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE", headers: headers(),
  })
  if (!r.ok) throw new Error(`Ubuntu deleteSession: HTTP ${r.status}`)
}
