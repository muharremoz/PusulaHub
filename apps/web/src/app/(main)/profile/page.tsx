"use client"

import { useState, useEffect } from "react"
import { useSession }          from "next-auth/react"
import {
  ShieldCheck, ShieldOff, Smartphone, CheckCircle2,
  AlertCircle, RefreshCw, User, KeyRound,
} from "lucide-react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { cn }    from "@/lib/utils"

interface TwoFAStatus { enabled: boolean; qrCode: string | null; secret: string | null }

function avatarInitials(name: string) {
  return (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"
}
function avatarColor(name: string) {
  const colors = ["#3b82f6","#8b5cf6","#ec4899","#f97316","#10b981","#06b6d4","#f59e0b"]
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const [twoFA,    setTwoFA]    = useState<TwoFAStatus | null>(null)
  const [loading2, setLoading2] = useState(true)
  const [otpInput, setOtpInput] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  // Şifre değiştirme
  const [curPass,  setCurPass]  = useState("")
  const [newPass,  setNewPass]  = useState("")
  const [newPass2, setNewPass2] = useState("")
  const [saving,   setSaving]   = useState(false)

  const name     = session?.user?.fullName ?? session?.user?.name ?? "Kullanıcı"
  const email    = session?.user?.email    ?? ""
  const role     = session?.user?.role     ?? "user"
  const initials = avatarInitials(name)
  const color    = avatarColor(name)

  useEffect(() => { load2FA() }, [])

  async function load2FA() {
    setLoading2(true)
    try {
      const r = await fetch("/api/profile/2fa")
      if (r.ok) setTwoFA(await r.json())
    } finally { setLoading2(false) }
  }

  async function enable2FA() {
    if (otpInput.trim().length < 6) { toast.error("6 haneli kodu girin"); return }
    if (!twoFA?.secret) return
    setVerifying(true)
    try {
      const r = await fetch("/api/profile/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: twoFA.secret, code: otpInput.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? "Hata"); return }
      toast.success("2FA etkinleştirildi!")
      setOtpInput(""); load2FA()
    } finally { setVerifying(false) }
  }

  async function disable2FA() {
    try {
      await fetch("/api/profile/2fa", { method: "DELETE" })
      toast.success("2FA devre dışı bırakıldı")
      setDisableOpen(false); load2FA()
    } catch { toast.error("Hata") }
  }

  async function changePassword() {
    if (!curPass || !newPass) { toast.error("Şifreler gerekli"); return }
    if (newPass !== newPass2)  { toast.error("Yeni şifreler eşleşmiyor"); return }
    if (newPass.length < 6)    { toast.error("Şifre en az 6 karakter olmalı"); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/users/${session?.user?.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPass }),
      })
      if (!r.ok) throw new Error()
      toast.success("Şifre güncellendi")
      setCurPass(""); setNewPass(""); setNewPass2("")
    } catch { toast.error("Güncelleme başarısız") } finally { setSaving(false) }
  }

  return (
    <div className="p-4 max-w-[600px] space-y-3">

      {/* Kullanıcı kartı */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="bg-white rounded-[4px] px-5 py-4 flex items-center gap-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="size-14 rounded-full flex items-center justify-center text-white text-[18px] font-bold shrink-0"
            style={{ backgroundColor: color }}>
            {initials}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">{name}</h2>
            <p className="text-[11px] text-muted-foreground">{email || "—"}</p>
            <span className={cn(
              "inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full border",
              role === "admin" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
            )}>
              {role === "admin" ? "Admin" : role === "viewer" ? "İzleyici" : "Kullanıcı"}
            </span>
          </div>
        </div>
      </div>

      {/* 2FA Bölümü */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="bg-white rounded-[4px] overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-3 bg-muted/30 border-b border-border/40 flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">İki Faktörlü Doğrulama (2FA)</span>
          </div>

          <div className="p-4">
            {loading2 ? (
              <div className="space-y-2"><Skeleton className="h-4 w-1/2 rounded-[3px]" /><Skeleton className="h-3 w-3/4 rounded-[3px]" /></div>
            ) : twoFA?.enabled ? (
              /* ── 2FA Aktif ── */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="size-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-green-700">2FA Aktif</p>
                    <p className="text-[11px] text-muted-foreground">Hesabınız iki faktörlü doğrulama ile korunuyor.</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setDisableOpen(true)}
                  className="h-8 text-[11px] rounded-[5px] gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5">
                  <ShieldOff className="size-3.5" />2FA Devre Dışı Bırak
                </Button>
              </div>
            ) : (
              /* ── 2FA Kurulum ── */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-[5px] bg-amber-50 border border-amber-200">
                  <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-medium text-amber-800">2FA Aktif Değil</p>
                    <p className="text-[11px] text-amber-700">Google Authenticator veya benzer bir uygulama ile 2FA kurabilirsiniz.</p>
                  </div>
                </div>

                {twoFA?.qrCode && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="size-4 rounded-full bg-foreground text-background text-[9px] flex items-center justify-center font-bold shrink-0">1</span>
                        Authenticator uygulamanızla QR kodu tarayın
                      </p>
                      <div className="flex justify-center p-3 rounded-[6px] border border-border/40 bg-white w-fit">
                        <img src={twoFA.qrCode} alt="2FA QR Code" className="size-[160px]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="size-4 rounded-full bg-foreground text-background text-[9px] flex items-center justify-center font-bold shrink-0">2</span>
                        Uygulamadaki 6 haneli kodu girin
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={otpInput}
                          onChange={e => setOtpInput(e.target.value.replace(/\D/g,"").slice(0,6))}
                          onKeyDown={e => e.key === "Enter" && enable2FA()}
                          placeholder="000000"
                          maxLength={6}
                          className="h-8 text-[13px] rounded-[5px] font-mono tracking-widest w-32 text-center"
                        />
                        <Button onClick={enable2FA} disabled={verifying || otpInput.length < 6}
                          className="h-8 text-[12px] rounded-[5px] gap-1.5">
                          <CheckCircle2 className="size-3.5" />
                          {verifying ? "Doğrulanıyor..." : "Etkinleştir"}
                        </Button>
                        <Button variant="outline" onClick={load2FA} className="h-8 text-[11px] rounded-[5px]" title="QR yenile">
                          <RefreshCw className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Şifre Değiştirme */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="bg-white rounded-[4px] overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-3 bg-muted/30 border-b border-border/40 flex items-center gap-2">
            <KeyRound className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Şifre Değiştir</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Yeni Şifre</Label>
              <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="En az 6 karakter" className="h-8 text-[12px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Yeni Şifre (Tekrar)</Label>
              <Input type="password" value={newPass2} onChange={e => setNewPass2(e.target.value)}
                placeholder="Şifrenizi tekrar girin" className="h-8 text-[12px] rounded-[5px]" />
            </div>
            <Button onClick={changePassword} disabled={saving} className="h-8 text-[12px] rounded-[5px]">
              {saving ? "Kaydediliyor..." : "Şifreyi Güncelle"}
            </Button>
          </div>
        </div>
      </div>

      {/* 2FA Devre Dışı Bırakma AlertDialog */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">2FA Devre Dışı Bırak</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              2FA kaldırılırsa hesabınız yalnızca şifre ile korunacak. Devam etmek istiyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={disable2FA} className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">
              Kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
