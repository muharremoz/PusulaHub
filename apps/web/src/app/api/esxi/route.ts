import { NextResponse } from "next/server"
import { fetchEsxiBackups, fetchEsxiHost, esxiConfigured } from "@/lib/esxi"

/**
 * GET /api/esxi
 *
 * Fiziksel sunucunun (ESXi) donanım künyesi, anlık kullanım, güç kaynağı
 * sağlığı, veri deposu doluluğu ve sanal makinelerin imaj yedeği durumu.
 *
 * /tv bu ucu kullanıyor. Oturum zorunluluğu middleware'de: prod'da
 * çerezsiz istek zaten giriş sayfasına düşer, burada ayrıca
 * `requirePermission` YOK — TV panosu tek bir oturumla açılıyor ve
 * yanıt gizli bilgi taşımıyor (parola ya da anahtar değil, donanım
 * durumu). ESXi parolası yalnız sunucu tarafında, env'de kalıyor.
 *
 * Cache lib tarafında: host 60 sn, yedek listesi 5 dk. Bu uç her
 * istekte ESXi'ye gitmez.
 */
export async function GET() {
  if (!esxiConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "ESXi kimlik bilgileri tanımlı değil (ESXI_HOST / ESXI_USER / ESXI_PASSWORD)" },
      { status: 200 },
    )
  }

  try {
    /*  İkisi paralel: yedek listesi sanal makine sayısı kadar günlük
     *  okuduğu için host verisinden yavaş, birbirini beklemesinler.     */
    const [host, backups] = await Promise.all([
      fetchEsxiHost().catch(() => null),
      fetchEsxiBackups().catch(() => null),
    ])

    if (!host) {
      return NextResponse.json({ ok: false, reason: "ESXi'ye ulaşılamadı" }, { status: 200 })
    }

    const res = NextResponse.json({ ok: true, fetchedAt: new Date().toISOString(), host, backups })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[GET /api/esxi]", msg)
    return NextResponse.json({ ok: false, reason: msg }, { status: 200 })
  }
}
