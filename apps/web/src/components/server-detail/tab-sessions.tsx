"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Table, InlineTextFilter, InlineSelectFilter, type TableColumn, type SortState,
} from "@muharremoz/pusula-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AgentReport } from "@/lib/agent-types";

type AgentSession = NonNullable<AgentReport["sessions"]>[number];
type ActionType = "disconnect" | "logoff";
type Satir = AgentSession & { _id: string; firkod: string | null; aktif: boolean };

interface Props {
  sessions: AgentSession[];
  serverId: string;
  /** firkod → firma adı */
  firmaMap?: Record<string, string>;
}

const ACTION_META: Record<ActionType, { title: string; description: (u: string) => string; confirmLabel: string; destructive: boolean }> = {
  disconnect: {
    title: "Bağlantı kesilsin mi?",
    description: (u) => `${u} kullanıcısının RDP bağlantısı kesilecek; oturum ve açık programları arka planda çalışmaya devam eder.`,
    confirmLabel: "Bağlantıyı kes",
    destructive: false,
  },
  logoff: {
    title: "Oturum kapatılsın mı?",
    description: (u) => `${u} kullanıcısının oturumu tamamen kapatılacak; açık programlar kapanır, kaydedilmemiş işler kaybolur. Geri alınamaz.`,
    confirmLabel: "Oturumu kapat",
    destructive: true,
  },
};

async function execSessionCommand(serverId: string, command: string): Promise<string> {
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
  if (result && result.exitCode !== 0) throw new Error(result.stderr?.trim() || `Komut başarısız (exitCode: ${result.exitCode})`);
  return result?.stdout ?? "";
}

/**
 * `query session` satırından oturum kimliğini bulup işlem uygular.
 * Aktif satır:   "rdp-tcp#5  kullanici  7  Active"  → kimlik kullanıcıdan sonraki alan
 * Kopuk satır:   "           kullanici  6  Disc"    → oturum adı BOŞ, kimlik yine kullanıcıdan sonra
 * Eski kod sabit 3. alanı alıyordu; kopuk satırda bu durum sütunu ("Disc") oluyordu.
 * `aktif` ile doğru satır seçilir (aynı kullanıcının hem aktif hem kopuk oturumu olabilir).
 */
function buildCommand(type: ActionType, username: string, aktif: boolean): string {
  const u = username.replace(/'/g, "''");
  const islem = type === "disconnect" ? "tsdiscon $id" : "logoff $id";
  return [
    `$u = '${u}'; $id = $null`,
    `foreach ($l in @(query session 2>$null)) { $t = ($l.Trim() -replace '^>', '') -split '\\s+'; ` +
      `$k = @($t | ForEach-Object { $_.ToLower() }); $i = [array]::IndexOf($k, $u.ToLower()); ` +
      `if ($i -ge 0 -and $t.Count -gt $i + 1 -and $t[$i + 1] -match '^\\d+$') { $ilk = ($i -eq 1); if ($ilk -eq ${aktif ? "$true" : "$false"}) { $id = $t[$i + 1]; break } } }`,
    `if ($id) { ${islem}; Write-Output ('TAMAM=' + $id) } else { Write-Output 'BULUNAMADI' }`,
  ].join("; ");
}

const sadeAd = (u: string) => (u.includes("\\") ? u.split("\\").pop()! : u);

export function TabSessions({ sessions, serverId, firmaMap = {} }: Props) {
  const [pending, setPending] = useState<{ type: ActionType; s: Satir } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtreAcik, setFiltreAcik] = useState(false);
  const [adFiltre, setAdFiltre] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<string[]>([]);
  const [sira, setSira] = useState<SortState | null>({ key: "username", direction: "asc" });

  const satirlar: Satir[] = sessions
    .filter((s) => s.username && !/console|services/i.test(s.sessionType ?? ""))
    .map((s, i) => {
      const ad = sadeAd(s.username);
      const m = /^(\d+)\./.exec(ad);
      return { ...s, username: ad, _id: `${ad}-${i}`, firkod: m ? m[1] : null, aktif: /^active$/i.test(s.state ?? "") };
    });
  const q = adFiltre.trim().toLocaleLowerCase("tr-TR");
  const liste = satirlar.filter((s) => {
    if (q && !`${s.username} ${s.firkod ? firmaMap[s.firkod] ?? "" : ""} ${s.clientIp ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)) return false;
    if (durumFiltre.length && !durumFiltre.includes(s.aktif ? "aktif" : "kopuk")) return false;
    return true;
  });
  const aktifSay = satirlar.filter((s) => s.aktif).length;

  const handleConfirm = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      const out = await execSessionCommand(serverId, buildCommand(pending.type, pending.s.username, pending.s.aktif));
      if (/BULUNAMADI/.test(out)) throw new Error("Oturum sunucuda bulunamadı — zaten kapanmış olabilir.");
      toast.success(pending.type === "disconnect" ? "Bağlantı kesildi" : "Oturum kapatıldı", { description: pending.s.username });
      setPending(null);
    } catch (err) {
      toast.error("İşlem başarısız", { description: err instanceof Error ? err.message : "Bilinmeyen hata" });
    } finally {
      setLoading(false);
    }
  };

  const sutunlar: TableColumn<Satir>[] = [
    {
      key: "username", header: "Kullanıcı", sortable: true, width: "200px",
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Kullanıcı, firma, IP…" />,
      cell: (s) => <span className="block truncate font-medium">{s.username}</span>,
    },
    {
      key: "firma", header: "Firma", sortable: true, sortValue: (s) => (s.firkod ? firmaMap[s.firkod] ?? s.firkod : ""),
      cell: (s) => s.firkod
        ? <span className="flex min-w-0 items-center gap-2"><span className="shrink-0 tabular-nums text-muted-foreground">{s.firkod}</span><span className="truncate">{firmaMap[s.firkod] ?? "—"}</span></span>
        : <span className="text-muted-foreground">—</span>,
    },
    { key: "logonTime", header: "Giriş", sortable: true, width: "170px", cell: (s) => <span className="tabular-nums">{s.logonTime || "—"}</span> },
    { key: "clientIp", header: "İstemci IP", sortable: true, width: "140px", cell: (s) => <span className="tabular-nums text-muted-foreground">{s.clientIp || "—"}</span> },
    {
      key: "state", header: "Durum", sortable: true, align: "center", width: "130px", sortValue: (s) => (s.aktif ? 1 : 0),
      filter: <InlineSelectFilter options={["aktif", "kopuk"] as const} selected={durumFiltre} onChange={setDurumFiltre} getLabel={(o) => (o === "aktif" ? "Aktif" : "Disconnect")} />,
      cell: (s) => (
        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${s.aktif ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
          {s.aktif ? "Aktif" : "Disconnect"}
        </span>
      ),
    },
    {
      key: "islem", header: "", width: "64px", align: "center",
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex size-7 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label={`${s.username} işlemleri`}>
              <MoreVertical className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {s.aktif && <DropdownMenuItem className="text-[12px]" onClick={() => setPending({ type: "disconnect", s })}>Bağlantıyı kes</DropdownMenuItem>}
            <DropdownMenuItem className="text-[12px] text-rose-600 focus:text-rose-600" onClick={() => setPending({ type: "logoff", s })}>Oturumu kapat</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const meta = pending ? ACTION_META[pending.type] : null;
  const filtreSayisi = (q ? 1 : 0) + (durumFiltre.length ? 1 : 0);

  return (
    <>
      <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <h2 className="text-[13px] font-semibold">Oturumlar</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {filtreSayisi ? `${liste.length} / ` : ""}{satirlar.length} oturum · {aktifSay} aktif · {satirlar.length - aktifSay} disconnect
          </span>
          <span className="ml-auto flex items-center gap-2">
            {filtreSayisi > 0 && (
              <button type="button" className="text-[12px] font-medium text-primary hover:underline" onClick={() => { setAdFiltre(""); setDurumFiltre([]); }}>
                Filtreleri temizle
              </button>
            )}
            <Button variant="outline" size="sm" className="h-7 rounded-[5px] px-2.5 text-[12px]" onClick={() => setFiltreAcik((v) => !v)}>
              {filtreAcik ? "Filtreleri gizle" : "Filtrele"}
            </Button>
          </span>
        </div>
        <Table<Satir>
          data={liste}
          columns={sutunlar}
          getRowId={(s) => s._id}
          sort={sira ?? undefined}
          onSortChange={setSira}
          filterRow={filtreAcik}
          columnDividers
          resizable
          rowHeight={36}
          headerHeight={30}
          height={`${30 + (filtreAcik ? 34 : 0) + Math.min(Math.max(liste.length, 3), 16) * 36 + 2}px`}
          className="rounded-[8px] text-[13px]"
          emptyState={satirlar.length === 0 ? "Bu sunucuda açık oturum yok." : "Filtreye uyan oturum yok."}
        />
      </section>

      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open && !loading) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{meta?.title}</AlertDialogTitle>
            <AlertDialogDescription>{meta && pending ? meta.description(pending.s.username) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(e) => { e.preventDefault(); void handleConfirm(); }}
              className={meta?.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {loading ? "Uygulanıyor…" : meta?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
