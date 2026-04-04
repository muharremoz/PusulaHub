"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, RefreshCw, CheckCircle2, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MsgType = "info" | "warning" | "urgent";

interface ReadReceipt {
  username: string;
  readAt: string;
}

interface SentMessage {
  id: string;
  agentId: string;
  title: string;
  body: string;
  type: MsgType;
  from: string;
  sentAt: string;
  sessions: number;
  readBy: ReadReceipt[];
}

const TEMPLATES = [
  {
    key: "maintenance",
    label: "Bakım Bildirimi",
    title: "Planlanmış Bakım",
    type: "info" as MsgType,
    text: "Sayın kullanıcı,\n\nSunucumuzda planlı bakım çalışması yapılacaktır. Bu süreçte hizmetlerimiz geçici olarak kesintiye uğrayabilir. Anlayışınız için teşekkür ederiz.",
  },
  {
    key: "restart",
    label: "Yeniden Başlatma",
    title: "Sistem Yeniden Başlatılacak",
    type: "warning" as MsgType,
    text: "Sayın kullanıcı,\n\nSunucu 15 dakika içinde yeniden başlatılacaktır. Lütfen çalışmalarınızı kaydediniz ve oturumunuzu kapatınız. Anlayışınız için teşekkür ederiz.",
  },
  {
    key: "custom",
    label: "Özel Mesaj",
    title: "",
    type: "info" as MsgType,
    text: "",
  },
];

const TYPE_LABELS: Record<MsgType, { label: string; cls: string; badgeCls: string }> = {
  info:    { label: "Bilgi",   cls: "bg-blue-50 text-blue-700 border-blue-200",   badgeCls: "bg-blue-100 text-blue-700 border-0" },
  warning: { label: "Uyarı",  cls: "bg-amber-50 text-amber-700 border-amber-200", badgeCls: "bg-amber-100 text-amber-700 border-0" },
  urgent:  { label: "Acil",   cls: "bg-red-50 text-red-700 border-red-200",        badgeCls: "bg-red-100 text-red-700 border-0" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatReadAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

interface TabMessagesProps {
  sessions: { username: string; sessionType: string; state: string }[];
  serverId: string;
}

export function TabMessages({ sessions, serverId }: TabMessagesProps) {
  const sessionUsernames = sessions.map((s) => s.username);
  const [activeTemplate, setActiveTemplate] = useState<string>("maintenance");
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [msgType, setMsgType] = useState<MsgType>(TEMPLATES[0].type);
  const [sendAll, setSendAll] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Geçmiş mesajlar
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setSentMessages(data.messages ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchHistory();
    // Her 15 saniyede otomatik yenile
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const handleTemplate = (key: string) => {
    setActiveTemplate(key);
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (tpl) {
      setTitle(tpl.title);
      setMessage(tpl.text);
      setMsgType(tpl.type);
    }
  };

  const toggleSession = (username: string) => {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    if (!sendAll && selectedSessions.size === 0) {
      toast.error("Hedef seçilmedi", { description: "En az bir oturum seçin." });
      return;
    }

    setSending(true);
    try {
      const hubUrl = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`/api/servers/${serverId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: message.trim(),
          type: msgType,
          from: "Pusula Yazılım",
          hubUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "İstek başarısız");

      const count: number = data.sessions ?? 0;
      toast.success("Mesaj iletildi", {
        description: count > 0
          ? `${count} aktif oturuma popup olarak gösterildi.`
          : "Aktif oturum bulunamadı, mesaj kuyruğa alındı.",
      });
      // Geçmişi hemen güncelle
      setTimeout(fetchHistory, 500);
    } catch (err) {
      toast.error("Mesaj gönderilemedi", {
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
      });
    } finally {
      setSending(false);
    }
  };

  const noSessions = sessionUsernames.length === 0;

  return (
    <div className="space-y-3">
      {/* ── Compose + Hedef ── */}
      {noSessions ? (
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px] px-4 py-8 text-center"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            <MessageSquare className="size-5 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-[11px] text-muted-foreground">
              Aktif oturum bulunmuyor — mesaj göndermek için en az bir oturum gerekli
            </p>
          </div>
          <div className="h-2" />
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_280px] gap-3">
          {/* Compose area */}
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px]"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  Mesaj Oluştur
                </span>
              </div>
              <div className="px-3 py-3 space-y-3">
                {/* Template pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.key}
                      onClick={() => handleTemplate(tpl.key)}
                      className={cn(
                        "rounded-[5px] text-[11px] font-medium px-3 py-1.5 transition-colors border",
                        activeTemplate === tpl.key
                          ? "bg-foreground text-background border-foreground"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* Tip seçimi */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground shrink-0">Tip:</span>
                  {(["info", "warning", "urgent"] as MsgType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMsgType(t)}
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-[4px] border transition-colors",
                        msgType === t ? TYPE_LABELS[t].cls : "border-border/40 text-muted-foreground hover:bg-muted/30"
                      )}
                    >
                      {TYPE_LABELS[t].label}
                    </button>
                  ))}
                </div>

                {/* Başlık */}
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Mesaj başlığı..."
                  className="h-8 text-[11px] rounded-[5px] border-border/50"
                />

                {/* Mesaj gövdesi */}
                <div className="space-y-1">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-[5px] text-[11px] min-h-[100px] p-2.5 border border-border/50 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-foreground/30"
                    placeholder="Mesajınızı buraya yazın..."
                  />
                  <div className="flex items-center justify-end">
                    <span className="text-[10px] text-muted-foreground">{message.length} karakter</span>
                  </div>
                </div>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!title.trim() || !message.trim() || sending}
                  className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-[5px] text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <MessageSquare className="size-3.5" />
                  {sending ? "Gönderiliyor..." : "Mesajı Gönder"}
                </button>
              </div>
            </div>
            <div className="h-2" />
          </div>

          {/* Target selection */}
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px]"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  Hedef Seçimi
                </span>
              </div>
              <div className="px-3 py-3 space-y-2.5">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <Checkbox
                    id="send-all"
                    checked={sendAll}
                    onCheckedChange={(v) => {
                      setSendAll(!!v);
                      if (v) setSelectedSessions(new Set());
                    }}
                    className="rounded-[3px]"
                  />
                  <label htmlFor="send-all" className="text-[11px] font-medium cursor-pointer">
                    Tüm Oturumlar
                  </label>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase block">
                    Bireysel Seçim
                  </span>
                  {sessionUsernames.map((username) => (
                    <div key={username} className="flex items-center gap-2">
                      <Checkbox
                        id={`ses-${username}`}
                        checked={!sendAll && selectedSessions.has(username)}
                        disabled={sendAll}
                        onCheckedChange={() => toggleSession(username)}
                        className="rounded-[3px]"
                      />
                      <label
                        htmlFor={`ses-${username}`}
                        className={cn(
                          "text-[11px] font-mono cursor-pointer",
                          sendAll && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {username}
                      </label>
                    </div>
                  ))}
                </div>

                {/* Not */}
                <div className="pt-2 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Mesajlar WTS inject yöntemiyle kullanıcı oturumuna doğrudan iletilir.
                  </p>
                </div>
              </div>
            </div>
            <div className="h-2" />
          </div>
        </div>
      )}

      {/* ── Gönderilen Mesajlar Geçmişi ── */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
              Gönderilen Mesajlar
            </span>
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="p-0.5 rounded hover:bg-muted/40 transition-colors text-muted-foreground disabled:opacity-40"
              title="Yenile"
            >
              <RefreshCw className={cn("size-3", loadingHistory && "animate-spin")} />
            </button>
          </div>

          {sentMessages.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[11px] text-muted-foreground">
                {loadingHistory ? "Yükleniyor..." : "Henüz mesaj gönderilmedi."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {sentMessages.map((msg) => {
                const isExpanded = expandedId === msg.id;
                const readCount = msg.readBy.length;
                const allRead = msg.sessions > 0 && readCount >= msg.sessions;

                return (
                  <div key={msg.id}>
                    {/* Mesaj satırı */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
                    >
                      {/* Expand chevron */}
                      <span className="mt-0.5 text-muted-foreground/50 shrink-0">
                        {isExpanded
                          ? <ChevronDown className="size-3" />
                          : <ChevronRight className="size-3" />}
                      </span>

                      {/* Type badge */}
                      <Badge className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0 mt-0.5", TYPE_LABELS[msg.type].badgeCls)}>
                        {TYPE_LABELS[msg.type].label}
                      </Badge>

                      {/* Title + time */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{msg.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="size-2.5" />
                          {formatTime(msg.sentAt)}
                        </p>
                      </div>

                      {/* Okundu durumu */}
                      <div className={cn(
                        "flex items-center gap-1 shrink-0 text-[10px] font-medium",
                        allRead ? "text-emerald-600" : readCount > 0 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        <CheckCircle2 className={cn("size-3", allRead && "fill-emerald-100")} />
                        <span>{readCount}/{msg.sessions} okundu</span>
                      </div>
                    </button>

                    {/* Expanded: okundu listesi */}
                    {isExpanded && (
                      <div className="px-9 pb-3 space-y-1.5 bg-muted/10">
                        {/* Mesaj önizleme */}
                        <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-border/60 pl-2 mb-2 py-0.5 whitespace-pre-line line-clamp-3">
                          {msg.body}
                        </p>

                        {readCount === 0 ? (
                          <p className="text-[10px] text-muted-foreground italic">Henüz kimse okumadı.</p>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[9px] font-medium text-muted-foreground tracking-wide uppercase block">
                              Okuyanlar
                            </span>
                            {msg.readBy.map((r) => (
                              <div key={r.username} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="size-3 text-emerald-500 fill-emerald-50" />
                                  <span className="text-[11px] font-mono">{r.username}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">{formatReadAt(r.readAt)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 bg-muted/20 border-t border-border/40 flex items-center gap-1.5">
            <MessageSquare className="size-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground">
              {sentMessages.length} mesaj listeleniyor · Her 15 saniyede otomatik güncellenir
            </span>
          </div>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}
