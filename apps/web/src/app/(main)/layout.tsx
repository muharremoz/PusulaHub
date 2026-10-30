import { PusulaAppShell }  from "@/components/pusula-app-shell"
import { SessionProvider } from "next-auth/react"
import { auth }            from "@/auth"
import { HubSenkronWidget } from "@/components/hub-senkron-widget"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  // next-auth `Session` şeması `expires` ister — pusula_session JWT'ini
  // uyumlu forma dönüştürüyoruz (useSession() çağrıldığında /api/auth/session
  // endpoint'i zaten aynı şekli döner; burada sadece initial hydration).
  const nextAuthSession = session
    ? { ...session, expires: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }
    : null
  return (
    <SessionProvider session={nextAuthSession as unknown as Parameters<typeof SessionProvider>[0]["session"]}>
      <PusulaAppShell>{children}</PusulaAppShell>
      {/* Kurulum sonrası arka planda süren Hub senkronu — sayfa değişse de görünür */}
      <HubSenkronWidget />
    </SessionProvider>
  )
}
