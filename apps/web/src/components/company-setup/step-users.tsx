"use client"

import { Fragment, useState } from "react"
import { WizardUser, ExistingAdUser } from "@/lib/setup-mock-data"
import { Plus, Trash2, Eye, EyeOff, RefreshCw, X, AlertTriangle, Loader2, Copy, Users as UsersIcon, ShieldCheck, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { adKullaniciAdiHatasi, onekSonrasiMax } from "@/lib/ad-kullanici-adi"

interface Props {
  users: WizardUser[]
  firmaId: string
  userLimit: number
  existingUsers: ExistingAdUser[]
  existingUsersLoading?: boolean
  existingUsersError?: string | null
  onAdd: () => void
  onRemove: (id: number) => void
  /** `adet` kopya; `dolu` = kullanılmış kullanıcı adları (önek hariç, küçük harf) */
  onCopy: (id: number, adet: number, dolu: Set<string>) => void
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
  return { ...levels[Math.min(score, levels.length - 1)], hasUpper, hasLower, hasDigit, hasSpecial, lengthOk, adOk, categories }
}

/** AD şifre kuralını karşılıyor mu? */
export function meetsAdComplexity(p: string) {
  return getStrength(p).adOk
}

export function StepUsers({
  users, firmaId, userLimit, existingUsers,
  existingUsersLoading, existingUsersError,
  onAdd, onRemove, onCopy,
  onUpdateUsername, onUpdateDisplayName, onUpdateEmail, onUpdatePhone,
  onUpdatePassword, onTogglePassword, onGeneratePassword,
}: Props) {
  const [showExisting, setShowExisting] = useState(false)
  const activeExisting = existingUsers.filter((u) => !u.isDisabled).length
  const limitReached = userLimit > 0 && activeExisting + users.length >= userLimit
  /** Kalan kullanıcı hakkı — limit yoksa sınırsız */
  const kalanHak = userLimit > 0 ? Math.max(0, userLimit - activeExisting - users.length) : Infinity
  const [kopyaAdet, setKopyaAdet] = useState<Record<number, string>>({})

  const kopyala = (id: number) => {
    const istenen = Math.max(1, Number.parseInt(kopyaAdet[id] ?? "1", 10) || 1)
    const adet = Math.min(istenen, kalanHak)
    if (adet < 1) { toast.error("Kullanıcı hakkı dolu", { description: `${userLimit} kullanıcı hakkının tamamı kullanılıyor.` }); return }
    const onek = `${firmaId}.`.toLowerCase()
    const dolu = new Set(existingUsers.map((u) => {
      const ad = u.username.trim().toLowerCase()
      return ad.startsWith(onek) ? ad.slice(onek.length) : ad
    }))
    onCopy(id, adet, dolu)
    if (adet < istenen) toast.warning(`${adet} kopya eklendi`, { description: `Kullanıcı hakkı ${userLimit}; ${istenen} kopyanın hepsine yer yok.` })
  }

  const adHatasi = (username: string) =>
    username.trim() ? adKullaniciAdiHatasi(`${firmaId}.${username.trim()}`) : null

  const kullanilan = activeExisting + users.length
  const hakPct = userLimit > 0 ? Math.min(100, Math.round((kullanilan / userLimit) * 100)) : 0

  return (
    <div className="space-y-4">

      {/* Üst şerit: kullanıcı hakkı göstergesi + mevcut kullanıcılar */}
      <div className="flex items-center justify-between gap-4 rounded-[8px] bg-[var(--section-bg)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <UsersIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              {users.length} yeni kullanıcı
              {activeExisting > 0 && <span className="font-normal text-muted-foreground"> · {activeExisting} mevcut</span>}
            </p>
            {userLimit > 0 ? (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", limitReached ? "bg-red-500" : hakPct > 80 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${hakPct}%` }}
                  />
                </div>
                <span className={cn("text-[11px] tabular-nums", limitReached ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  {kullanilan} / {userLimit} kullanıcı hakkı{limitReached ? " · dolu" : ""}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Kullanıcı hakkı sınırı yok</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowExisting(!showExisting)}
          disabled={existingUsersLoading}
          className="shrink-0 gap-1.5"
        >
          {existingUsersLoading
            ? <><Loader2 className="size-3.5 animate-spin" /> Yükleniyor</>
            : <>Mevcut Kullanıcılar ({existingUsers.length})</>}
        </Button>
      </div>

      {/* Mevcut kullanıcılar — hata */}
      {existingUsersError && (
        <div className="flex items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {existingUsersError}
        </div>
      )}

      {/* Mevcut kullanıcılar listesi */}
      {showExisting && (
        <div className="overflow-hidden rounded-[8px] border bg-card">
          <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
            <span className="text-[12px] font-medium">AD&apos;de kayıtlı kullanıcılar</span>
            <button onClick={() => setShowExisting(false)} className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="max-h-48 divide-y overflow-y-auto">
            {existingUsersLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px] items-center gap-3 px-3 py-2">
                  <Skeleton className="h-3 w-24 rounded-[5px]" />
                  <Skeleton className="h-3 w-32 rounded-[5px]" />
                  <Skeleton className="ml-auto h-3 w-14 rounded-[5px]" />
                </div>
              ))
            ) : existingUsers.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">Bu firma için AD&apos;de henüz kullanıcı yok.</p>
            ) : existingUsers.map((u) => (
              <div key={u.username} className={cn("grid grid-cols-[1fr_1fr_80px] items-center gap-3 px-3 py-1.5", u.isDisabled && "opacity-40")}>
                <span className="text-[13px] font-medium">{u.username}</span>
                <span className="truncate text-[12px] text-muted-foreground">{u.displayName}</span>
                <span className="text-right text-[11px] text-muted-foreground">
                  {u.isDisabled
                    ? <span className="text-red-600 dark:text-red-400">Pasif</span>
                    : u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("tr-TR") : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kullanıcılar — tek tablo, her kullanıcı bir satır (liste standardı: dış panel + kart) */}
      <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="overflow-hidden rounded-t-[10px] border-t bg-card shadow-[0_-2px_6px_-4px_rgba(15,31,27,0.10)]">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[13px]">
              {/* Sabit sütun genişlikleri — tablo kartın içine sığar, yatay kaydırma olmaz */}
              <colgroup>
                <col className="w-10" />
                <col className="w-[22%]" />
                <col className="w-[17%]" />
                <col className="w-[20%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[104px]" />
              </colgroup>
              <thead>
                <tr className="border-b text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                  <th className="px-2 py-2 text-left font-medium">Kullanıcı Adı <span className="text-primary">*</span></th>
                  <th className="px-2 py-2 text-left font-medium">Ad Soyad</th>
                  <th className="px-2 py-2 text-left font-medium">Şifre <span className="text-primary">*</span></th>
                  <th className="px-2 py-2 text-left font-medium">E-posta</th>
                  <th className="px-2 py-2 text-left font-medium">Telefon</th>
                  <th className="px-3 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => {
                  const str = user.password ? getStrength(user.password) : null
                  const hata = adHatasi(user.username)
                  const sifreHata = !!str && !str.adOk
                  // Satır içi alan: kenarlık yalnız üzerine gelince/odakta belirir, tablo sakin kalır
                  const alan = "h-8 rounded-[5px] border border-transparent bg-transparent transition-colors hover:border-input focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
                  return (
                    <Fragment key={user.id}>
                      <tr className={cn("group border-b last:border-b-0", (hata || sifreHata) && "border-b-0")}>
                        <td className="px-3 py-1.5 align-middle">
                          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">{idx + 1}</span>
                        </td>

                        {/* Kullanıcı adı — önek + karakter sayacı */}
                        <td className="px-2 py-1.5">
                          <div className={cn("flex items-center overflow-hidden", alan, hata && "border-red-500/60 hover:border-red-500/60")}>
                            {firmaId && <span className="shrink-0 pl-2.5 text-muted-foreground">{firmaId}.</span>}
                            <input
                              type="text"
                              value={user.username}
                              onChange={(e) => onUpdateUsername(user.id, e.target.value)}
                              placeholder="mehmetsener1"
                              className="min-w-0 flex-1 bg-transparent pl-0.5 pr-2 font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                            />
                            {firmaId && user.username && (
                              <span className={cn(
                                "shrink-0 pr-2 text-[11px] tabular-nums",
                                user.username.trim().length > onekSonrasiMax(firmaId) ? "text-red-600 dark:text-red-400" : "text-muted-foreground/70",
                              )}>
                                {user.username.trim().length}/{onekSonrasiMax(firmaId)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-2 py-1.5">
                          <div className={alan}>
                            <input
                              value={user.displayName}
                              onChange={(e) => onUpdateDisplayName(user.id, e.target.value)}
                              placeholder="MEHMET SENER"
                              className="h-full w-full bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/60"
                            />
                          </div>
                        </td>

                        {/* Şifre — kalkan + göster + yeni üret aynı kutuda */}
                        <td className="px-2 py-1.5">
                          <div className={cn("flex items-center", alan, sifreHata && "border-red-500/60 hover:border-red-500/60")}>
                            <input
                              type={user.showPassword ? "text" : "password"}
                              value={user.password}
                              onChange={(e) => onUpdatePassword(user.id, e.target.value)}
                              placeholder="••••••••"
                              className="min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/60"
                            />
                            {str && (
                              <span title={str.adOk ? "AD şifre kuralına uygun" : "AD şifre kuralına uymuyor"} className="flex shrink-0 px-0.5">
                                {str.adOk
                                  ? <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                  : <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />}
                              </span>
                            )}
                            <button type="button" onClick={() => onTogglePassword(user.id)} title={user.showPassword ? "Gizle" : "Göster"}
                              className="flex h-full shrink-0 items-center px-1.5 text-muted-foreground hover:text-foreground">
                              {user.showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                            <button type="button" onClick={() => onGeneratePassword(user.id)} title="Yeni şifre oluştur"
                              className="flex h-full shrink-0 items-center pl-1 pr-2 text-muted-foreground hover:text-foreground">
                              <RefreshCw className="size-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="px-2 py-1.5">
                          <div className={alan}>
                            <input type="email" value={user.email} onChange={(e) => onUpdateEmail(user.id, e.target.value)} placeholder="kullanici@sirket.com"
                              className="h-full w-full bg-transparent px-2.5 outline-none placeholder:text-muted-foreground/60" />
                          </div>
                        </td>

                        <td className="px-2 py-1.5">
                          <div className={alan}>
                            <input type="tel" value={user.phone} onChange={(e) => onUpdatePhone(user.id, e.target.value)} placeholder="05xx xxx xx xx"
                              className="h-full w-full bg-transparent px-2.5 tabular-nums outline-none placeholder:text-muted-foreground/60" />
                          </div>
                        </td>

                        {/* İşlem: kopya sayısı + kopyala, sil */}
                        <td className="py-1.5 pl-1 pr-2">
                          <div className="flex items-center justify-end gap-0.5">
                            {user.username.trim() && !limitReached && (
                              <div className="flex items-center overflow-hidden rounded-[5px] border">
                                <input
                                  type="number"
                                  min={1}
                                  max={Number.isFinite(kalanHak) ? kalanHak : undefined}
                                  value={kopyaAdet[user.id] ?? "1"}
                                  onChange={(e) => setKopyaAdet((k) => ({ ...k, [user.id]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === "Enter") kopyala(user.id) }}
                                  aria-label="Kopya sayısı"
                                  className="h-7 w-8 bg-background text-center text-[12px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button onClick={() => kopyala(user.id)} title="Bu kullanıcıyı çoğalt (numara artar)"
                                  className="flex h-7 items-center border-l px-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                                  <Copy className="size-3.5" />
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => onRemove(user.id)}
                              disabled={users.length <= 1}
                              title="Kullanıcıyı kaldır"
                              className="flex size-7 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Satır altı uyarı — yalnız hata varsa */}
                      {(hata || sifreHata) && (
                        <tr className="border-b last:border-b-0">
                          <td />
                          <td colSpan={6} className="px-2 pb-2">
                            <p className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                              <AlertTriangle className="size-3 shrink-0" />
                              {hata ?? `AD şifre kuralı: en az 7 karakter; büyük/küçük harf, rakam, özel karakterden en az 3'ü (${str?.categories}/3)`}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tablo altı: ekle / hak doldu */}
          <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2.5">
            {limitReached ? (
              <p className="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                Kullanıcı hakkı doldu ({userLimit}). Daha fazla kullanıcı için lisans artırılmalı.
              </p>
            ) : (
              <>
                <Button size="sm" onClick={onAdd} className="gap-1.5">
                  <Plus className="size-3.5" />
                  Kullanıcı Ekle
                </Button>
                {Number.isFinite(kalanHak) && (
                  <span className={cn(
                    "inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium tabular-nums",
                    kalanHak <= 1 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  )}>
                    {kalanHak} hak kaldı
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
