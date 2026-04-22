"use client"

import { useEffect } from "react"

/**
 * basePath uyumluluğu için window.fetch wrap'i.
 *
 * Sorun: next.config'te basePath="/apps/hub" tanımlı; tarayıcıdan
 * `fetch("/api/foo")` çağrısı `localhost:4000/api/foo`'ya gider — gateway
 * orada hiçbir şey çalıştırmaz → 404. Doğru hedef `localhost:4000/apps/hub/api/foo`.
 *
 * Çözüm: window.fetch'i bir kez patch'leyip "/api/" ile başlayan absolute
 * path'lere basePath'i prepend ederiz. Mevcut 144 fetch çağrısı dokunulmadan
 * çalışmaya devam eder.
 *
 * - Path zaten basePath ile başlıyorsa dokunmaz (idempotent)
 * - Tam URL (http://...) gönderilenleri etkilemez
 * - SSR/Edge'de etkisiz (window olmadığı için)
 */
const BASE_PATH = "/apps/hub"

export function FetchBasePath() {
  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window as typeof window & { __fetchPatched?: boolean }
    if (w.__fetchPatched) return
    w.__fetchPatched = true

    const orig = window.fetch.bind(window)

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        if (typeof input === "string") {
          if (input.startsWith("/api/") && !input.startsWith(BASE_PATH + "/")) {
            return orig(BASE_PATH + input, init)
          }
          return orig(input, init)
        }
        if (input instanceof URL) {
          return orig(input, init)
        }
        // Request nesnesi
        const url = (input as Request).url
        if (url.startsWith("/api/") && !url.startsWith(BASE_PATH + "/")) {
          return orig(new Request(BASE_PATH + url, input as Request), init)
        }
        return orig(input, init)
      } catch {
        return orig(input, init)
      }
    }
  }, [])

  return null
}
