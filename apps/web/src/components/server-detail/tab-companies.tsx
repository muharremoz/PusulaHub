"use client";

import { useState } from "react";
import { Building2, Users, MoreVertical, ChevronUp, ChevronDown, ChevronsUpDown, UserCheck, UserX, KeyRound, Eye, EyeOff, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { AgentReport } from "@/lib/agent-types";

type Company = NonNullable<NonNullable<AgentReport["ad"]>["companies"]>[number];
type CompanyUser = Company["users"][number];

type SortKey = "firmaNo" | "userCount";
type SortDir = "asc" | "desc";

function SortHeader({ label, sortKey, active, dir, onSort }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className="shrink-0">
        {isActive
          ? dir === "asc"
            ? <ChevronUp className="size-3" />
            : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />
        }
      </span>
    </button>
  );
}

interface Props {
  companies: Company[];
  firmaMap: Record<string, string>;
}

export function TabCompanies({ companies, firmaMap }: Props) {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("firmaNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [toggleTarget, setToggleTarget] = useState<{ username: string; enabled: boolean } | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{ username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  function openPasswordDialog(username: string) {
    setPasswordTarget({ username });
    setNewPassword("");
    setNewPasswordConfirm("");
    setShowPassword(false);
    setPasswordCopied(false);
  }

  function generateStrongPassword() {
    const lower = "abcdefghijkmnopqrstuvwxyz";       // l çıkarıldı
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";        // I, O çıkarıldı
    const digits = "23456789";                        // 0, 1 çıkarıldı
    const symbols = "!@#$%&*?+-";
    const all = lower + upper + digits + symbols;
    const length = 14;

    // Her kategoriden en az 1 karakter garantisi
    const pickRandom = (set: string) => set[Math.floor(Math.random() * set.length)];
    const chars = [
      pickRandom(lower),
      pickRandom(upper),
      pickRandom(digits),
      pickRandom(symbols),
    ];
    for (let i = chars.length; i < length; i++) {
      chars.push(pickRandom(all));
    }
    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const pwd = chars.join("");
    setNewPassword(pwd);
    setNewPasswordConfirm(pwd);
    setShowPassword(true);
    setPasswordCopied(false);
  }

  async function copyPassword() {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  async function handleChangePassword() {
    if (!passwordTarget) return;
    if (newPassword.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }
    setPasswordSaving(true);
    try {
      // TODO: backend endpoint eklenince burası gerçek çağrıya dönüşecek
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Şifre değiştirildi", {
        description: `${passwordTarget.username} için yeni şifre kaydedildi.`,
      });
      setPasswordTarget(null);
    } catch {
      toast.error("Şifre değiştirilemedi");
    } finally {
      setPasswordSaving(false);
    }
  }

  const firmaName = (firmaNo: string) => firmaMap[firmaNo] ?? firmaNo;

  const totalUsers = companies.reduce((acc, c) => acc + c.userCount, 0);
  const busiestCompany = companies.length > 0
    ? companies.reduce((prev, curr) => curr.userCount > prev.userCount ? curr : prev)
    : null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...companies].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "userCount") return (a.userCount - b.userCount) * mul;
    return a.firmaNo.localeCompare(b.firmaNo) * mul;
  });

  if (companies.length === 0) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] px-6 py-10 flex flex-col items-center gap-2"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <Building2 className="size-8 text-muted-foreground/30" />
          <p className="text-[12px] font-medium text-muted-foreground">AD firma verisi bulunamadı</p>
          <p className="text-[11px] text-muted-foreground/70 text-center max-w-xs">
            Bu sunucuda Active Directory rolü aktif değil veya henüz veri gelmedi.
          </p>
        </div>
        <div className="h-2" />
      </div>
    );
  }

  return (
    <>
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          { label: "Toplam Firma", value: companies.length, icon: Building2 },
          { label: "Toplam Kullanıcı", value: totalUsers, icon: Users },
          {
            label: "En Yoğun Firma",
            value: busiestCompany ? (firmaMap[busiestCompany.firmaNo] ?? busiestCompany.firmaNo) : "—",
            sub: busiestCompany ? `${busiestCompany.userCount} kullanıcı` : undefined,
            icon: Building2,
            small: true,
          },
        ].map(({ label, value, sub, icon: Icon, small }) => (
          <div key={label} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px] px-3 py-3"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{label}</span>
              </div>
              <span className={cn("font-semibold", small ? "text-[13px] truncate block" : "text-2xl")}>{value}</span>
              {sub && <span className="text-[10px] text-muted-foreground mt-0.5 block">{sub}</span>}
            </div>
            <div className="h-2" />
          </div>
        ))}
      </div>

      {/* List */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[80px_1fr_100px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <SortHeader label="Firma No"  sortKey="firmaNo"   active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Firma Adı</span>
            <SortHeader label="Kullanıcı" sortKey="userCount" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {sorted.map((company) => (
              <div
                key={company.firmaNo}
                className="grid grid-cols-[80px_1fr_100px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">{company.firmaNo}</span>
                <span className="text-[11px] font-medium truncate">{firmaName(company.firmaNo)}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{company.userCount} kullanıcı</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[6px]">
                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => setSelectedCompany(company)}>
                      Kullanıcıları Görüntüle
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Building2 className="size-3" />
          <span>{sorted.length} firma listeleniyor</span>
        </div>
      </div>

      {/* Company detail sheet */}
      <Sheet open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-sm font-semibold">
                {selectedCompany ? (firmaMap[selectedCompany.firmaNo] ?? selectedCompany.firmaNo) : ""}
              </SheetTitle>
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium shrink-0">
                {selectedCompany?.firmaNo}
              </span>
              <span className="text-[10px] text-muted-foreground">{selectedCompany?.userCount} kullanıcı</span>
            </div>
            <SheetDescription className="sr-only">Firma kullanıcıları</SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcılar</p>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_130px_60px_28px] gap-3 px-3 py-2 bg-muted/20 border-b border-border/40 items-center">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcı Adı</span>
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Ad Soyad</span>
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Güvenlik Grubu</span>
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                  <span />
                </div>

                <div className="divide-y divide-border/40">
                  {selectedCompany?.users.map((user) => (
                    <div key={user.username} className="grid grid-cols-[1fr_1fr_130px_60px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center">
                      <span className="text-[11px] font-mono truncate">{user.username}</span>
                      <span className="text-[11px] truncate">{user.displayName}</span>

                      <div className="flex items-center gap-1 flex-wrap min-w-0">
                        {user.groups && user.groups.length > 0 ? (
                          user.groups.map((g) => (
                            <span
                              key={g}
                              className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[3px] font-medium text-muted-foreground truncate max-w-full"
                              title={g}
                            >
                              {g}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50">—</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full shrink-0", user.enabled ? "bg-emerald-500" : "bg-red-400")} />
                        <span className="text-[10px] text-muted-foreground">{user.enabled ? "Aktif" : "Pasif"}</span>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-[6px]">
                          <DropdownMenuItem
                            className="text-xs cursor-pointer"
                            onClick={() => openPasswordDialog(user.username)}
                          >
                            <KeyRound className="size-3.5 mr-2" />
                            Şifre Değiştir
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs cursor-pointer text-destructive"
                            onClick={() => setToggleTarget({ username: user.username, enabled: user.enabled })}
                          >
                            {user.enabled
                              ? <><UserX className="size-3.5 mr-2" />Devre Dışı Bırak</>
                              : <><UserCheck className="size-3.5 mr-2" />Etkinleştir</>
                            }
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Devre Dışı / Etkinleştir AlertDialog */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent className="rounded-[8px] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              {toggleTarget?.enabled ? "Kullanıcıyı Devre Dışı Bırak" : "Kullanıcıyı Etkinleştir"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{toggleTarget?.username}</span>{" "}
              {toggleTarget?.enabled
                ? "kullanıcısı devre dışı bırakılacak. Bu işlemi onaylıyor musunuz?"
                : "kullanıcısı etkinleştirilecek. Bu işlemi onaylıyor musunuz?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 px-3 rounded-[5px] text-[11px]">İptal</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-8 px-3 rounded-[5px] text-[11px]",
                toggleTarget?.enabled
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              onClick={() => setToggleTarget(null)}
            >
              {toggleTarget?.enabled ? "Devre Dışı Bırak" : "Etkinleştir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Şifre Değiştir Dialog */}
      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && !passwordSaving && setPasswordTarget(null)}>
        <DialogContent className="rounded-[8px] max-w-[400px] p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              Şifre Değiştir
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{passwordTarget?.username}</span>{" "}
              kullanıcısı için yeni şifre belirleyin.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-3">
            <button
              type="button"
              onClick={generateStrongPassword}
              className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <Sparkles className="size-3.5" />
              Güçlü Şifre Öner
            </button>

            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-[11px]">Yeni Şifre</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordCopied(false); }}
                  className="rounded-[5px] h-8 text-[11px] pr-14 font-mono"
                  placeholder="En az 6 karakter"
                  autoComplete="new-password"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-muted-foreground">
                  <button
                    type="button"
                    onClick={copyPassword}
                    disabled={!newPassword}
                    className="hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Şifreyi kopyala"
                  >
                    {passwordCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="hover:text-foreground"
                    title={showPassword ? "Gizle" : "Göster"}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password-confirm" className="text-[11px]">Yeni Şifre (Tekrar)</Label>
              <Input
                id="new-password-confirm"
                type={showPassword ? "text" : "password"}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="rounded-[5px] h-8 text-[11px] font-mono"
                autoComplete="new-password"
              />
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/50">
            <Button
              variant="outline"
              className="h-8 px-3 rounded-[5px] text-[11px]"
              onClick={() => setPasswordTarget(null)}
              disabled={passwordSaving}
            >
              İptal
            </Button>
            <Button
              className="h-8 px-3 rounded-[5px] text-[11px]"
              onClick={handleChangePassword}
              disabled={passwordSaving || !newPassword || !newPasswordConfirm}
            >
              {passwordSaving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
