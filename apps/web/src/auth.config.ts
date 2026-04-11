import type { NextAuthConfig } from "next-auth"

/**
 * Edge runtime'da çalışan (middleware) auth yapılandırması.
 * bcryptjs / otplib gibi Node.js built-in gerektiren paketler BURAYA GİRMEZ.
 * Sadece JWT doğrulama + yönlendirme mantığı burada olur.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages:   { signIn: "/login" },
  providers: [],          // Credentials provider yalnızca auth.ts'te tanımlanır
  callbacks: {
    authorized({ auth }) {
      return !!auth       // JWT varsa yetkili
    },
  },
}
