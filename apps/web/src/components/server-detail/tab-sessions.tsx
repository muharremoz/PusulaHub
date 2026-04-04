"use client";

import { useState } from "react";
import { MoreVertical, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import type { AgentReport } from "@/lib/agent-types";

type AgentSession = NonNullable<AgentReport["sessions"]>[number];
type ActionType = "disconnect" | "logoff";

interface Props {
  sessions: AgentSession[];
  serverId: string;
}

interface PendingAction {
  type: ActionType;
  session: AgentSession;
}

const ACTION_META: Record<ActionType, { title: string; description: (username: string) => string; confirmLabel: string; destructive: boolean }> = {
  disconnect: {
    title: "Bağlantıyı Kes",
    description: (u) => `"${u}" kullanıcısının RDP bağlantısı kesilecek, oturum arka planda çalışmaya devam edecek. Devam etmek istiyor musunuz?`,
    confirmLabel: "Bağlantıyı Kes",
    destructive: false,
  },
  logoff: {
    title: "Oturumu Kapat",
    description: (u) => `"${u}" kullanıcısının oturumu tamamen kapatılacak ve kaydedilmemiş veriler kaybolabilir. Bu işlem geri alınamaz.`,
    confirmLabel: "Oturumu Kapat",
    destructive: true,
  },
};

async function execSessionCommand(serverId: string, command: string): Promise<void> {
  const res = await fetch(`/api/servers/${serverId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, timeout: 15 }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Komut çalıştırılamadı");
  }
  const data = await res.json();
  const result = data.result as { exitCode: number; stdout: string; stderr: string; timedOut: boolean } | null;
  if (result?.timedOut) throw new Error("İşlem zaman aşımına uğradı");
  if (result && result.exitCode !== 0) {
    throw new Error(result.stderr?.trim() || `Komut başarısız (exitCode: ${result.exitCode})`);
  }
}

function buildCommand(type: ActionType, username: string): string {
  const escaped = username.replace(/'/g, "''");
  const findLine = `$q = (query session) | Where-Object { $_ -match [regex]::Escape('${escaped}') }`;
  const getId = `$id = ($q[0].Trim() -split '\\s+')[2]`;
  const action = type === "disconnect" ? "tsdiscon $id" : "logoff $id";
  return `${findLine}; ${getId}; ${action}`;
}

export function TabSessions({ sessions, serverId }: Props) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      const command = buildCommand(pending.type, pending.session.username);
      await execSessionCommand(serverId, command);
      const meta = ACTION_META[pending.type];
      toast.success(meta.title, {
        description: `"${pending.session.username}" için işlem başarıyla uygulandı.`,
      });
      setPending(null);
    } catch (err) {
      toast.error("İşlem başarısız", {
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
      });
    } finally {
      setLoading(false);
    }
  };

  const meta = pending ? ACTION_META[pending.type] : null;

  return (
    <>
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_160px_100px_100px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcı Adı</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Tür</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Giriş Saati</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">İstemci IP</span>
            <span />
          </div>

          {/* Rows */}
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              Aktif oturum bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {sessions.map((ses, idx) => (
                <div
                  key={`${ses.username}-${idx}`}
                  className="grid grid-cols-[1fr_120px_160px_100px_100px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  <span className="text-[11px] font-mono font-medium truncate">{ses.username}</span>
                  <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">
                    {ses.sessionType}
                  </span>
                  <span className="text-[11px] tabular-nums">{ses.logonTime}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium w-fit ${ses.state === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                    {ses.state === "Active" ? "Aktif" : ses.state === "Disconnected" ? "Bağlantı Kesildi" : ses.state}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">{ses.clientIp}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      <DropdownMenuItem
                        className="text-xs cursor-pointer"
                        onClick={() => setPending({ type: "disconnect", session: ses })}
                      >
                        Bağlantıyı Kes
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs cursor-pointer text-destructive"
                        onClick={() => setPending({ type: "logoff", session: ses })}
                      >
                        Oturumu Kapat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Monitor className="size-3" />
          <span>{sessions.length} aktif oturum listeleniyor</span>
        </div>
      </div>

      {/* AlertDialog */}
      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open && !loading) setPending(null); }}>
        <AlertDialogContent className="rounded-[8px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{meta?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {meta && pending ? meta.description(pending.session.username) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} className="rounded-[5px]">
              İptal
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleConfirm}
              className={meta?.destructive ? "bg-destructive text-white hover:bg-destructive/90 rounded-[5px]" : "rounded-[5px]"}
            >
              {loading ? "Uygulanıyor..." : meta?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
