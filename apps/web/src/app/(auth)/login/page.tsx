"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Server, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ username: "", password: "" })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push("/dashboard")
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">

      {/* ── Sol: Form ── */}
      <div className="flex flex-col gap-4 p-6 md:p-10">

        {/* Logo */}
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-semibold text-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Server className="size-4" />
            </div>
            <span>PusulaHub</span>
          </a>
        </div>

        {/* Form */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Yönetim Paneline Giriş</h1>
                <p className="text-balance text-sm text-muted-foreground">
                  Sunucu yönetim paneline erişmek için giriş yapın
                </p>
              </div>

              <div className="grid gap-5">

                {/* Kullanıcı Adı */}
                <div className="grid gap-2">
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="admin"
                    autoComplete="username"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </div>

                {/* Şifre */}
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Şifre</Label>
                    <a
                      href="#"
                      className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors"
                    >
                      Şifremi Unuttum
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  Giriş Yap
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Erişim sorununuz için sistem yöneticinizle iletişime geçin.
              </p>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Pusula Yazılım. Tüm hakları saklıdır.
        </p>
      </div>

      {/* ── Sağ: Görsel ── */}
      <div className="relative hidden bg-muted lg:block">
        <img
          src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1400&q=85&auto=format&fit=crop"
          alt="Sunucu odası"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>

    </div>
  )
}
