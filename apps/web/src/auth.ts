import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt      from "bcryptjs"
import { verifySync } from "otplib"
import { query, execute } from "@/lib/db"
import { authConfig } from "@/auth.config"
import { getUserPermissions, type PermissionMap } from "@/lib/permissions"

/* ── Tip genişletme ── */
declare module "next-auth" {
  interface Session {
    user: {
      id:          string
      username:    string
      fullName:    string
      role:        string
      permissions: PermissionMap
    } & DefaultSession["user"]
  }
  interface User {
    id:       string
    username: string
    fullName: string
    role:     string
  }
}

interface UserRow {
  Id: string; Username: string; Email: string | null
  PasswordHash: string; FullName: string | null; Role: string
  IsActive: boolean; TwoFactorEnabled: boolean; TwoFactorSecret: string | null
}
interface TempTokenRow { UserId: string; ExpiresAt: string }

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username:  { label: "Kullanıcı Adı", type: "text"     },
        password:  { label: "Şifre",          type: "password" },
        tempToken: { label: "Temp Token",     type: "text"     },
        otpCode:   { label: "2FA Kodu",       type: "text"     },
      },
      async authorize(credentials) {
        const tempToken = credentials?.tempToken as string | undefined
        const otpCode   = credentials?.otpCode   as string | undefined

        /* ── 2FA tamamlama akışı ── */
        if (tempToken && otpCode) {
          const tokenRows = await query<TempTokenRow[]>`
            SELECT UserId, CONVERT(NVARCHAR(30), ExpiresAt, 120) AS ExpiresAt
            FROM TwoFactorTempTokens WHERE Token = ${tempToken}
          `
          if (!tokenRows.length) return null

          const { UserId, ExpiresAt } = tokenRows[0]
          if (new Date(ExpiresAt) < new Date()) {
            await execute`DELETE FROM TwoFactorTempTokens WHERE Token = ${tempToken}`
            return null
          }

          const userRows = await query<UserRow[]>`
            SELECT Id, Username, Email, FullName, Role, TwoFactorSecret,
                   IsActive, TwoFactorEnabled, PasswordHash
            FROM AppUsers WHERE Id = ${UserId} AND IsActive = 1
          `
          if (!userRows.length) return null

          const user = userRows[0]
          if (!user.TwoFactorSecret) return null

          const result = verifySync({ token: otpCode.trim(), secret: user.TwoFactorSecret })
          const valid  = result.valid
          if (!valid) return null

          // Kullanılan temp token'ı sil
          await execute`DELETE FROM TwoFactorTempTokens WHERE Token = ${tempToken}`

          return {
            id:       user.Id,
            username: user.Username,
            email:    user.Email ?? undefined,
            fullName: user.FullName ?? user.Username,
            role:     user.Role,
            name:     user.FullName ?? user.Username,
          }
        }

        /* ── Normal şifre akışı (2FA olmayan kullanıcılar) ── */
        const username = (credentials?.username as string)?.trim().toLowerCase()
        const password = credentials?.password as string
        if (!username || !password) return null

        const rows = await query<UserRow[]>`
          SELECT Id, Username, Email, PasswordHash, FullName, Role,
                 IsActive, TwoFactorEnabled, TwoFactorSecret
          FROM AppUsers
          WHERE (LOWER(Username) = ${username} OR LOWER(Email) = ${username}) AND IsActive = 1
        `
        if (!rows.length) return null

        const user  = rows[0]
        const pwOk  = await bcrypt.compare(password, user.PasswordHash)
        if (!pwOk) return null

        // 2FA aktifse bu akıştan devam edilemez — preflight kullanılmalı
        if (user.TwoFactorEnabled) return null

        return {
          id:       user.Id,
          username: user.Username,
          email:    user.Email ?? undefined,
          fullName: user.FullName ?? user.Username,
          role:     user.Role,
          name:     user.FullName ?? user.Username,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id          = user.id
        token.username    = user.username
        token.fullName    = user.fullName
        token.role        = user.role
        token.permissions = await getUserPermissions(user.id, user.role)
      }
      // Session güncelleme tetiklendiğinde (ör. izin değişikliği sonrası) izinleri yenile
      if (trigger === "update" && token.id && token.role) {
        token.permissions = await getUserPermissions(token.id as string, token.role as string)
      }
      return token
    },
    session({ session, token }) {
      session.user.id          = token.id          as string
      session.user.username    = token.username    as string
      session.user.fullName    = token.fullName    as string
      session.user.role        = token.role        as string
      session.user.permissions = (token.permissions ?? {}) as PermissionMap
      return session
    },
  },
})
