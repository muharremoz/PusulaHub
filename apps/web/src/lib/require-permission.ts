/**
 * API route'ları için yetki kontrolü helper'ı.
 *
 * Kullanım:
 *   export async function GET() {
 *     const gate = await requirePermission("servers", "read")
 *     if (gate) return gate   // 401/403 response
 *     // ... normal akış
 *   }
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { hasLevel, type PermissionLevel } from "@/lib/permissions"

/**
 * İzin yoksa Response döner; varsa null döner.
 * Caller: `if (gate) return gate`
 */
export async function requirePermission(
  moduleKey: string,
  need:      PermissionLevel = "read",
): Promise<Response | null> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 })
  }

  // Admin her şeye yazabilir
  if (session.user.role === "admin") return null

  const have = (session.user.permissions?.[moduleKey] ?? "none") as PermissionLevel
  if (!hasLevel(have, need)) {
    return NextResponse.json(
      { error: "Bu işlem için yetkiniz yok", module: moduleKey, need },
      { status: 403 },
    )
  }
  return null
}

/** Sadece giriş kontrolü (herhangi bir izin aramaz) */
export async function requireAuth(): Promise<Response | null> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 })
  }
  return null
}
