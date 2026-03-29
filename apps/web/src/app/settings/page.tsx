"use client";

import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { Settings, Server, Database, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <PageContainer title="Ayarlar" description="Uygulama ve baglanti ayarlari">
      <div className="grid grid-cols-2 gap-3">
        {/* General Settings */}
        <NestedCard
          footer={
            <>
              <Settings className="h-3 w-3" />
              <span>Genel uygulama ayarlari</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-4">Genel Ayarlar</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Uygulama Adi</Label>
              <Input defaultValue="PusulaHub" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Agent Kontrol Araligi (saniye)</Label>
              <Input defaultValue="60" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Log Saklama Suresi (gun)</Label>
              <Input defaultValue="90" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <Button size="sm" className="rounded-[5px] text-xs">
              Kaydet
            </Button>
          </div>
        </NestedCard>

        {/* Agent Settings */}
        <NestedCard
          footer={
            <>
              <Server className="h-3 w-3" />
              <span>Agent baglanti ayarlari</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-4">Agent Ayarlari</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Varsayilan Agent Portu</Label>
              <Input defaultValue="3001" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">API Anahtari</Label>
              <Input defaultValue="pk_live_xxxx...xxxx" type="password" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">TLS Dogrulama</Label>
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-xs text-muted-foreground">SSL sertifika dogrulamasini etkinlestir</span>
              </div>
            </div>
            <Button size="sm" className="rounded-[5px] text-xs">
              Kaydet
            </Button>
          </div>
        </NestedCard>

        {/* Database Settings */}
        <NestedCard
          footer={
            <>
              <Database className="h-3 w-3" />
              <span>SQL Server baglanti bilgileri</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-4">SQL Server Baglantisi</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Sunucu</Label>
                <Input defaultValue="localhost" className="h-8 text-sm rounded-[5px] bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Port</Label>
                <Input defaultValue="1433" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Kullanici Adi</Label>
                <Input defaultValue="sa" className="h-8 text-sm rounded-[5px] bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Sifre</Label>
                <Input type="password" defaultValue="password" className="h-8 text-sm rounded-[5px] bg-white" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Veritabani</Label>
              <Input defaultValue="PusulaHub" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <Button size="sm" className="rounded-[5px] text-xs">
              Baglantıyı Test Et
            </Button>
          </div>
        </NestedCard>

        {/* Security Settings */}
        <NestedCard
          footer={
            <>
              <Shield className="h-3 w-3" />
              <span>Guvenlik ayarlari</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-4">Guvenlik</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Oturum Suresi (dakika)</Label>
              <Input defaultValue="30" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Maksimum Hatali Giris</Label>
              <Input defaultValue="5" type="number" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">IP Kisitlama</Label>
              <Input placeholder="192.168.1.0/24" className="h-8 text-sm rounded-[5px] bg-white" />
            </div>
            <Button size="sm" className="rounded-[5px] text-xs">
              Kaydet
            </Button>
          </div>
        </NestedCard>
      </div>
    </PageContainer>
  );
}
