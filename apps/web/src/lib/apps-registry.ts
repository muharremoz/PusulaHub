/**
 * Pusula uygulama sicili (Hub tarafı).
 * AllowedApps CSV kolonunda kullanılan id'lerin tek otorite kaynağı.
 * PusulaSwitch `src/lib/apps.config.ts` ile senkron tutulmalı.
 */
export interface AppRegistryEntry {
  id:   string
  name: string
}

export const APP_REGISTRY: AppRegistryEntry[] = [
  { id: "hub",       name: "PusulaHub"  },
  { id: "spareflow", name: "SpareFlow"  },
]

export function parseAllowedApps(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv.split(",").map((s) => s.trim()).filter(Boolean)
}

export function serializeAllowedApps(apps: string[]): string | null {
  const filtered = apps
    .map((s) => s.trim())
    .filter((s) => s && APP_REGISTRY.some((a) => a.id === s))
  return filtered.length ? filtered.join(",") : null
}
