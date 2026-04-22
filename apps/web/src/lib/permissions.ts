/**
 * PusulaHub — Yetkilendirme sistemi
 *
 * - Modül kataloğu: her sidebar öğesi için stabil bir key
 * - Seviyeler: "none" (default) | "read" | "write"
 * - Admin rolü → otomatik tüm modüllere "write"
 * - Diğer kullanıcılar → UserPermissions tablosundan yüklenir
 *
 * Çoklu uygulama: `UserPermissions` artık (UserId, AppId, ModuleKey) ile
 * saklanır. Her app kendi modül kataloğunu getirir ve kendi AppId'siyle okur.
 */

import { query } from "@/lib/db"

export type PermissionLevel = "none" | "read" | "write"

export interface ModuleDef {
  key:    string
  label:  string
  group:  "general" | "services" | "data" | "admin" | "dev"
}

/** Hub sidebar'daki tüm modüller — key'ler stabil tutulmalı (DB'de saklanıyor) */
export const MODULES: ModuleDef[] = [
  // Genel
  { key: "dashboard",        label: "Dashboard",         group: "general" },
  { key: "servers",          label: "Sunucular",         group: "general" },
  { key: "monitoring",       label: "İzleme",            group: "general" },
  { key: "companies",        label: "Firmalar",          group: "general" },
  { key: "projects",         label: "Projeler",          group: "general" },
  { key: "calendar",         label: "Takvim",            group: "general" },
  { key: "notes",            label: "Not Defteri",       group: "general" },

  // Servisler
  { key: "services",         label: "Pusula Hizmetleri", group: "services" },
  { key: "databases",        label: "Demo Veritabanları",group: "services" },
  { key: "iis",              label: "IIS",               group: "services" },
  { key: "active-directory", label: "Active Directory",  group: "services" },
  { key: "sql",              label: "SQL",               group: "services" },
  { key: "ports",            label: "Port Yönetimi",     group: "services" },

  // Veri & Raporlar
  { key: "files",            label: "Dosyalar",          group: "data" },
  { key: "logs",             label: "Loglar",            group: "data" },
  { key: "reports",          label: "Raporlar",          group: "data" },

  // Yönetim
  { key: "messages",         label: "Mesajlar",          group: "admin" },
  { key: "users",            label: "Kullanıcılar",      group: "admin" },
  { key: "api-connections",  label: "API Bağlantıları",  group: "admin" },
  { key: "vault",            label: "Şifre Kasası",      group: "admin" },

  // Geliştirici
  { key: "preview",          label: "Mesaj Önizleme",    group: "dev" },
]

export const HUB_APP_ID = "hub"

export type PermissionMap = Record<string, PermissionLevel>

interface PermRow { ModuleKey: string; Level: string }

/**
 * Bir kullanıcının belirtilen uygulamadaki modül izinlerini döner.
 * Admin → tüm modüllerde "write"
 * Diğerleri → DB'den, yoksa "none"
 *
 * @param userId  AppUsers.Id
 * @param appId   Apps.Id  (örn. "hub", "spareflow")
 * @param role    UserApps.Role (bu app için kullanıcının rolü)
 * @param modules İzin haritasında key olarak kullanılacak modül listesi
 *                (varsayılan: Hub modülleri)
 */
export async function getUserPermissions(
  userId:  string,
  appId:   string,
  role:    string,
  modules: ModuleDef[] = MODULES,
): Promise<PermissionMap> {
  const map: PermissionMap = {}

  if (role === "admin") {
    for (const m of modules) map[m.key] = "write"
    return map
  }

  // Default: hepsi none
  for (const m of modules) map[m.key] = "none"

  try {
    const rows = await query<PermRow[]>`
      SELECT ModuleKey, [Level] FROM UserPermissions
      WHERE UserId = ${userId} AND AppId = ${appId}
    `
    for (const r of rows) {
      if (r.Level === "read" || r.Level === "write") {
        map[r.ModuleKey] = r.Level as PermissionLevel
      }
    }
  } catch {
    /* tablo henüz yoksa — hepsi none kalır */
  }

  return map
}

/**
 * İki seviye karşılaştırma helper'ı.
 * hasPermission("write", "read") → false (write gerekiyor ama read var)
 * hasPermission("read",  "write") → true
 */
export function hasLevel(have: PermissionLevel, need: PermissionLevel): boolean {
  const order: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2 }
  return order[have] >= order[need]
}
