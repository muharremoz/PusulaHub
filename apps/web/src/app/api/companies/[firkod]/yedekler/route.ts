/**
 * GET /api/companies/[firkod]/yedekler
 *
 * Firmanın veritabanlarının Spare Cloud (FTP) ve Cloudflare R2'deki yedekleri. İki kaynak ayrı ayrı
 * okunur; biri ulaşılamazsa diğeri yine döner (durum alanında neden yazar). Bkz. lib/firma-yedekleri.ts.
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import {
  birlestir, firmaVeritabanlari, ftpListele, ftpTanimli, r2Listele, r2Tanimli,
  type KaynakDurumu, type YedekDosyasi,
} from "@/lib/firma-yedekleri"

export interface FirmaYedekleriDto {
  veritabanlari: string[]
  ftp: KaynakDurumu
  r2:  KaynakDurumu
  dosyalar: YedekDosyasi[]
}

const hata = (err: unknown): KaynakDurumu => ({ durum: "hata", mesaj: err instanceof Error ? err.message : String(err) })

export async function GET(_req: Request, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("company-detail", "read")
  if (gate) return gate
  const { firkod } = await params
  if (!/^\d+$/.test(firkod)) return NextResponse.json({ error: "Geçersiz firma kodu" }, { status: 400 })

  const veritabanlari = await firmaVeritabanlari(firkod)
  const [f, r] = await Promise.allSettled([
    ftpTanimli() ? ftpListele(veritabanlari) : Promise.resolve(null),
    r2Tanimli() ? r2Listele(veritabanlari) : Promise.resolve(null),
  ])

  const ftp: KaynakDurumu = !ftpTanimli() ? { durum: "tanimsiz", mesaj: "Spare Cloud bağlantı bilgisi (SFTP_*) tanımlı değil" }
    : f.status === "fulfilled" ? { durum: "ok" } : hata(f.reason)
  const r2: KaynakDurumu = !r2Tanimli() ? { durum: "tanimsiz", mesaj: "R2 bağlantı bilgisi (R2_*) tanımlı değil" }
    : r.status === "fulfilled" ? { durum: "ok" } : hata(r.reason)

  const dto: FirmaYedekleriDto = {
    veritabanlari, ftp, r2,
    dosyalar: birlestir(
      f.status === "fulfilled" && f.value ? f.value : [],
      r.status === "fulfilled" && r.value ? r.value : [],
    ),
  }
  return NextResponse.json(dto)
}
