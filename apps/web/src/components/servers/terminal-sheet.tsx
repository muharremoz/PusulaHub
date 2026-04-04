"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  loading?: boolean;
}

interface TerminalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
}

const POLL_INTERVAL = 800;
const MAX_POLLS = 40;

export function TerminalSheet({ open, onOpenChange, serverId, serverName }: TerminalSheetProps) {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setEntries([]);
      setInput("");
      setHistory([]);
      setHistoryIdx(-1);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  async function runCommand() {
    const cmd = input.trim();
    if (!cmd || running) return;

    setInput("");
    setHistoryIdx(-1);
    setHistory((h) => [cmd, ...h].slice(0, 50));

    const entryId = crypto.randomUUID();
    setEntries((e) => [
      ...e,
      { id: entryId, command: cmd, stdout: "", stderr: "", exitCode: 0, duration: 0, loading: true },
    ]);
    setRunning(true);

    try {
      // Queue the command
      const postRes = await fetch(`/api/servers/${serverId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });

      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({ error: "Sunucuya bağlanılamadı" }));
        setEntries((e) =>
          e.map((x) =>
            x.id === entryId
              ? { ...x, stderr: err.error ?? "Hata oluştu", exitCode: -1, loading: false }
              : x
          )
        );
        return;
      }

      const { execId } = await postRes.json();

      // Poll for result
      let polls = 0;
      const poll = async (): Promise<void> => {
        polls++;
        const res = await fetch(`/api/servers/${serverId}/exec?execId=${execId}`);
        const data = await res.json();

        if (data.ready) {
          const r = data.result;
          setEntries((e) =>
            e.map((x) =>
              x.id === entryId
                ? {
                    ...x,
                    stdout:   r.stdout ?? "",
                    stderr:   r.stderr ?? "",
                    exitCode: r.exitCode ?? 0,
                    duration: r.duration ?? 0,
                    loading:  false,
                  }
                : x
            )
          );
        } else if (polls < MAX_POLLS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          return poll();
        } else {
          setEntries((e) =>
            e.map((x) =>
              x.id === entryId
                ? { ...x, stderr: "Yanıt bekleme süresi doldu", exitCode: -1, loading: false }
                : x
            )
          );
        }
      };

      await poll();
    } catch {
      setEntries((e) =>
        e.map((x) =>
          x.id === entryId
            ? { ...x, stderr: "Bağlantı hatası", exitCode: -1, loading: false }
            : x
        )
      );
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      runCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setInput(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(next);
        setInput(history[next] ?? "");
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[600px] !max-w-[600px] p-0 flex flex-col gap-0 bg-zinc-950 text-zinc-100 border-l border-zinc-800"
      >
        <SheetHeader className="px-4 py-3 border-b border-zinc-800 flex flex-row items-center gap-2 space-y-0">
          <Terminal className="size-4 text-emerald-400 shrink-0" />
          <SheetTitle className="text-sm font-mono text-zinc-100 font-medium">
            {serverName}
          </SheetTitle>
          <span className="text-xs text-zinc-500 font-mono ml-1">— terminal</span>
        </SheetHeader>

        {/* Output area */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-3 font-mono text-[12px]">
            {entries.length === 0 && (
              <div className="text-zinc-500 text-[11px] pt-2">
                Komut girin ve Enter&apos;a basın. Geçmişte gezinmek için ↑ ↓ kullanın.
              </div>
            )}

            {entries.map((entry) => (
              <div key={entry.id} className="space-y-1">
                {/* Command line */}
                <div className="flex items-center gap-2">
                  <ChevronRight className="size-3 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">{entry.command}</span>
                  {entry.loading && (
                    <Loader2 className="size-3 text-zinc-500 animate-spin ml-1" />
                  )}
                  {!entry.loading && (
                    <span
                      className={cn(
                        "ml-auto text-[10px] tabular-nums",
                        entry.exitCode === 0 ? "text-zinc-600" : "text-red-500"
                      )}
                    >
                      {entry.exitCode !== 0 && `exit:${entry.exitCode} · `}
                      {entry.duration}ms
                    </span>
                  )}
                </div>

                {/* stdout */}
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap break-all text-zinc-300 pl-5 leading-relaxed">
                    {entry.stdout}
                  </pre>
                )}

                {/* stderr */}
                {entry.stderr && (
                  <pre className="whitespace-pre-wrap break-all text-red-400 pl-5 leading-relaxed">
                    {entry.stderr}
                  </pre>
                )}
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-2">
          <ChevronRight className="size-3.5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            placeholder={running ? "Çalışıyor..." : "Komut girin…"}
            className="flex-1 bg-transparent outline-none text-[12px] font-mono text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
