"use client"

import { useState } from "react"
import { WizardUser, ExistingAdUser } from "@/lib/setup-mock-data"
import { Plus, Trash2, Eye, EyeOff, RefreshCw, X, AlertTriangle, Loader2, FlaskConical } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { AdProvisionRunner } from "./ad-provision-runner"

interface Props {
  users: WizardUser[]
  firmaId: string
  firmaName: string
  serverId: string
  userLimit: number
  existingUsers: ExistingAdUser[]
  existingUsersLoading?: boolean
  existingUsersError?: string | null
  onAdd: () => void
  onRemove: (id: number) => void
  onUpdateUsername: (id: number, val: string) => void
  onUpdateDisplayName: (id: number, val: string) => void
  onUpdateEmail: (id: number, val: string) => void
  onUpdatePhone: (id: number, val: string) => void
  onUpdatePassword: (id: number, val: string) => void
  onTogglePassword: (id: number) => void
  onGeneratePassword: (id: number) => void
}

function getStrength(p: string) {
  const hasUpper   = /[A-Z]/.test(p)
  const hasLower   = /[a-z]/.test(p)
  const hasDigit   = /[0-9]/.test(p)
  const hasSpecial = /[^A-Za-z0-9]/.test(p)
  const lengthOk   = p.length >= 7   // AD minimum 7 karakter

  // AD karmaşıklık: en az 3 kategori (büyük/küçük/rakam/özel) + uzunluk
  const categories = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length
  const adOk       = lengthOk && categories >= 3

  const score = [hasUpper, hasLower, hasDigit, hasSpecial, lengthOk].filter(Boolean).length
  const levels = [
    { label: "Zayıf",  color: "bg-red-500",     text: "text-red-500",     pct: 20 },
    { label: "Zayıf",  color: "bg-red-500",     text: "text-red-500",     pct: 25 },
    { label: "Orta",   color: "bg-amber-500",   text: "text-amber-500",   pct: 50 },
    { label: "İyi",    color: "bg-blue-500",    text: "text-blue-500",    pct: 75 },
    { label: "Güçlü",  color: "bg-emerald-500", text: "text-emerald-500", pct: 100 },
  ]
  return { ...levels[score], hasUpper, hasLower, hasDigit, hasSpecial, lengthOk, adOk, categories }
}

/** AD şifre kuralını karşılıyor mu? */
export function meetsAdComplexity(p: string) {
  return getStrength(p).adOk
}

export function StepUsers({
  users, firmaId, firmaName, serverId, userLimit, existingUsers,
  existingUsersLoading, existingUsersError,
  onAdd, onRemove,
  onUpdateUsername, onUpdateDisplayName, onUpdateEmail, onUpdatePhone,
  onUpdatePassword, onTogglePassword, onGeneratePassword,
}: Props) {
  const [showExisting, setShowExisting] = useState(false)
  const [testRunning, setTestRunning]   = useState(false)
  // Test'i her açışta runner'ı remount etmek için artan key
  const [testKey, setTestKey]           = useState(0)
  const activeExisting = existingUsers.filter((u) => !u.isDisabled).length
  const limitReached = userLimit > 0 && activeExisting + users.length >= userLimit

  const allUsersValid = users.length > 0 &&
    users.every((u) => u.username.trim() && u.password.trim() && meetsAdComplexity(u.password))
  const canTest = allUsersValid && !!serverId && !!firmaId

  const startTest = () => {
    setTestKey((k) => k + 1)
    setTestRunning(true)
  }

  return (
    <div className="space-y-4">

      {/* Üst bilgi satırı */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {userLimit > 0 && (
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-[4px]",
              limitReached ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"
            )}>
              {activeExisting + users.length} / {userLimit} kullanıcı hakkı
            </span>
          )}
        </div>
        <button
          onClick={() => setShowExisting(!showExisting)}
          disabled={existingUsersLoading}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground disabled:opacity-50"
        >
          {existingUsersLoading ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Yükleniyor
            </>
          ) : (
            <>Mevcut Kullanıcılar ({existingUsers.length})</>
          )}
        </button>
      </div>

      {/* Mevcut kullanıcılar — hata */}
      {existingUsersError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
          <AlertTriangle className="size-3.5 shrink-0" />
          {existingUsersError}
        </div>
      )}

      {/* Mevcut kullanıcılar listesi */}
      {showExisting && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <span className="text-[11px] font-medium">AD'de Kayıtlı Kullanıcılar</span>
            <button onClick={() => setShowExisting(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border/40 max-h-48 overflow-y-auto">
            {existingUsersLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px] gap-3 items-center px-3 py-2">
                  <Skeleton className="h-3 w-24 rounded-[3px]" />
                  <Skeleton className="h-3 w-32 rounded-[3px]" />
                  <Skeleton className="h-3 w-14 rounded-[3px] ml-auto" />
                </div>
              ))
            ) : existingUsers.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                Bu firma için AD&apos;de henüz kullanıcı yok.
              </p>
            ) : existingUsers.map((u) => (
              <div key={u.username} className={cn(
                "grid grid-cols-[1fr_1fr_80px] gap-3 items-center px-3 py-2",
                u.isDisabled && "opacity-40"
              )}>
                <span className="text-[11px] font-mono font-medium">{u.username}</span>
                <span className="text-[11px] text-muted-foreground truncate">{u.displayName}</span>
                <span className="text-[10px] text-muted-foreground text-right">
                  {u.isDisabled
                    ? <span className="text-red-500">Pasif</span>
                    : u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("tr-TR") : "—"
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kullanıcı satırları */}
      <div className="rounded-[5px] border border-border overflow-hidden divide-y divide-border">
        {users.map((user, idx) => {
          const str = user.password ? getStrength(user.password) : null
          return (
            <div key={user.id} className="px-4 py-4 space-y-3">
              {/* Satır başlığı */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">
                  Kullanıcı {idx + 1}
                </span>
                {users.length > 1 && (
                  <button
                    onClick={() => onRemove(user.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Alanlar */}
              <div className="grid grid-cols-[1fr_1fr_1fr_36px] gap-3 items-end">
                {/* Kullanıcı adı */}
                <div>
                  <p className="text-[11px] font-medium text-foreground mb-1.5">Kullanıcı Adı</p>
                  <div className="flex items-center rounded-[5px] border-2 border-border bg-background overflow-hidden focus-within:border-foreground/60 transition-colors">
                    {firmaId && (
                      <span className="text-[11px] text-muted-foreground bg-muted px-2.5 py-2 border-r-2 border-border shrink-0 font-mono">
                        {firmaId}.
                      </span>
                    )}
                    <input
                      type="text"
                      value={user.username}
                      onChange={(e) => onUpdateUsername(user.id, e.target.value)}
                      placeholder="kullanici"
                      className="flex-1 px-2.5 py-2 text-xs bg-transparent outline-none min-w-0"
                    />
                  </div>
                </div>

                {/* Ad Soyad */}
                <div>
                  <p className="text-[11px] font-medium text-foreground mb-1.5">Ad Soyad</p>
                  <input
                    type="text"
                    value={user.displayName}
                    onChange={(e) => onUpdateDisplayName(user.id, e.target.value)}
                    placeholder="Adı Soyadı"
                    className="w-full px-2.5 py-2 text-xs rounded-[5px] border-2 border-border bg-background outline-none focus:border-foreground/60 transition-colors"
                  />
                </div>

                {/* Şifre */}
                <div>
                  <p className="text-[11px] font-medium text-foreground mb-1.5">Şifre</p>
                  <div className={cn(
                    "flex items-center rounded-[5px] border-2 bg-background focus-within:border-foreground/60 transition-colors",
                    user.password && !meetsAdComplexity(user.password)
                      ? "border-red-400 focus-within:border-red-500"
                      : "border-border"
                  )}>
                    <input
                      type={user.showPassword ? "text" : "password"}
                      value={user.password}
                      onChange={(e) => onUpdatePassword(user.id, e.target.value)}
                      placeholder="••••••••"
                      className="flex-1 px-2.5 py-2 text-xs bg-transparent outline-none min-w-0"
                    />
                    <button
                      onClick={() => onTogglePassword(user.id)}
                      className="px-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {user.showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Şifre oluştur */}
                <button
                  onClick={() => onGeneratePassword(user.id)}
                  title="Şifre oluştur"
                  className="h-[34px] flex items-center justify-center rounded-[5px] border-2 border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>

              {/* E-posta ve Telefon */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium text-foreground mb-1.5">E-posta</p>
                  <input
                    type="email"
                    value={user.email}
                    onChange={(e) => onUpdateEmail(user.id, e.target.value)}
                    placeholder="kullanici@sirket.com"
                    className="w-full px-2.5 py-2 text-xs rounded-[5px] border-2 border-border bg-background outline-none focus:border-foreground/60 transition-colors"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-foreground mb-1.5">Telefon</p>
                  <input
                    type="tel"
                    value={user.phone}
                    onChange={(e) => onUpdatePhone(user.id, e.target.value)}
                    placeholder="05xx xxx xx xx"
                    className="w-full px-2.5 py-2 text-xs rounded-[5px] border-2 border-border bg-background outline-none focus:border-foreground/60 transition-colors"
                  />
                </div>
              </div>

              {/* Şifre güç barı */}
              {str && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300", str.color)}
                        style={{ width: `${str.pct}%` }}
                      />
                    </div>
                    <span className={cn("text-[10px] font-medium shrink-0", str.text)}>{str.label}</span>
                    <div className="flex gap-1">
                      {[
                        { ok: str.hasUpper,   label: "A-Z" },
                        { ok: str.hasLower,   label: "a-z" },
                        { ok: str.hasDigit,   label: "0-9" },
                        { ok: str.hasSpecial, label: "!@#" },
                        { ok: str.lengthOk,   label: "7+" },
                      ].map(({ ok, label }) => (
                        <span key={label} className={cn(
                          "text-[9px] px-1 py-0.5 rounded-[3px]",
                          ok ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        )}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* AD uyarısı */}
                  {!str.adOk && (
                    <p className="text-[10px] text-red-500 flex items-center gap-1">
                      <span>⚠</span>
                      AD karmaşıklık kuralı: en az 7 karakter, büyük/küçük harf + rakam veya özel karakter ({str.categories}/3 kategori)
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Kullanıcı ekle */}
      {!limitReached && (
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[5px] border border-dashed border-border text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="size-3.5" />
          Kullanıcı Ekle
        </button>
      )}

      {/* Test paneli */}
      {testRunning && (
        <div className="rounded-[5px] border border-blue-200 bg-blue-50/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200/60 bg-blue-50">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-3.5 text-blue-700" />
              <p className="text-[11px] font-semibold text-blue-800">Test: AD Kullanıcı Oluşturma</p>
            </div>
            <button
              onClick={() => setTestRunning(false)}
              className="text-blue-700 hover:text-blue-900 transition-colors"
              title="Kapat"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="p-3">
            <AdProvisionRunner
              key={testKey}
              payload={{
                serverId,
                firmaId,
                firmaName,
                users: users.map((u) => ({
                  username:    u.username,
                  displayName: u.displayName,
                  email:       u.email,
                  phone:       u.phone,
                  password:    u.password,
                })),
              }}
            />
          </div>
        </div>
      )}

      {/* Test butonu */}
      {!testRunning && (
        <button
          onClick={startTest}
          disabled={!canTest}
          title={
            !allUsersValid
              ? "Kullanıcı adı ve şifre girilmelidir"
              : !serverId || !firmaId
              ? "Sunucu veya firma seçili değil"
              : "Bu kullanıcıları AD'ye ekle (test)"
          }
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[5px] border border-blue-200 bg-blue-50 text-[11px] text-blue-700 hover:bg-blue-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FlaskConical className="size-3.5" />
          Test Et — Bu adıma kadar olanı AD'ye uygula
        </button>
      )}
    </div>
  )
}
