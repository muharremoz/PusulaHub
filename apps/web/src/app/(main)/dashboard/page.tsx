import { PageContainer } from "@/components/layout/page-container"

/** Dashboard yeniden tasarlanıyor (16.10.2026) — eski içerik ve /api/dashboard/* kaldırıldı.
 *  Rota kalıyor: giriş sonrası `/` buraya yönlendiriyor, menü ve komut paleti de bağlı. */
export default function DashboardPage() {
  return (
    <PageContainer title="Dashboard" description="Yeniden tasarlanıyor">
      <div className="flex min-h-[320px] items-center justify-center rounded-[8px] bg-[var(--section-bg)] p-2">
        <p className="text-[13px] text-muted-foreground">Dashboard yeniden hazırlanıyor.</p>
      </div>
    </PageContainer>
  )
}
