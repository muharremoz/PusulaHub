import { AppSidebar }               from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SessionProvider }          from "next-auth/react"
import { auth }                     from "@/auth"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  // next-auth `Session` şeması `expires` ister — pusula_session JWT'ini
  // uyumlu forma dönüştürüyoruz (useSession() çağrıldığında /api/auth/session
  // endpoint'i zaten aynı şekli döner; burada sadece initial hydration).
  const nextAuthSession = session
    ? { ...session, expires: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }
    : null
  return (
    <SessionProvider session={nextAuthSession}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  )
}
