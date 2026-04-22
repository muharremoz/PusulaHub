/**
 * Compat: next-auth `Session.user` şemasını pusula_session kullanıcı şemasına
 * eşle ki mevcut client component'ler (useSession) aynı alanları görsün.
 */
import type { DefaultSession } from "next-auth"
import type { PermissionMap }  from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id:          string
      username:    string
      fullName:    string
      role:        string
      permissions: PermissionMap
      apps:        string[]
    } & DefaultSession["user"]
  }
}

export {}
