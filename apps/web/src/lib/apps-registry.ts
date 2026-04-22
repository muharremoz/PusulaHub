/**
 * Pusula uygulama sicili (Hub tarafı — UI için static registry).
 *
 * Gerçek yetki verisi artık `dbo.Apps` + `dbo.UserApps` tablolarında.
 * Bu dosya sadece UI'da uygulama adlarını göstermek ve geçersiz app id'lerini
 * filtrelemek için kullanılır.
 *
 * PusulaSwitch `src/lib/apps.config.ts` ve `dbo.Apps` tablosu ile senkron
 * tutulmalı (ileride tümü DB'den dinamik okunabilir).
 */
export interface AppRegistryEntry {
  id:   string
  name: string
}

export const APP_REGISTRY: AppRegistryEntry[] = [
  { id: "hub",       name: "PusulaHub"  },
  { id: "spareflow", name: "SpareFlow"  },
]

/** Geçersiz / bilinmeyen app id'lerini ele — INSERT etmeden önce temizle. */
export function filterKnownApps(apps: string[]): string[] {
  const known = new Set(APP_REGISTRY.map((a) => a.id))
  return Array.from(new Set(
    apps.map((s) => s.trim()).filter((s) => s && known.has(s))
  ))
}
