"use client"

import { useState, useTransition, useRef, useEffect, Suspense } from "react"
import { signIn }    from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Eye, EyeOff, Server, AlertCircle, ShieldCheck,
  ChevronLeft, KeyRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Label }  from "@/components/ui/label"
import { cn }     from "@/lib/utils"

type Step = "password" | "otp"

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/dashboard"

  // Adım 1: şifre
  const [username,  setUsername]  = useState("")
  const [password,  setPassword]  = useState("")
  const [showPass,  setShowPass]  = useState(false)

  // Adım 2: OTP
  const [step,      setStep]      = useState<Step>("password")
  const [tempToken, setTempToken] = useState("")
  const [otpDigits, setOtpDigits] = useState(["","","","","",""])
  const otpRefs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (step === "otp") otpRefs[0].current?.focus()
  }, [step])

  /* ── Adım 1: Şifre doğrulama ── */
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setError("Kullanıcı adı ve şifre gerekli"); return }
    setError(null)

    startTransition(async () => {
      try {
        const r = await fetch("/api/auth/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        })
        const d = await r.json()

        if (!r.ok) { setError(d.error ?? "Hatalı kullanıcı adı veya şifre"); return }

        if (d.requires2FA) {
          setTempToken(d.tempToken)
          setStep("otp")
        } else {
          const res = await signIn("credentials", {
            username: username.trim(), password, redirect: false,
          })
          if (res?.error) { setError("Giriş başarısız"); return }
          router.push(callbackUrl); router.refresh()
        }
      } catch { setError("Sunucu hatası") }
    })
  }

  /* ── Adım 2: OTP doğrulama ── */
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = otpDigits.join("")
    if (code.length < 6) { setError("6 haneli kodu girin"); return }
    setError(null)

    startTransition(async () => {
      const res = await signIn("credentials", {
        tempToken, otpCode: code, redirect: false,
      })
      if (res?.error) {
        setError("Geçersiz kod. Tekrar deneyin.")
        setOtpDigits(["","","","","",""])
        otpRefs[0].current?.focus()
        return
      }
      router.push(callbackUrl); router.refresh()
    })
  }

  /* ── OTP input handler ── */
  function handleOtpChange(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1)
    const next  = [...otpDigits]; next[i] = digit
    setOtpDigits(next)
    if (digit && i < 5) otpRefs[i + 1].current?.focus()
  }
  function handleOtpKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) otpRefs[i - 1].current?.focus()
    if (e.key === "ArrowLeft"  && i > 0) otpRefs[i - 1].current?.focus()
    if (e.key === "ArrowRight" && i < 5) otpRefs[i + 1].current?.focus()
  }
  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("")
    const next   = [...otpDigits]
    digits.forEach((d, i) => { next[i] = d })
    setOtpDigits(next)
    otpRefs[Math.min(digits.length, 5)].current?.focus()
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

        {/* Form alanı */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">

            {/* Adım göstergesi (sadece OTP adımında) */}
            {step === "otp" && (
              <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => { setStep("password"); setOtpDigits(["","","","","",""]); setError(null) }}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="size-3.5" />Geri
                </button>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1 text-foreground font-medium">
                  <ShieldCheck className="size-3.5 text-primary" />İki Faktörlü Doğrulama
                </span>
              </div>
            )}

            {/* Hata mesajı */}
            {error && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-destructive/10 text-destructive text-[13px]">
                <AlertCircle className="size-4 shrink-0" />{error}
              </div>
            )}

            {/* ── Adım 1: Kullanıcı adı + şifre ── */}
            {step === "password" && (
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Yönetim Paneline Giriş</h1>
                  <p className="text-balance text-sm text-muted-foreground">
                    Sunucu yönetim paneline erişmek için giriş yapın
                  </p>
                </div>

                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="username">Kullanıcı Adı</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="admin"
                      autoComplete="username"
                      autoFocus
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password">Şifre</Label>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPass ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" disabled={isPending} className="w-full">
                    {isPending ? "Kontrol ediliyor..." : "Giriş Yap"}
                  </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  Erişim sorununuz için sistem yöneticinizle iletişime geçin.
                </p>
              </form>
            )}

            {/* ── Adım 2: OTP ── */}
            {step === "otp" && (
              <form onSubmit={handleOtpSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                    <KeyRound className="size-6 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold">İki Faktörlü Doğrulama</h1>
                  <p className="text-balance text-sm text-muted-foreground">
                    Authenticator uygulamanızdaki 6 haneli kodu girin
                  </p>
                </div>

                {/* 6 haneli OTP kutuları */}
                <div className="flex items-center justify-center gap-2" onPaste={handleOtpPaste}>
                  {otpDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={otpRefs[i]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      className={cn(
                        "size-12 text-center text-[20px] font-bold rounded-lg border-2 outline-none transition-all",
                        d ? "border-primary bg-primary/5" : "border-border",
                        "focus:border-primary focus:ring-2 focus:ring-primary/20"
                      )}
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={isPending || otpDigits.join("").length < 6}
                  className="w-full"
                >
                  {isPending ? "Doğrulanıyor..." : "Giriş Yap"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Kodu göremiyorsanız uygulamanızın saatinin doğru olduğundan emin olun.
                </p>
              </form>
            )}
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
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Badge */}
        <div className="absolute bottom-8 left-8 right-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Server className="size-4 text-white" />
              </div>
              <span className="text-white font-semibold text-sm">PusulaHub</span>
            </div>
            <p className="text-white/80 text-xs leading-relaxed">
              Sunucu yönetimi, izleme ve otomasyon için merkezi yönetim platformu.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
