"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatsCard } from "@/components/shared/stats-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { messages, companies, messageRecipients } from "@/lib/mock-data";
import type { MessagePriority } from "@/types";
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  Mail,
  MailOpen,
  Clock,
  AlertTriangle,
  Users,
  Building2,
  UserCheck,
  Check,
  CheckCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const priorityConfig: Record<MessagePriority, { label: string; color: string }> = {
  normal: { label: "Normal", color: "bg-blue-50 text-blue-600 border-blue-200/60" },
  high: { label: "Yuksek", color: "bg-amber-50 text-amber-600 border-amber-200/60" },
  urgent: { label: "Acil", color: "bg-red-50 text-red-600 border-red-200/60" },
};

const statusIcons = {
  sent: <Send className="h-3 w-3 text-muted-foreground" />,
  delivered: <Check className="h-3 w-3 text-blue-500" />,
  read: <CheckCheck className="h-3 w-3 text-emerald-500" />,
  failed: <X className="h-3 w-3 text-red-500" />,
};

const recipientTypeLabels = {
  all: "Tum Kullanicilar",
  company: "Firma",
  selected: "Secili Kullanicilar",
};

export default function MessagesPage() {
  const [showCompose, setShowCompose] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Compose state
  const [recipientType, setRecipientType] = useState<"all" | "company" | "selected">("all");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const filtered = messages.filter((msg) => {
    if (search) {
      const q = search.toLowerCase();
      return msg.subject.toLowerCase().includes(q) || msg.body.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = selectedMessage ? messages.find((m) => m.id === selectedMessage) : null;
  const totalSent = messages.length;
  const totalRead = messages.filter((m) => m.status === "read").length;
  const urgentCount = messages.filter((m) => m.priority === "urgent").length;

  const filteredRecipients = messageRecipients.filter((r) => {
    if (companyFilter !== "all" && r.company !== companyFilter) return false;
    return true;
  });

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedRecipients(new Set(filteredRecipients.map((r) => r.id)));
  };

  return (
    <PageContainer title="Mesajlar" description="Sunucu kullanicilarina mesaj gonderme">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6 items-stretch">
        <StatsCard
          title="GONDERILEN"
          value={totalSent}
          icon={<Send className="h-4 w-4" />}
          subtitle="Toplam mesaj"
        />
        <StatsCard
          title="OKUNAN"
          value={totalRead}
          icon={<MailOpen className="h-4 w-4" />}
          trend={{ value: `%${Math.round((totalRead / totalSent) * 100)} okunma`, positive: true }}
          subtitle="Tamamlanan"
        />
        <StatsCard
          title="ACIL MESAJ"
          value={urgentCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          subtitle="Yuksek oncelikli"
        />
        <StatsCard
          title="FIRMA"
          value={companies.length}
          icon={<Building2 className="h-4 w-4" />}
          subtitle={`${messageRecipients.length} alici`}
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          size="sm"
          className="rounded-[5px] text-xs gap-1.5 h-8"
          onClick={() => { setShowCompose(!showCompose); setSelectedMessage(null); }}
        >
          <Plus className="h-3.5 w-3.5" />
          Yeni Mesaj
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Mesaj ara..."
            className="h-8 text-xs rounded-[5px] bg-white pl-8 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-3">
        {/* Message List or Compose */}
        {showCompose ? (
          <NestedCard
            footer={
              <>
                <MessageSquare className="h-3 w-3" />
                <span>Yeni mesaj olusturuluyor</span>
              </>
            }
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Yeni Mesaj</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCompose(false)}
              >
                Iptal
              </Button>
            </div>

            <div className="space-y-4">
              {/* Recipient Type */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-2 block">Alici Tipi</Label>
                <div
                  className="flex items-center rounded-[8px] p-1 w-fit"
                  style={{ backgroundColor: "#F4F2F0" }}
                >
                  {(["all", "company", "selected"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => { setRecipientType(type); setSelectedRecipients(new Set()); }}
                      className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
                        recipientType === type
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type === "all" && <Users className="h-3 w-3" />}
                      {type === "company" && <Building2 className="h-3 w-3" />}
                      {type === "selected" && <UserCheck className="h-3 w-3" />}
                      {recipientTypeLabels[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Company Selector */}
              {recipientType === "company" && (
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-2 block">Firma</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {companies.map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => setSelectedCompany(comp.id)}
                        className={`flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          selectedCompany === comp.id
                            ? "bg-foreground text-background border-foreground"
                            : "bg-white border-border/40 hover:bg-muted/30"
                        }`}
                      >
                        <Building2 className="h-3 w-3" />
                        {comp.name}
                        <span className={`text-[10px] ${selectedCompany === comp.id ? "text-background/70" : "text-muted-foreground"}`}>
                          ({comp.userCount})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* User Selector */}
              {recipientType === "selected" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] text-muted-foreground">Alicilar ({selectedRecipients.size} secili)</Label>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-7 text-[11px] rounded-[5px] border border-border/40 bg-white px-2"
                        value={companyFilter}
                        onChange={(e) => setCompanyFilter(e.target.value)}
                      >
                        <option value="all">Tum Firmalar</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={selectAllVisible}>
                        Tumunu Sec
                      </Button>
                    </div>
                  </div>
                  <div
                    className="rounded-[5px] p-2 max-h-[200px] overflow-y-auto space-y-0.5"
                    style={{ backgroundColor: "#F4F2F0" }}
                  >
                    {filteredRecipients.map((rcpt) => (
                      <button
                        key={rcpt.id}
                        onClick={() => toggleRecipient(rcpt.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-left text-xs transition-colors ${
                          selectedRecipients.has(rcpt.id)
                            ? "bg-foreground text-background"
                            : "hover:bg-white/60"
                        }`}
                      >
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${rcpt.online ? "bg-emerald-500" : "bg-gray-300"}`} />
                        <span className="font-medium flex-1">{rcpt.name}</span>
                        <span className={`text-[10px] ${selectedRecipients.has(rcpt.id) ? "text-background/60" : "text-muted-foreground"}`}>
                          {rcpt.company}
                        </span>
                        <span className={`text-[10px] ${selectedRecipients.has(rcpt.id) ? "text-background/60" : "text-muted-foreground"}`}>
                          {rcpt.server}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Konu</Label>
                <Input placeholder="Mesaj konusu..." className="h-8 text-sm rounded-[5px] bg-white" />
              </div>

              {/* Priority */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-2 block">Oncelik</Label>
                <div className="flex gap-1.5">
                  {(["normal", "high", "urgent"] as const).map((p) => (
                    <span
                      key={p}
                      className={`inline-flex items-center rounded-[5px] border px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${priorityConfig[p].color}`}
                    >
                      {priorityConfig[p].label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Mesaj</Label>
                <textarea
                  className="w-full h-32 rounded-[5px] border border-border/40 bg-white p-3 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Mesajinizi yazin..."
                />
              </div>

              {/* Send */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" className="rounded-[5px] text-xs" onClick={() => setShowCompose(false)}>
                  Iptal
                </Button>
                <Button size="sm" className="rounded-[5px] text-xs gap-1">
                  <Send className="h-3.5 w-3.5" />
                  Gonder
                </Button>
              </div>
            </div>
          </NestedCard>
        ) : (
          /* Message List */
          <NestedCard
            footer={
              <>
                <Mail className="h-3 w-3" />
                <span>{filtered.length} mesaj</span>
              </>
            }
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Gonderilen Mesajlar</h3>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[0.4fr_2fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ONCELIK</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KONU</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ALICI</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">OKUNMA</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">TARIH</span>
            </div>

            {filtered.map((msg) => {
              const prio = priorityConfig[msg.priority];
              const readPercent = Math.round((msg.readCount / msg.totalCount) * 100);
              return (
                <div
                  key={msg.id}
                  onClick={() => { setSelectedMessage(msg.id); setShowCompose(false); }}
                  className={`grid grid-cols-[0.4fr_2fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer items-center ${
                    selectedMessage === msg.id ? "bg-muted/30" : ""
                  }`}
                >
                  <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium w-fit ${prio.color}`}>
                    {prio.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{msg.subject}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{msg.body}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {msg.recipientType === "all" && <Users className="h-3 w-3 text-muted-foreground" />}
                    {msg.recipientType === "company" && <Building2 className="h-3 w-3 text-muted-foreground" />}
                    {msg.recipientType === "selected" && <UserCheck className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground">
                      {msg.recipientType === "all" ? "Herkes" : msg.recipientType === "company" ? msg.company : `${msg.recipients.length} kisi`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {statusIcons[msg.status]}
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {msg.status === "sent" ? "Gonderildi" : msg.status === "delivered" ? "Iletildi" : msg.status === "read" ? "Okundu" : "Basarisiz"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-[5px] overflow-hidden">
                      <div
                        className={`h-full rounded-[5px] ${readPercent === 100 ? "bg-emerald-500" : readPercent >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                        style={{ width: `${readPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-12">
                      {msg.readCount}/{msg.totalCount}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{msg.sentAt.split(" ")[0]}</span>
                </div>
              );
            })}
          </NestedCard>
        )}

        {/* Detail Panel / Company Overview */}
        <div className="space-y-3">
          {/* Selected Message Detail */}
          {selected && !showCompose && (
            <NestedCard>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium ${priorityConfig[selected.priority].color}`}>
                      {priorityConfig[selected.priority].label}
                    </span>
                    <div className="flex items-center gap-1">
                      {statusIcons[selected.status]}
                      <span className="text-[10px] text-muted-foreground">
                        {selected.status === "sent" ? "Gonderildi" : selected.status === "delivered" ? "Iletildi" : selected.status === "read" ? "Okundu" : "Basarisiz"}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold">{selected.subject}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">{selected.body}</p>
                </div>

                <div className="pt-3 border-t border-border/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Gonderen</span>
                    <span className="text-xs font-medium">{selected.sender}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Alici Tipi</span>
                    <div className="flex items-center gap-1">
                      {selected.recipientType === "all" && <Users className="h-3 w-3 text-muted-foreground" />}
                      {selected.recipientType === "company" && <Building2 className="h-3 w-3 text-muted-foreground" />}
                      {selected.recipientType === "selected" && <UserCheck className="h-3 w-3 text-muted-foreground" />}
                      <span className="text-xs">{recipientTypeLabels[selected.recipientType]}</span>
                    </div>
                  </div>
                  {selected.company && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Firma</span>
                      <span className="text-xs font-medium">{selected.company}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Gonderim</span>
                    <span className="text-xs">{selected.sentAt}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Okunma</span>
                    <span className="text-xs font-medium">{selected.readCount} / {selected.totalCount}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/40">
                  <p className="text-[11px] text-muted-foreground mb-1.5">Alicilar</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.recipients.map((r) => (
                      <span key={r} className="text-[10px] bg-muted px-2 py-0.5 rounded-[4px] font-medium">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-border/40 flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-[5px] text-xs flex-1 gap-1">
                    <Send className="h-3 w-3" />
                    Tekrar Gonder
                  </Button>
                </div>
              </div>
            </NestedCard>
          )}

          {/* Companies Panel */}
          <NestedCard
            footer={
              <>
                <Building2 className="h-3 w-3" />
                <span>{companies.length} firma kayitli</span>
              </>
            }
          >
            <h3 className="text-sm font-semibold mb-3">Firmalar</h3>
            <div className="space-y-1.5">
              {companies.map((comp) => {
                const onlineCount = messageRecipients.filter((r) => r.company === comp.name && r.online).length;
                return (
                  <div
                    key={comp.id}
                    className="flex items-center justify-between px-2.5 py-2 rounded-[5px] hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-7 w-7 rounded-[5px] bg-muted/50">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{comp.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {comp.servers.length} sunucu
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{comp.userCount} kullanici</p>
                      <p className="text-[10px] text-emerald-600">{onlineCount} cevrimici</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </NestedCard>
        </div>
      </div>
    </PageContainer>
  );
}
