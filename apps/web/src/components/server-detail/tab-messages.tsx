"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  {
    key: "maintenance",
    label: "Bakım Bildirimi",
    text: "Sayın kullanıcı,\n\nSunucumuzda planlı bakım çalışması yapılacaktır. Bu süreçte hizmetlerimiz geçici olarak kesintiye uğrayabilir. Anlayışınız için teşekkür ederiz.",
  },
  {
    key: "restart",
    label: "Sistem Yeniden Başlatılacak",
    text: "Sayın kullanıcı,\n\nSunucu 15 dakika içinde yeniden başlatılacaktır. Lütfen çalışmalarınızı kaydediniz ve oturumunuzu kapatınız. Anlayışınız için teşekkür ederiz.",
  },
  {
    key: "custom",
    label: "Özel Mesaj",
    text: "",
  },
];

const MOCK_SESSIONS = [
  "K001.ahmet",
  "K002.mehmet",
  "K003.ayse",
  "K004.fatma",
  "K005.ali",
];

export function TabMessages() {
  const [activeTemplate, setActiveTemplate] = useState<string>("maintenance");
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [sendAll, setSendAll] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  const handleTemplate = (key: string) => {
    setActiveTemplate(key);
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (tpl) setMessage(tpl.text);
  };

  const toggleSession = (username: string) => {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

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

            {/* Textarea */}
            <div className="space-y-1">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-[5px] text-[11px] min-h-[120px] p-2.5 border border-border/50 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-foreground/30"
                placeholder="Mesajınızı buraya yazın..."
              />
              <div className="flex items-center justify-end">
                <span className="text-[10px] text-muted-foreground">{message.length} karakter</span>
              </div>
            </div>

            {/* Send button */}
            <button
              disabled={!message.trim()}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-[5px] text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <MessageSquare className="size-3.5" />
              Mesajı Gönder
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
            {/* Send all */}
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

            {/* Individual sessions */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase block">
                Bireysel Seçim
              </span>
              {MOCK_SESSIONS.map((username) => (
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
          </div>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}
