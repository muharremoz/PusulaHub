import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { MODULES, type PermissionLevel } from "@/lib/permissions"

/**
 * Hub root: kullanıcının izinli olduğu ilk modüle yönlendirir.
 *
 * - Admin → /dashboard
 * - Dashboard read izni varsa → /dashboard
 * - Yoksa MODULES sırasından ilk izinli olana
 * - Hiçbir modüle izni yoksa /unauthorized
 */
export default async function RootPage() {
  const session = await auth()
  const role  = session?.user?.role
  const perms = (session?.user?.permissions ?? {}) as Record<string, PermissionLevel>

  if (role === "admin" || (perms["dashboard"] ?? "none") !== "none") {
    redirect("/dashboard")
  }

  // Sidebar'daki sıralama ile aynı modül önceliği — ilk yetkili olana git
  for (const m of MODULES) {
    if (m.key === "dashboard") continue
    if (m.key === "company-detail") continue   // detay yönlendirme hedefi değil
    if ((perms[m.key] ?? "none") !== "none") {
      redirect(`/${m.key}`)
    }
  }

  redirect("/unauthorized")
}
