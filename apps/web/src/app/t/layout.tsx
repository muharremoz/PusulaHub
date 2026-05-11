import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pusula Aktarım",
}

export default function TransferLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
