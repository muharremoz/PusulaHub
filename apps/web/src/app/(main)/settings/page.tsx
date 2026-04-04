"use client";

import { useState, useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { Settings, Server, Database, Shield, Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

/* ── Bölüm kartı ── */
function Section({
  icon: Icon,
  title,
  footer,
  children,
}: {
  icon: React.ElementType;
  title: string;
  footer: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
      <div
        className="rounded-[4px] overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        <div className="px-3 py-2 border-t border-border/40 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="size-3" />
          <span>{footer}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SkeletonSection() {
  return (
    <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
      <div
        className="rounded-[4px] overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
          <Skeleton className="h-3 w-24 rounded-[3px]" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32 rounded-[3px]" />
              <Skeleton className="h-8 w-full rounded-[5px]" />
            </div>
          ))}
          <Skeleton className="h-8 w-16 rounded-[5px]" />
        </div>
        <div className="px-3 py-2 border-t border-border/40">
          <Skeleton className="h-3 w-40 rounded-[3px]" />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Genel
  const [appName, setAppName]           = useState("");
  const [agentInterval, setAgentInterval] = useState("");
  const [logRetention, setLogRetention] = useState("");

  // Agent
  const [agentPort, setAgentPort] = useState("");
  const [tlsVerify, setTlsVerify] = useState(true);

  // Firma API
  const [firmaApiUrl, setFirmaApiUrl]           = useState("");
  const [firmaApiUsername, setFirmaApiUsername] = useState("");
  const [firmaApiPassword, setFirmaApiPassword] = useState("");
  const [firmaApiTimeout, setFirmaApiTimeout]   = useState("10");
  const [firmaApiEnabled, setFirmaApiEnabled]   = useState(false);
  const [showApiPassword, setShowApiPassword]   = useState(false);

  // Güvenlik
  const [sessionTimeout, setSessionTimeout]   = useState("");
  const [maxFailedLogins, setMaxFailedLogins] = useState("");
  const [ipWhitelist, setIpWhitelist]         = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setAppName(d.app_name ?? "PusulaHub");
        setAgentInterval(d.agent_interval ?? "60");
        setLogRetention(d.log_retention_days ?? "90");
        setAgentPort(d.agent_port ?? "3001");
        setTlsVerify(d.tls_verify !== "false");
        setFirmaApiUrl(d.firma_api_url ?? "");
        setFirmaApiUsername(d.firma_api_username ?? "");
        setFirmaApiPassword(d.firma_api_password ?? "");
        setFirmaApiTimeout(d.firma_api_timeout ?? "10");
        setFirmaApiEnabled(d.firma_api_enabled === "true");
        setSessionTimeout(d.session_timeout ?? "30");
        setMaxFailedLogins(d.max_failed_logins ?? "5");
        setIpWhitelist(d.ip_whitelist ?? "");
      })
      .catch(() => toast.error("Ayarlar yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  async function save(section: string, data: Record<string, string>) {
    setSaving(section);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success("Kaydedildi");
    } catch {
      toast.error("Kaydedilemedi");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <PageContainer title="Ayarlar" description="Uygulama ve bağlantı ayarları">
        <div className="grid grid-cols-2 gap-3">
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Ayarlar" description="Uygulama ve bağlantı ayarları">
      <div className="grid grid-cols-2 gap-3">

        {/* Genel Ayarlar */}
        <Section icon={Settings} title="Genel Ayarlar" footer="Genel uygulama ayarları">
          <Field label="Uygulama Adı">
            <Input value={appName} onChange={(e) => setAppName(e.target.value)}
              className="h-8 text-[11px] rounded-[5px]" />
          </Field>
          <Field label="Agent Kontrol Aralığı (saniye)">
            <Input type="number" value={agentInterval} onChange={(e) => setAgentInterval(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28" />
          </Field>
          <Field label="Log Saklama Süresi (gün)">
            <Input type="number" value={logRetention} onChange={(e) => setLogRetention(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28" />
          </Field>
          <Button size="sm" className="rounded-[5px] text-xs" disabled={saving === "general"}
            onClick={() => save("general", { app_name: appName, agent_interval: agentInterval, log_retention_days: logRetention })}>
            {saving === "general" ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </Section>

        {/* Agent Ayarları */}
        <Section icon={Server} title="Agent Ayarları" footer="Agent bağlantı ayarları">
          <Field label="Varsayılan Agent Portu">
            <Input type="number" value={agentPort} onChange={(e) => setAgentPort(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28" />
          </Field>
          <Field label="TLS Doğrulama">
            <div className="flex items-center gap-2 h-8">
              <input
                type="checkbox"
                checked={tlsVerify}
                onChange={(e) => setTlsVerify(e.target.checked)}
                className="rounded"
              />
              <span className="text-[11px] text-muted-foreground">SSL sertifika doğrulamasını etkinleştir</span>
            </div>
          </Field>
          <Button size="sm" className="rounded-[5px] text-xs" disabled={saving === "agent"}
            onClick={() => save("agent", { agent_port: agentPort, tls_verify: String(tlsVerify) })}>
            {saving === "agent" ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </Section>

        {/* SQL Server Bağlantısı — env.local'dan okunur, salt okunur */}
        <Section icon={Database} title="SQL Server Bağlantısı" footer="Bağlantı bilgileri .env.local dosyasından okunur">
          <Field label="Sunucu">
            <Input readOnly value={process.env.NEXT_PUBLIC_DB_SERVER ?? "localhost"}
              className="h-8 text-[11px] rounded-[5px] bg-muted/30 text-muted-foreground cursor-not-allowed" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Veritabanı">
              <Input readOnly value="PusulaHub"
                className="h-8 text-[11px] rounded-[5px] bg-muted/30 text-muted-foreground cursor-not-allowed" />
            </Field>
            <Field label="Port">
              <Input readOnly value="1433"
                className="h-8 text-[11px] rounded-[5px] bg-muted/30 text-muted-foreground cursor-not-allowed" />
            </Field>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Bağlantı ayarlarını değiştirmek için sunucudaki <code className="bg-muted px-1 rounded">.env.local</code> dosyasını düzenleyin.
          </p>
        </Section>

        {/* Firma API */}
        <Section icon={Building2} title="Firma API" footer="Firma ve kullanıcı bilgilerinin çekileceği dış API">
          <Field label="Durum">
            <div className="flex items-center gap-2 h-8">
              <input
                type="checkbox"
                checked={firmaApiEnabled}
                onChange={(e) => setFirmaApiEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-[11px] text-muted-foreground">Firma API entegrasyonunu etkinleştir</span>
            </div>
          </Field>
          <Field label="API URL">
            <Input
              value={firmaApiUrl}
              onChange={(e) => setFirmaApiUrl(e.target.value)}
              placeholder="http://erp.sirket.local/api"
              className="h-8 text-[11px] rounded-[5px] font-mono"
              disabled={!firmaApiEnabled}
            />
          </Field>
          <Field label="Kullanıcı Adı">
            <Input
              value={firmaApiUsername}
              onChange={(e) => setFirmaApiUsername(e.target.value)}
              placeholder="PusulaLisans"
              className="h-8 text-[11px] rounded-[5px]"
              disabled={!firmaApiEnabled}
            />
          </Field>
          <Field label="Şifre">
            <div className="relative">
              <Input
                type={showApiPassword ? "text" : "password"}
                value={firmaApiPassword}
                onChange={(e) => setFirmaApiPassword(e.target.value)}
                placeholder="••••••••"
                className="h-8 text-[11px] rounded-[5px] pr-9"
                disabled={!firmaApiEnabled}
              />
              <button
                type="button"
                onClick={() => setShowApiPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </Field>
          <Field label="Zaman Aşımı (saniye)">
            <Input
              type="number"
              value={firmaApiTimeout}
              onChange={(e) => setFirmaApiTimeout(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28"
              disabled={!firmaApiEnabled}
            />
          </Field>
          <p className="text-[10px] text-muted-foreground/70">
            Kaydedilen bilgiler <code className="bg-muted px-1 rounded">.env.local</code> dosyasına
            da <code className="bg-muted px-1 rounded">FIRMA_API_URL</code>,{" "}
            <code className="bg-muted px-1 rounded">FIRMA_API_USERNAME</code> ve{" "}
            <code className="bg-muted px-1 rounded">FIRMA_API_PASSWORD</code> olarak eklenmelidir.
          </p>
          <Button
            size="sm"
            className="rounded-[5px] text-xs"
            disabled={saving === "firma_api"}
            onClick={() =>
              save("firma_api", {
                firma_api_url:      firmaApiUrl,
                firma_api_username: firmaApiUsername,
                firma_api_password: firmaApiPassword,
                firma_api_timeout:  firmaApiTimeout,
                firma_api_enabled:  String(firmaApiEnabled),
              })
            }
          >
            {saving === "firma_api" ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </Section>

        {/* Güvenlik */}
        <Section icon={Shield} title="Güvenlik" footer="Oturum ve erişim güvenlik ayarları">
          <Field label="Oturum Süresi (dakika)">
            <Input type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28" />
          </Field>
          <Field label="Maksimum Hatalı Giriş">
            <Input type="number" value={maxFailedLogins} onChange={(e) => setMaxFailedLogins(e.target.value)}
              className="h-8 text-[11px] rounded-[5px] w-28" />
          </Field>
          <Field label="IP Kısıtlama">
            <Input value={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.value)}
              placeholder="192.168.1.0/24" className="h-8 text-[11px] rounded-[5px]" />
          </Field>
          <Button size="sm" className="rounded-[5px] text-xs" disabled={saving === "security"}
            onClick={() => save("security", { session_timeout: sessionTimeout, max_failed_logins: maxFailedLogins, ip_whitelist: ipWhitelist })}>
            {saving === "security" ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </Section>

      </div>
    </PageContainer>
  );
}
