/**
 * Firma API istemcisi
 * Bağlantı: http://pars.pusulanet.net:50003/api
 * Auth: Basic (username/password)
 */

/**
 * ⚠ Env top-level const'a ALINMAZ, her çağrıda okunur. `server.ts` bu modülü
 * firma-sync üzerinden import ediyor; ESM import'ları hoist edildiği için modül
 * gövdesi dotenv `config()` çağrısından ÖNCE çalışır ve değerler boş kalırdı.
 */
function apiEnv() {
  return {
    baseUrl:  process.env.FIRMA_API_URL      ?? "",
    username: process.env.FIRMA_API_USERNAME ?? "",
    password: process.env.FIRMA_API_PASSWORD ?? "",
    timeout:  parseInt(process.env.FIRMA_API_TIMEOUT ?? "10") * 1000,
  }
}

async function firmaFetch<T>(path: string, method: "GET" | "POST" = "POST"): Promise<T> {
  const { baseUrl, username, password, timeout } = apiEnv()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const basicAuth = () => "Basic " + Buffer.from(`${username}:${password}`).toString("base64")

  try {
    const res = await fetch(`${baseUrl}${path}`, {
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

async function firmaFetchWrapped<T>(path: string, method: "GET" | "POST" = "POST"): Promise<T> {
  const res = await firmaFetch<WrappedResponse<T>>(path, method)
  if (!res.IsSuccess) throw new Error(res.Message || "Firma API başarısız döndü")
  return res.Param
}

export async function getFirmaServers(): Promise<FirmaServer[]> {
  // API 2026-06'da değişti: POST /Server/List → GET /Account/ServerList
  return firmaFetchWrapped<FirmaServer[]>("/Account/ServerList", "GET")
}

export async function getFirmaCompanies(): Promise<FirmaCompany[]> {
  return firmaFetchWrapped<FirmaCompany[]>("/Company/List")
}
