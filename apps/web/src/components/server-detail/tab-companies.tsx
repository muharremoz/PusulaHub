"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, UserCheck, UserX, Key, Building2, Users, MoreVertical, ChevronUp, ChevronDown, ChevronsUpDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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

type SortKey = "firmaId" | "firmaName" | "userCount";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { DetailCompany } from "@/lib/mock-server-detail";

interface Props {
  companies: DetailCompany[];
}

type ResetTarget = { username: string } | null;

export function TabCompanies({ companies }: Props) {
  const [selectedCompany, setSelectedCompany] = useState<DetailCompany | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("firmaName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [resetTarget, setResetTarget] = useState<ResetTarget>(null);
  const [toggleTarget, setToggleTarget] = useState<{ username: string; status: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleResetClose = () => {
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPw(false);
    setShowConfirm(false);
  };

  const canSave = newPassword.length >= 6 && newPassword === confirmPassword;

  const generatePassword = () => {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const symbols = "!@#$%&*+-?";
    const all = upper + lower + digits + symbols;
    const rand = (str: string) => str[Math.floor(Math.random() * str.length)];
    const base = [rand(upper), rand(lower), rand(digits), rand(symbols)];
    for (let i = 0; i < 8; i++) base.push(rand(all));
    const pw = base.sort(() => Math.random() - 0.5).join("");
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowPw(true);
    setShowConfirm(true);
  };

  const totalUsers = companies.reduce((acc, c) => acc + c.userCount, 0);
  const busiestCompany = companies.reduce((prev, curr) =>
    curr.userCount > prev.userCount ? curr : prev
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...companies].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "userCount") return (a.userCount - b.userCount) * mul;
    return a[sortKey].localeCompare(b[sortKey]) * mul;
  });

  return (
    <>
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          { label: "Toplam Firma", value: companies.length, icon: Building2 },
          { label: "Toplam Kullanıcı", value: totalUsers, icon: Users },
          { label: "En Yoğun Firma", value: busiestCompany.firmaName, sub: `${busiestCompany.userCount} kullanıcı`, icon: Building2, small: true },
        ].map(({ label, value, sub, icon: Icon, small }) => (
          <div
            key={label}
            className="rounded-[8px] p-2 pb-0"
            style={{ backgroundColor: "#F4F2F0" }}
          >
            <div
              className="rounded-[4px] px-3 py-3"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  {label}
                </span>
              </div>
              <span className={cn("font-semibold", small ? "text-[13px] truncate block" : "text-2xl")}>
                {value}
              </span>
              {sub && (
                <span className="text-[10px] text-muted-foreground mt-0.5">{sub}</span>
              )}
            </div>
            <div className="h-2" />
          </div>
        ))}
      </div>

      {/* Search + list */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[80px_1fr_100px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <SortHeader label="Firma ID"  sortKey="firmaId"   active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Firma Adı" sortKey="firmaName" active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Kullanıcı" sortKey="userCount" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {sorted.map((company) => (
              <div
                key={company.firmaId}
                className="grid grid-cols-[80px_1fr_100px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">
                  {company.firmaId}
                </span>
                <span className="text-[11px] font-medium truncate">{company.firmaName}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {company.userCount} kullanıcı
                </span>
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Firmayı Kaldır</DropdownMenuItem>
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

          {/* Başlık */}
          <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-sm font-semibold">{selectedCompany?.firmaName}</SheetTitle>
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium shrink-0">
                {selectedCompany?.firmaId}
              </span>
            </div>
            <SheetDescription className="sr-only">{selectedCompany?.firmaName}</SheetDescription>
          </SheetHeader>

          {/* İçerik */}
          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcılar</p>
                  <span className="text-[10px] text-muted-foreground">{selectedCompany?.userCount} kullanıcı</span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_70px_28px] gap-3 px-3 py-2 bg-muted/20 border-b border-border/40 items-center">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcı Adı</span>
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Ad Soyad</span>
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                  <span />
                </div>

                <div className="divide-y divide-border/40">
                  {selectedCompany?.users.map((user) => (
                    <div
                      key={user.username}
                      className="grid grid-cols-[1fr_1fr_70px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                    >
                      <span className="text-[11px] font-mono truncate">{user.username}</span>
                      <span className="text-[11px] truncate">{user.fullName}</span>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 rounded-full shrink-0",
                            user.status === "active" ? "bg-emerald-500" : "bg-red-400"
                          )}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {user.status === "active" ? "Aktif" : "Pasif"}
                        </span>
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
                            onClick={() => {
                              navigator.clipboard.writeText(user.password);
                              toast.success("Şifre kopyalandı", { description: user.username });
                            }}
                          >
                            <Copy className="size-3.5 mr-2" />
                            Şifreyi Kopyala
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer"
                            onClick={() => setResetTarget({ username: user.username })}
                          >
                            <Key className="size-3.5 mr-2" />
                            Şifre Sıfırla
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs cursor-pointer text-destructive"
                            onClick={() => setToggleTarget({ username: user.username, status: user.status })}
                          >
                            {user.status === "active" ? (
                              <><UserX className="size-3.5 mr-2" />Devre Dışı Bırak</>
                            ) : (
                              <><UserCheck className="size-3.5 mr-2" />Etkinleştir</>
                            )}
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

      {/* Şifre Sıfırla Modal */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && handleResetClose()}>
        <DialogContent className="rounded-[8px] p-0 gap-0 max-w-[400px]">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-sm font-semibold">Şifre Sıfırla</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{resetTarget?.username}</span> kullanıcısı için yeni şifre belirleyin.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-3">
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Yeni Şifre</p>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Key className="size-3" />
                  Şifre Üret
                </button>
              </div>
              <div className="p-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium">Şifre</Label>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      placeholder="En az 6 karakter"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="rounded-[5px] text-[11px] h-8 pr-16 font-mono"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      {newPassword && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(newPassword);
                            toast.success("Şifre kopyalandı");
                          }}
                          className="flex items-center justify-center size-6 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="flex items-center justify-center size-6 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium">Şifre Tekrar</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Şifreyi tekrar girin"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={cn(
                        "rounded-[5px] text-[11px] h-8 pr-8",
                        confirmPassword && confirmPassword !== newPassword && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-[10px] text-destructive">Şifreler eşleşmiyor.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
            <button
              onClick={handleResetClose}
              className="h-8 px-3 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors"
            >
              İptal
            </button>
            <button
              disabled={!canSave}
              onClick={() => {
                toast.success("Şifre güncellendi", { description: resetTarget?.username });
                handleResetClose();
              }}
              className="h-8 px-3 rounded-[5px] text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Kaydet
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Devre Dışı / Etkinleştir AlertDialog */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent className="rounded-[8px] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              {toggleTarget?.status === "active" ? "Kullanıcıyı Devre Dışı Bırak" : "Kullanıcıyı Etkinleştir"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{toggleTarget?.username}</span>{" "}
              {toggleTarget?.status === "active"
                ? "kullanıcısı devre dışı bırakılacak. Bu işlemi onaylıyor musunuz?"
                : "kullanıcısı etkinleştirilecek. Bu işlemi onaylıyor musunuz?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 px-3 rounded-[5px] text-[11px]">
              İptal
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-8 px-3 rounded-[5px] text-[11px]",
                toggleTarget?.status === "active"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              onClick={() => {
                const isActive = toggleTarget?.status === "active";
                toast.success(
                  isActive ? "Kullanıcı devre dışı bırakıldı" : "Kullanıcı etkinleştirildi",
                  { description: toggleTarget?.username }
                );
                setToggleTarget(null);
              }}
            >
              {toggleTarget?.status === "active" ? "Devre Dışı Bırak" : "Etkinleştir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
