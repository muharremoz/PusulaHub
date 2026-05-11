"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  ArrowRightLeft, Database, HardDrive, Upload, CheckCircle2, AlertCircle,
  Loader2, FileArchive, Folder, X,
} from "lucide-react"

interface TransferInfo {
  ok:                  boolean
  firmaId?:            string
  firmaName?:          string
  status?:             "pending" | "active" | "completed" | "cancelled" | "expired"
  createdAt?:          string
  expiresAt?:          string
  dataBytesTotal?:     number
  dataBytesReceived?:  number
  imageFilesTotal?:    number
  imageFilesReceived?: number
  imageBytesTotal?:    number
  imageBytesReceived?: number
  notes?:              string | null
  reason?:             string
}

function formatBytes(b: number): string {
  if (!b || b <= 0) return "0 B"
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

export default function CustomerTransferPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ""

  const [info, setInfo]       = useState<TransferInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!token) return
    try {
      const r = await fetch(`/api/aktarim/by-token/${token}/info`, { cache: "no-store" })
      const d = await r.json() as TransferInfo
      if (!r.ok) {
        setError(d.reason ?? "Bilinmeyen hata")
        setInfo(null)
      } else {
        setInfo(d)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "İstek başarısız")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    reload()
    const id = setInterval(reload, 3000)
    return () => clearInterval(id)
  }, [reload])

  // ── Yükleme henüz aktif değil — bir sonraki commit'te ekleyeceğiz ──
  // Şimdilik token validation + welcome ekranı

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-[12px] text-zinc-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor...
        </div>
      </div>
    )
  }

  if (error || !info?.ok) {
    const map: Record<string, { title: string; msg: string }> = {
      not_found:  { title: "Geçersiz link",       msg: "Bu aktarım linki bulunamadı veya silinmiş olabilir." },
      expired:    { title: "Süresi doldu",        msg: "Bu aktarımın süresi geçti. Lütfen yetkilinizden yeni link talep edin." },
      cancelled:  { title: "İptal edildi",        msg: "Bu aktarım iptal edilmiş." },
      completed:  { title: "Aktarım tamamlandı",  msg: "Bu aktarım daha önce tamamlandı. Yeni dosya yükleyemezsiniz." },
    }
    const e = map[error ?? ""] ?? { title: "Hata", msg: error ?? "Bilinmeyen hata" }
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md w-full rounded-[8px] border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-zinc-900 mb-1.5">{e.title}</h1>
          <p className="text-[13px] text-zinc-600">{e.msg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-white rounded-[8px] border border-zinc-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex items-center justify-center size-10 rounded-[8px] bg-[#1d64ff]/10">
              <ArrowRightLeft className="size-5 text-[#1d64ff]" strokeWidth={2.2} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Pusula Aktarım
              </div>
              <h1 className="text-[18px] font-semibold tracking-tight truncate">
                {info.firmaName}
              </h1>
            </div>
          </div>
          <p className="text-[12px] text-zinc-600 leading-relaxed">
            Veritabanı (.bak) ve resim klasörlerinizi bu sayfa üzerinden güvenli şekilde aktarabilirsiniz.
            Yükleme tamamlandığında ekibimiz devamını sağlayacak.
          </p>
          {info.notes && (
            <div className="mt-3 px-3 py-2 rounded-[5px] bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              {info.notes}
            </div>
          )}
        </div>

        {/* Veri (.bak) */}
        <div className="bg-white rounded-[8px] border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-zinc-700" />
            <h2 className="text-[13px] font-semibold">Veri Dosyası (.bak / .rar)</h2>
          </div>
          <UploadSlotPlaceholder
            icon={FileArchive}
            label="Veri dosyasını buraya bırakın veya tıklayıp seçin"
            received={info.dataBytesReceived ?? 0}
            total={info.dataBytesTotal ?? 0}
            disabledNote="Yükleme arayüzü bir sonraki güncellemede aktifleştirilecek."
          />
        </div>

        {/* Resimler */}
        <div className="bg-white rounded-[8px] border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="h-4 w-4 text-zinc-700" />
            <h2 className="text-[13px] font-semibold">Resim Klasörü</h2>
          </div>
          <UploadSlotPlaceholder
            icon={Folder}
            label="Resim klasörünü buraya sürükleyin (alt klasörlerle birlikte)"
            received={info.imageBytesReceived ?? 0}
            total={info.imageBytesTotal ?? 0}
            fileCount={`${info.imageFilesReceived ?? 0} / ${info.imageFilesTotal ?? 0} dosya`}
            disabledNote="Yükleme arayüzü bir sonraki güncellemede aktifleştirilecek."
          />
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-zinc-400 py-4">
          Aktarım kodu: <span className="font-mono">{token}</span>
        </div>
      </div>
    </div>
  )
}

function UploadSlotPlaceholder({
  icon: Icon,
  label,
  received,
  total,
  fileCount,
  disabledNote,
}: {
  icon: typeof FileArchive
  label: string
  received: number
  total: number
  fileCount?: string
  disabledNote?: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
  return (
    <div>
      <div className="border-2 border-dashed border-zinc-300 rounded-[5px] p-8 text-center bg-zinc-50/50 opacity-60 cursor-not-allowed">
        <Icon className="size-8 text-zinc-400 mx-auto mb-2" />
        <div className="text-[12px] text-zinc-500">{label}</div>
        {disabledNote && (
          <div className="mt-2 text-[10px] text-zinc-400 italic">{disabledNote}</div>
        )}
      </div>

      {total > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span className="tabular-nums">{formatBytes(received)} / {formatBytes(total)}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1d64ff] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {fileCount && (
            <div className="text-[10px] text-zinc-500">{fileCount}</div>
          )}
        </div>
      )}
    </div>
  )
}
