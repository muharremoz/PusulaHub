"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MsgType = "info" | "warning" | "urgent";

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

const TYPE_LABELS: Record<MsgType, { label: string; cls: string }> = {
  info:    { label: "Bilgi",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  warning: { label: "Uyarı",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  urgent:  { label: "Acil",   cls: "bg-red-50 text-red-700 border-red-200" },
};

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
      const res = await fetch(`/api/servers/${serverId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: message.trim(), type: msgType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "İstek başarısız");

      toast.success("Mesaj gönderildi", {
        description: "Notifier uygulamasına iletildi.",
      });
    } catch (err) {
      toast.error("Mesaj gönderilemedi", {
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
      });
    } finally {
      setSending(false);
    }
  };

  if (sessionUsernames.length === 0) {
    return (
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
    );
  }

  return (
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

            {/* Notifier notu */}
            <div className="pt-2 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Mesajlar sunucudaki <span className="font-medium">PusulaNotifier</span> uygulaması üzerinden kullanıcıya iletilir.
              </p>
            </div>
          </div>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}
