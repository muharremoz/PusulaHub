"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { servers, sampleFiles } from "@/lib/mock-data";
import {
  FolderOpen,
  File,
  ChevronRight,
  Copy,
  Scissors,
  Trash2,
  Download,
  Upload,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function FilesPage() {
  const [selectedServer, setSelectedServer] = useState(servers[0].id);
  const [currentPath, setCurrentPath] = useState("C:\\");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const serverOptions = servers.filter((s) => s.status !== "offline");

  return (
    <PageContainer title="Dosya Yonetimi" description="Sunuculardaki dosya ve klasorleri yonetme">
      {/* Server selector + path */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center rounded-[8px] p-1 gap-0.5"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          {serverOptions.slice(0, 5).map((srv) => (
            <button
              key={srv.id}
              onClick={() => setSelectedServer(srv.id)}
              className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors ${
                selectedServer === srv.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {srv.name}
            </button>
          ))}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-3 text-xs text-muted-foreground">
        {currentPath.split("\\").filter(Boolean).map((part, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <button className="hover:text-foreground transition-colors">
              {part}
            </button>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_240px] gap-3">
        {/* File List */}
        <NestedCard
          footer={
            <>
              <FolderOpen className="h-3 w-3" />
              <span>{sampleFiles.length} oge</span>
            </>
          }
        >
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 mb-3">
            <Button variant="outline" size="sm" className="rounded-[5px] text-xs h-7 gap-1">
              <Plus className="h-3 w-3" /> Yeni Klasor
            </Button>
            <Button variant="outline" size="sm" className="rounded-[5px] text-xs h-7 gap-1">
              <Upload className="h-3 w-3" /> Yukle
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="rounded-[5px] text-xs h-7 w-7 p-0" disabled={!selectedFile}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="rounded-[5px] text-xs h-7 w-7 p-0" disabled={!selectedFile}>
                <Scissors className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="rounded-[5px] text-xs h-7 w-7 p-0" disabled={!selectedFile}>
                <Download className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="rounded-[5px] text-xs h-7 w-7 p-0 text-destructive" disabled={!selectedFile}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1.5fr_0.6fr_1fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">AD</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">BOYUT</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DEGISTIRILME</span>
          </div>

          {sampleFiles.map((item) => (
            <div
              key={item.name}
              onClick={() => setSelectedFile(item.name)}
              onDoubleClick={() => {
                if (item.type === "folder") {
                  setCurrentPath(currentPath + item.name + "\\");
                }
              }}
              className={`grid grid-cols-[1.5fr_0.6fr_1fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${
                selectedFile === item.name ? "bg-muted/30" : ""
              }`}
            >
              <span className="text-xs font-medium flex items-center gap-1.5">
                {item.type === "folder" ? (
                  <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <File className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {item.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.size ? formatBytes(item.size) : "-"}
              </span>
              <span className="text-xs text-muted-foreground">{item.modified}</span>
            </div>
          ))}
        </NestedCard>

        {/* Details Panel */}
        <NestedCard>
          <h3 className="text-sm font-semibold mb-3">Detaylar</h3>
          {selectedFile ? (
            <div className="space-y-2.5">
              {(() => {
                const file = sampleFiles.find((f) => f.name === selectedFile);
                if (!file) return null;
                return (
                  <>
                    <div className="flex items-center justify-center py-4">
                      {file.type === "folder" ? (
                        <FolderOpen className="h-12 w-12 text-amber-500" />
                      ) : (
                        <File className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Ad</p>
                      <p className="text-xs font-medium">{file.name}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Tur</p>
                      <p className="text-xs">{file.type === "folder" ? "Klasor" : "Dosya"}</p>
                    </div>
                    {file.size && (
                      <div>
                        <p className="text-[11px] text-muted-foreground">Boyut</p>
                        <p className="text-xs">{formatBytes(file.size)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-muted-foreground">Degistirilme</p>
                      <p className="text-xs">{file.modified}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Bir dosya veya klasor secin</p>
          )}
        </NestedCard>
      </div>
    </PageContainer>
  );
}
