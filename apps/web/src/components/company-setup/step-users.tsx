"use client"

import { useState } from "react"
import { WizardUser, ExistingAdUser } from "@/lib/setup-mock-data"
import { Plus, Trash2, Eye, EyeOff, RefreshCw, X } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface Props {
  users: WizardUser[]
  firmaId: string
  userLimit: number
  existingUsers: ExistingAdUser[]
  onAdd: () => void
  onRemove: (id: number) => void
  onUpdateUsername: (id: number, val: string) => void
  onUpdateDisplayName: (id: number, val: string) => void
  onUpdatePassword: (id: number, val: string) => void
  onTogglePassword: (id: number) => void
  onGeneratePassword: (id: number) => void
}

function getStrength(p: string) {
  const hasUpper = /[A-Z]/.test(p)
  const hasLower = /[a-z]/.test(p)
  const hasDigit = /[0-9]/.test(p)
  const hasSpecial = /[^A-Za-z0-9]/.test(p)
  const lengthOk = p.length >= 8
  const score = [hasUpper, hasLower, hasDigit, hasSpecial, lengthOk].filter(Boolean).length
  const levels = [
    { label: "Zayıf",  color: "bg-red-500",     text: "text-red-500",     pct: 20 },
    { label: "Zayıf",  color: "bg-red-500",     text: "text-red-500",     pct: 25 },
    { label: "Orta",   color: "bg-amber-500",   text: "text-amber-500",   pct: 50 },
    { label: "İyi",    color: "bg-blue-500",    text: "text-blue-500",    pct: 75 },
    { label: "Güçlü",  color: "bg-emerald-500", text: "text-emerald-500", pct: 100 },
  ]
  return { ...levels[score], hasUpper, hasLower, hasDigit, hasSpecial, lengthOk }
}

export function StepUsers({
  users, firmaId, userLimit, existingUsers,
  onAdd, onRemove,
  onUpdateUsername, onUpdateDisplayName, onUpdatePassword,
  onTogglePassword, onGeneratePassword,
}: Props) {
  const [showExisting, setShowExisting] = useState(false)
  const activeExisting = existingUsers.filter((u) => !u.isDisabled).length
  const limitReached = userLimit > 0 && activeExisting + users.length >= userLimit

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
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground"
        >
          Mevcut Kullanıcılar ({existingUsers.length})
        </button>
      </div>

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
            {existingUsers.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">Henüz kullanıcı yok.</p>
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
                  <div className="flex items-center rounded-[5px] border-2 border-border bg-background focus-within:border-foreground/60 transition-colors">
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

              {/* Şifre güç barı */}
              {str && (
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-300", str.color)}
                      style={{ width: `${str.pct}%` }}
                    />
                  </div>
                  <span className={cn("text-[10px] font-medium shrink-0", str.text)}>{str.label}</span>
                  <div className="flex gap-1">
                    {[
                      { ok: str.hasUpper, label: "A-Z" },
                      { ok: str.hasLower, label: "a-z" },
                      { ok: str.hasDigit, label: "0-9" },
                      { ok: str.hasSpecial, label: "!@#" },
                      { ok: str.lengthOk,  label: "8+" },
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
    </div>
  )
}
