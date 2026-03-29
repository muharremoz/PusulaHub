"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { sqlDatabases } from "@/lib/mock-data";
import { Database, Play, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export default function SQLPage() {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [query, setQuery] = useState("SELECT TOP 10 * FROM sys.tables");

  return (
    <PageContainer title="SQL Server" description="Veritabani yonetimi ve sorgu calistirma">
      {/* Database List */}
      <NestedCard
        footer={
          <>
            <Database className="h-3 w-3" />
            <span>{sqlDatabases.length} veritabani</span>
          </>
        }
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Veritabanlari</h3>
        </div>
        {/* Header */}
        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.6fr_0.6fr_1.2fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">VERITABANI</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCU</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">BOYUT</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">TABLO</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SON YEDEK</span>
        </div>
        {sqlDatabases.map((db) => (
          <div
            key={db.id}
            onClick={() => setSelectedDb(db.id)}
            className={`grid grid-cols-[1.5fr_1fr_0.8fr_0.6fr_0.6fr_1.2fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${
              selectedDb === db.id ? "bg-muted/30" : ""
            }`}
          >
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Database className="h-3 w-3 text-muted-foreground" />
              {db.name}
            </span>
            <span className="text-xs text-muted-foreground">{db.server}</span>
            <span className="text-xs tabular-nums">{formatSize(db.sizeMB)}</span>
            <span className="text-xs tabular-nums">{db.tables}</span>
            <StatusBadge status={db.status} />
            <span className="text-xs text-muted-foreground">{db.lastBackup}</span>
          </div>
        ))}
      </NestedCard>

      {/* Query Editor */}
      <div className="mt-3">
        <NestedCard
          footer={
            <>
              <Clock className="h-3 w-3" />
              <span>Mock mod - sorgular gercek calistirilmiyor</span>
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Sorgu Calistir</h3>
            <Button size="sm" className="rounded-[5px] text-xs gap-1 h-8">
              <Play className="h-3.5 w-3.5" />
              Calistir
            </Button>
          </div>
          <textarea
            className="w-full h-32 rounded-[5px] border border-border/40 bg-muted/20 p-3 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Mock Result */}
          <div className="mt-3 rounded-[5px] bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground mb-2">Sonuc (mock):</p>
            <div className="text-xs font-mono space-y-1">
              <div className="text-muted-foreground">| name | object_id | type |</div>
              <div className="text-muted-foreground">|------|-----------|------|</div>
              <div>| Users | 1234567 | U |</div>
              <div>| Orders | 1234568 | U |</div>
              <div>| Products | 1234569 | U |</div>
            </div>
          </div>
        </NestedCard>
      </div>
    </PageContainer>
  );
}
