import { NextResponse } from "next/server"

interface FirmaApiItem {
  Firkod:    number
  Firma:     string
  EMail:     string
  Mobile:    string
  UserCount: number
  Lisans:    string
}

interface FirmaApiResponse {
  IsSuccess:    boolean
  Message:      string
  ResultString: string
  ResultInt:    number
  Param:        FirmaApiItem[]
}

export interface FirmaCompany {
  id:          string
  firkod:      string
  firma:       string
  email:       string
  phone:       string
  userCount:   number
  lisansBitis: string
}

export async function GET() {
  const baseUrl  = process.env.FIRMA_API_URL      ?? ""
  const username = process.env.FIRMA_API_USERNAME ?? ""
  const password = process.env.FIRMA_API_PASSWORD ?? ""
  const timeout  = parseInt(process.env.FIRMA_API_TIMEOUT ?? "10") * 1000

  if (!baseUrl) {
    return NextResponse.json({ error: "Firma API URL tanımlı değil" }, { status: 503 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${baseUrl}/Server/List`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: controller.signal,
      cache:  "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Firma API hatası: ${res.status}` }, { status: res.status })
    }

    const json: FirmaApiResponse = await res.json()

    if (!json.IsSuccess) {
      return NextResponse.json({ error: json.Message || "Firma API başarısız döndü" }, { status: 502 })
    }

    const raw = json.Param ?? []

    const companies: FirmaCompany[] = raw.map((item) => ({
      id:          String(item.Firkod),
      firkod:      String(item.Firkod),
      firma:       item.Firma.trim(),
      email:       item.EMail === "X" ? "" : item.EMail,
      phone:       item.Mobile === "X" ? "" : item.Mobile,
      userCount:   item.UserCount,
      lisansBitis: item.Lisans,
    }))

    return NextResponse.json(companies)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Firma API zaman aşımı" }, { status: 504 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[GET /api/firma/companies]", msg)
    return NextResponse.json({ error: `Firma API bağlantı hatası: ${msg}` }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
