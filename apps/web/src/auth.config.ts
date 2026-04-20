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
  // LAN üzerinden (örn. http://10.10.10.121:4242) erişen istemciler için:
  // NextAuth, default olarak Host header'dan gelen origin'i reddeder.
  // trustHost = true, Host header'a güvenerek yönlendirmeleri isteğin
  // geldiği origin'e yapar (localhost'a kilitlenmez).
  trustHost: true,
  providers: [],          // Credentials provider yalnızca auth.ts'te tanımlanır
  callbacks: {
    authorized({ auth }) {
      return !!auth       // JWT varsa yetkili
    },
  },
}
