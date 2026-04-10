import type { WizardServiceDto } from "@/app/api/services/route"

let _servicesCache: WizardServiceDto[] | null = null
let _servicesPromise: Promise<WizardServiceDto[]> | null = null

export function getCachedServices(): WizardServiceDto[] | null {
  return _servicesCache
}

export function loadServices(): Promise<WizardServiceDto[]> {
  if (_servicesCache) return Promise.resolve(_servicesCache)
  if (_servicesPromise) return _servicesPromise
  _servicesPromise = fetch("/api/services?onlyActive=true")
    .then((r) => r.json())
    .then((data) => {
      _servicesCache = Array.isArray(data) ? data : []
      return _servicesCache
    })
    .catch(() => {
      _servicesCache = []
      return _servicesCache
    })
  return _servicesPromise
}

export function invalidateServicesCache() {
  _servicesCache = null
  _servicesPromise = null
}
