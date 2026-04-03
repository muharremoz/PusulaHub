import { PageContainer } from "@/components/layout/page-container"
import { WizardShell } from "@/components/company-setup/wizard-shell"

export default function CompanySetupPage() {
  return (
    <PageContainer
      title="Firma Kurulum Sihirbazı"
      description="Yeni firma için AD, dosya sistemi ve SQL kurulumu"
    >
      <WizardShell />
    </PageContainer>
  )
}
