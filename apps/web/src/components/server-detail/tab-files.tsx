"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Folder,
  File,
  ChevronRight,
  HardDrive,
  RefreshCw,
  AlertCircle,
  MoreVertical,
  Download,
  Eye,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FileItem, FilesResponse } from "@/app/api/servers/[id]/files/route";

interface Props {
  serverId: string;
}

const IMAGE_EXTS = new Set([
  "jpg","jpeg","png","gif","bmp","webp","svg","ico","tiff",
]);
const TEXT_EXTS = new Set([
  "txt","log","xml","json","csv","ini","cfg","conf","md",
  "ts","tsx","js","cs","ps1","bat","cmd","sql","yaml","yml",
  "html","htm","css","config",
]);

type FileType = "image" | "text" | "other";

function getFileType(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  return "other";
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatModified(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface PreviewState {
  name: string;
  filePath: string;
  type: "image" | "text";
}

export function TabFiles({ serverId }: Props) {
  const [path, setPath]       = useState("C:\\");
  const [items, setItems]     = useState<FileItem[]>([]);
  const [drives, setDrives]   = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [activeDrive, setActiveDrive] = useState("C");

  // Preview state
  const [preview, setPreview]           = useState<PreviewState | null>(null);
  const [previewText, setPreviewText]   = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Per-row download loading
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const fetchFiles = useCallback(
    async (targetPath: string) => {
      setLoading(true);
      setError(null);
      try {
        const res  = await fetch(`/api/servers/${serverId}/files?path=${encodeURIComponent(targetPath)}`);
        const data: FilesResponse & { error?: string } = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? "Dosya listesi alınamadı");
          setItems([]);
        } else {
          setItems(data.items);
          if (data.drives.length > 0 && drives.length === 0) {
            setDrives(data.drives);
          }
        }
      } catch {
        setError("Sunucuya bağlanılamadı");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverId]
  );

  useEffect(() => {
    fetchFiles(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateTo = (newPath: string) => {
    setPath(newPath);
    fetchFiles(newPath);
  };

  const handleDriveClick = (drive: string) => {
    setActiveDrive(drive);
    const newPath = `${drive}:\\`;
    setPath(newPath);
    fetchFiles(newPath);
  };

  const handleFolderClick = (item: FileItem) => {
    const separator = path.endsWith("\\") ? "" : "\\";
    navigateTo(`${path}${separator}${item.name}`);
  };

  const fullFilePath = (item: FileItem) => {
    const sep = path.endsWith("\\") ? "" : "\\";
    return `${path}${sep}${item.name}`;
  };

  const handleDownload = async (item: FileItem) => {
    const fp = fullFilePath(item);
    setDownloadingFile(item.name);
    try {
      const url = `/api/servers/${serverId}/files/content?path=${encodeURIComponent(fp)}&mode=download`;
      const a   = document.createElement("a");
      a.href     = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloadingFile(null), 1000);
    }
  };

  const handlePreview = async (item: FileItem) => {
    const fp   = fullFilePath(item);
    const type = getFileType(item.name);
    if (type === "other") return;

    setPreview({ name: item.name, filePath: fp, type });
    setPreviewText("");
    setPreviewError(null);

    if (type === "text") {
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/servers/${serverId}/files/content?path=${encodeURIComponent(fp)}&mode=preview`
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setPreviewError(d.error ?? "Dosya okunamadı");
        } else {
          const text = await res.text();
          setPreviewText(text);
        }
      } catch {
        setPreviewError("Bağlantı hatası");
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const breadcrumbParts = path.split(/[\\\/]/).filter(Boolean);

  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      const newPath = `${breadcrumbParts[0]}\\`;
      navigateTo(newPath);
      setActiveDrive(breadcrumbParts[0].replace(":", "").toUpperCase());
      return;
    }
    const newPath = breadcrumbParts.slice(0, index + 1).join("\\") + "\\";
    navigateTo(newPath);
  };

  const previewUrl = preview
    ? `/api/servers/${serverId}/files/content?path=${encodeURIComponent(preview.filePath)}&mode=preview`
    : "";

  return (
    <>
      <div className="space-y-2">
        {/* Toolbar */}
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px] px-3 py-2 flex items-center gap-2"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            {/* Drive buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {drives.length === 0 ? (
                <div className="flex gap-1">
                  <Skeleton className="h-6 w-10 rounded-[5px]" />
                  <Skeleton className="h-6 w-10 rounded-[5px]" />
                </div>
              ) : (
                drives.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDriveClick(d)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium transition-colors",
                      activeDrive === d
                        ? "bg-foreground text-background"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <HardDrive className="size-3" />
                    {d}:
                  </button>
                ))
              )}
            </div>

            <div className="h-4 w-px bg-border/50 shrink-0" />

            {/* Breadcrumb */}
            <div className="flex items-center gap-0.5 text-[11px] flex-1 min-w-0 overflow-hidden">
              {breadcrumbParts.map((part, i) => (
                <span key={i} className="flex items-center gap-0.5 shrink-0">
                  {i > 0 && <ChevronRight className="size-3 text-muted-foreground/50" />}
                  <button
                    onClick={() => handleBreadcrumbClick(i)}
                    className={cn(
                      "hover:underline transition-colors",
                      i === breadcrumbParts.length - 1
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchFiles(path)}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] text-muted-foreground hover:bg-muted/60 transition-colors shrink-0"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            </button>
          </div>
          <div className="h-2" />
        </div>

        {/* File list */}
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px] overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            {error ? (
              <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-destructive justify-center">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            ) : loading ? (
              <div className="divide-y divide-border/40">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-3.5 rounded shrink-0" />
                    <Skeleton className="h-3 rounded flex-1 max-w-[240px]" />
                    <Skeleton className="h-3 rounded w-20 ml-auto" />
                    <Skeleton className="h-3 rounded w-28" />
                    <Skeleton className="size-5 rounded" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
                Bu klasör boş
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                    <TableHead className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground h-8 pl-3">
                      Ad
                    </TableHead>
                    <TableHead className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground h-8 w-28 text-right">
                      Boyut
                    </TableHead>
                    <TableHead className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground h-8 w-40 text-right">
                      Değiştirilme
                    </TableHead>
                    <TableHead className="h-8 w-8 pr-2" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {items.map((item) => {
                    const fileType    = item.isDir ? null : getFileType(item.name);
                    const previewable = fileType === "image" || fileType === "text";
                    const isDownloading = downloadingFile === item.name;

                    return (
                      <TableRow
                        key={item.name}
                        className={cn(
                          "hover:bg-muted/20 transition-colors",
                          item.isDir && "cursor-pointer"
                        )}
                        onClick={() => item.isDir && handleFolderClick(item)}
                      >
                        <TableCell className="py-2 pl-3">
                          <div className="flex items-center gap-2">
                            {item.isDir ? (
                              <Folder className="size-3.5 text-amber-500 shrink-0" />
                            ) : (
                              <File className="size-3.5 text-muted-foreground/60 shrink-0" />
                            )}
                            <span className={cn("text-[11px]", item.isDir && "font-medium")}>
                              {item.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-[11px] text-muted-foreground text-right tabular-nums">
                          {item.isDir ? "" : formatSize(item.size)}
                        </TableCell>
                        <TableCell className="py-2 text-[11px] text-muted-foreground text-right">
                          {formatModified(item.modified)}
                        </TableCell>
                        <TableCell className="py-2 pr-2 text-right">
                          {!item.isDir && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center justify-center size-6 rounded-[4px] hover:bg-muted/60 text-muted-foreground transition-colors ml-auto"
                                >
                                  {isDownloading ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <MoreVertical className="size-3.5" />
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="rounded-[6px] min-w-[140px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {previewable && (
                                  <DropdownMenuItem
                                    className="text-xs flex items-center gap-2 cursor-pointer"
                                    onClick={() => handlePreview(item)}
                                  >
                                    <Eye className="size-3.5" />
                                    Önizle
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-xs flex items-center gap-2 cursor-pointer"
                                  onClick={() => handleDownload(item)}
                                >
                                  <Download className="size-3.5" />
                                  İndir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Footer */}
          {!loading && !error && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground">
              <Folder className="size-3" />
              {items.filter((i) => i.isDir).length} klasör,{" "}
              {items.filter((i) => !i.isDir).length} dosya
            </div>
          )}
          <div className="h-2" />
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent
          className="rounded-[8px] p-0 gap-0 overflow-hidden"
          style={{
            maxWidth: preview?.type === "image" ? "90vw" : "860px",
            width: "90vw",
          }}
        >
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold flex items-center gap-2">
              {preview?.type === "image" ? (
                <Eye className="size-4 text-muted-foreground" />
              ) : (
                <File className="size-4 text-muted-foreground" />
              )}
              {preview?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            {preview?.type === "image" && (
              <div className="flex items-center justify-center p-4 bg-muted/20 min-h-[200px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={preview.name}
                  className="max-h-[70vh] max-w-full rounded-[4px] object-contain"
                  onError={() => setPreviewError("Görsel yüklenemedi")}
                />
                {previewError && (
                  <div className="flex items-center gap-2 text-[12px] text-destructive">
                    <AlertCircle className="size-4" />
                    {previewError}
                  </div>
                )}
              </div>
            )}

            {preview?.type === "text" && (
              <ScrollArea className="h-[65vh]">
                {previewLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : previewError ? (
                  <div className="flex items-center gap-2 text-[12px] text-destructive p-6">
                    <AlertCircle className="size-4 shrink-0" />
                    {previewError}
                  </div>
                ) : (
                  <pre className="p-4 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all text-foreground/90">
                    {previewText}
                  </pre>
                )}
              </ScrollArea>
            )}
          </div>

          {/* Dialog footer with download button */}
          <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
            <button
              onClick={() => preview && handleDownload({ name: preview.name, isDir: false, size: null, modified: "" })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[11px] font-medium bg-muted/60 hover:bg-muted text-foreground transition-colors"
            >
              <Download className="size-3.5" />
              İndir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
