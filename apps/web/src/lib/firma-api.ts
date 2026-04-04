/**
 * Firma API istemcisi
 * Bağlantı: http://pars.pusulanet.net:50003/api
 * Auth: Basic (username/password)
 */

const BASE_URL  = process.env.FIRMA_API_URL      ?? ""
const USERNAME  = process.env.FIRMA_API_USERNAME ?? ""
const PASSWORD  = process.env.FIRMA_API_PASSWORD ?? ""
const TIMEOUT   = parseInt(process.env.FIRMA_API_TIMEOUT ?? "10") * 1000

function basicAuth() {
  return "Basic " + Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")
}

async function firmaFetch<T>(path: string, method: "GET" | "POST" = "POST"): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Authorization": basicAuth(),
        "Content-Type":  "application/json",
      },
      ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
      signal: controller.signal,
      cache:  "no-store",
    })

    if (!res.ok) {
      throw new Error(`Firma API hatası: ${res.status} ${res.statusText}`)
    }

    return res.json() as Promise<T>
  } finally {
    clearTimeout(timer)
  }
}

/* ── Tipler ── */
export interface FirmaServer {
  id:       string | number
  name:     string
  ip?:      string
  dns?:     string
  os?:      string
  roles?:   string[]
  [key: string]: unknown
}

export interface FirmaCompany {
  id:       string | number
  name:     string
  code?:    string
  [key: string]: unknown
}

/* ── Endpoint'ler ── */
interface WrappedResponse<T> {
  IsSuccess: boolean
  Message:   string
  Param:     T
}

async function firmaFetchWrapped<T>(path: string): Promise<T> {
  const res = await firmaFetch<WrappedResponse<T>>(path)
  if (!res.IsSuccess) throw new Error(res.Message || "Firma API başarısız döndü")
  return res.Param
}

export async function getFirmaServers(): Promise<FirmaServer[]> {
  return firmaFetchWrapped<FirmaServer[]>("/Server/List")
}

export async function getFirmaCompanies(): Promise<FirmaCompany[]> {
  return firmaFetchWrapped<FirmaCompany[]>("/Company/List")
}
