/**
 * SQL hatalı giriş özeti (29.10.2026) — CRM mobil Güvenlik sekmesi
 * (/api/hub/sql-giris) ve TV panosu (/api/tv/sql-giris) aynı veriyi kullanır.
 * Veri lib/sql-giris-izleme.ts toplayıcısından (hub.sql_giris_hatalari).
 */

import { getSupabaseAdmin } from "./supabase/admin"
import { kaynakAdi, kaynakTuru, NEDEN_AD, seviyeBul, sunucuAdlari, yoksayilir, type Neden, type Seviye } from "./sql-giris-izleme"

interface OzetSatir { gun: string | null; ip: string; kullanici: string; neden: Neden; veritabani: string; adet: number; son: string }

const SIRA: Record<Seviye, number> = { guvenlik: 0, destek: 1, bilgi: 2 }

/** Son 24 saat + son 7 gün özeti, etkin susturmalar. `sinir` = en çok satır. Hata olursa fırlatır. */
export async function sqlGirisOzetiHazirla(sinir = 60) {
  const sb = getSupabaseAdmin().schema("hub")
  const simdi = Date.now()
  const [son24, gunluk, okuma, sunucular, sustur] = await Promise.all([
    sb.rpc("sql_giris_ozet", { p_since: new Date(simdi - 24 * 3600_000).toISOString(), p_gun_basi: false }),
    sb.rpc("sql_giris_ozet", { p_since: new Date(simdi - 7 * 24 * 3600_000).toISOString(), p_gun_basi: true }),
    sb.from("sql_giris_bildirim").select("son_bildirim").eq("anahtar", "__okuma").maybeSingle(),
    sunucuAdlari(),
    sb.from("sql_giris_sustur").select("kapsam, bitis, kim").gt("bitis", new Date(simdi).toISOString()).order("bitis"),
  ])
  if (son24.error) throw new Error(son24.error.message)

  /*  Toplayıcı bunları artık kaydetmiyor; bu filtre yalnız 30.10.2026
   *  öncesinden kalan kayıtlar için (7 günlük pencere dolunca gereksiz). */
  const satirlar0 = ((son24.data ?? []) as OzetSatir[]).filter((x) => !yoksayilir(x))

  // Kullanıcı adının firma öneki ("3284.altinsaray1") → firma adı
  const kodlar = [...new Set(satirlar0.map((x) => x.kullanici.match(/^(\d+)\./)?.[1]).filter((x): x is string => !!x))]
  const { data: firmalar } = kodlar.length
    ? await sb.from("companies").select("company_id, name").in("company_id", kodlar)
    : { data: [] }
  const firmaAd = new Map(((firmalar ?? []) as { company_id: string; name: string }[]).map((f) => [String(f.company_id), f.name]))

  const satirlar = satirlar0
    .map((x) => {
      const adet = Number(x.adet)
      return {
        seviye: seviyeBul({ ...x, adet }, sunucular),
        kaynak: kaynakAdi(x.ip, sunucular),
        kaynakTuru: kaynakTuru(x.ip, sunucular),
        ip: x.ip,
        kullanici: x.kullanici,
        firma: firmaAd.get(x.kullanici.match(/^(\d+)\./)?.[1] ?? "") ?? null,
        neden: x.neden,
        nedenAd: NEDEN_AD[x.neden] ?? x.neden,
        veritabani: x.veritabani || null,
        adet,
        son: x.son,
      }
    })
    .sort((a, b) => SIRA[a.seviye] - SIRA[b.seviye] || Date.parse(b.son) - Date.parse(a.son))

  const ozet = { guvenlik: 0, destek: 0, bilgi: 0, toplam: 0 }
  for (const x of satirlar) { ozet[x.seviye] += x.adet; ozet.toplam += x.adet }

  const gunMap = new Map<string, { gun: string; guvenlik: number; destek: number; bilgi: number }>()
  for (const x of ((gunluk.data ?? []) as OzetSatir[]).filter((x) => !yoksayilir(x))) {
    const g = String(x.gun)
    const v = gunMap.get(g) ?? { gun: g, guvenlik: 0, destek: 0, bilgi: 0 }
    v[seviyeBul({ ...x, adet: Number(x.adet) }, sunucular)] += Number(x.adet)
    gunMap.set(g, v)
  }

  return {
    okuma: (okuma.data as { son_bildirim: string } | null)?.son_bildirim ?? null,
    ozet,
    satirlar: satirlar.slice(0, sinir),
    /** Etkin susturmalar — push gitmez, kayıt sürer */
    susturmalar: (sustur.data ?? []) as { kapsam: string; bitis: string; kim: string | null }[],
    gunluk: [...gunMap.values()].sort((a, b) => a.gun.localeCompare(b.gun)),
    zaman: new Date().toISOString(),
  }
}

export type SqlGirisOzeti = Awaited<ReturnType<typeof sqlGirisOzetiHazirla>>
