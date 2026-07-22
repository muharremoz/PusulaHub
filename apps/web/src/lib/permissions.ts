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

import { getSupabaseServer } from "@/lib/supabase/server"

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
  { key: "company-detail",   label: "Firma Detay",       group: "general" },
  { key: "aktarim",          label: "Firma Aktarım",     group: "general" },
  { key: "messages",         label: "Mesajlar",          group: "general" },
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

  // Yönetim
  { key: "users",            label: "Kullanıcılar",      group: "admin" },
  { key: "vault",            label: "Şifre Kasası",      group: "admin" },

  // Geliştirici
  { key: "preview",          label: "Mesaj Önizleme",    group: "dev" },
]

export const HUB_APP_ID = "hub"

export type PermissionMap = Record<string, PermissionLevel>

/**
 * Bir kullanıcının belirtilen uygulamadaki modül izinlerini döner (public.user_permissions).
 * Admin → tüm modüllerde "write"; diğerleri → DB'den, yoksa "none".
 *
 * @param userId  auth.users uuid (public.user_permissions.user_id)
 * @param appId   public.apps.id (örn. "hub", "spareflow")
 * @param role    user_apps.role (bu app için kullanıcının rolü)
 * @param modules İzin haritası anahtarları (varsayılan: Hub modülleri)
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

  for (const m of modules) map[m.key] = "none"

  try {
    const sb = await getSupabaseServer()
    const { data } = await sb.from("user_permissions").select("module_key, level").eq("user_id", userId).eq("app_id", appId)
    for (const r of (data ?? []) as { module_key: string; level: string }[]) {
      if (r.level === "read" || r.level === "write") {
        map[r.module_key] = r.level as PermissionLevel
      }
    }
  } catch {
    /* okunamadıysa — hepsi none kalır */
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
