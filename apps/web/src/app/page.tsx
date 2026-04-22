import { redirect } from "next/navigation"

/**
 * Hub root: kimlik doğrulama gateway'e taşındı, eskiden /login'e yönlendirirdi.
 * Şimdi direkt /dashboard'a düşer (middleware session yoksa zaten gateway'e atar).
 */
export default function RootPage() {
  redirect("/dashboard")
}
