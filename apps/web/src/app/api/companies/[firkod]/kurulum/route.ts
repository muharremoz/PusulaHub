/**
 * GET /api/companies/[firkod]/kurulum?kullanici=<ad>
 *
 * Bir kullanıcı için hazır kurulum paketi (.zip) üretir. İçinde:
 *   · PusulaKurulum.exe  — genel kurulum sihirbazı (değişmez)
 *   · ayarlar.ini        — o kullanıcıya özel değerler
 *
 * NEDEN ZIP, NEDEN TEK EXE DEĞİL: exe'ye ayar gömmek derleme gerektiriyor
 * (csc.exe) ve Hub Linux konteynerde çalışıyor — orada derleyici yok.
 * Kurulum programı bu yüzden yanındaki ayarlar.ini'yi okuyup gömülü
 * değerleri ezecek şekilde yazıldı; burada o mekanizma kullanılıyor.
 *
 * Paketteki exe NÖTR: içine gömülü şablonda müşteri/kullanıcı bilgisi yok,
 * hepsi ayarlar.ini'den geliyor.
 */

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { requirePermission } from "@/lib/require-permission"
import { getFirmaErisim } from "@/lib/firma-erisim"
import { createZip } from "@/lib/zip"

/** Sabitler — kurulum programının varsayılanlarıyla aynı. */
const VPN_SUNUCU = "vpn.pusulanet.net:17443"
const TUNEL_ADI  = "Pusula"
const MSI_URL    = "http://pusulanet.net/FortiClient.msi"

/*  Kullanıcı adı üretilen .ini'ye düz metin gidiyor. Satır sonu ya da "="
 *  geçerse dosyaya başka anahtar enjekte edilebilirdi (örneğin msiurl'i
 *  değiştirip kurulum dosyasını başka yerden indirtmek). Beyaz liste ile
 *  kesiyoruz — AD kullanıcı adlarında bu karakterler zaten yeterli.        */
const GUVENLI_AD = /^[A-Za-z0-9._-]{1,64}$/

/** Exe farklı çalışma dizinlerinde aranıyor: yerel dev ile konteyner farklı. */
async function exeYolunuBul(): Promise<string | null> {
  const adaylar = [
    path.join(process.cwd(), "kurulum", "PusulaKurulum.exe"),
    path.join(process.cwd(), "apps", "web", "kurulum", "PusulaKurulum.exe"),
  ]
  for (const y of adaylar) {
    try {
      await fs.access(y)
      return y
    } catch {
      /* sıradaki adaya bak */
    }
  }
  return null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  const kullanici = new URL(req.url).searchParams.get("kullanici")?.trim() ?? ""

  if (!GUVENLI_AD.test(kullanici))
    return NextResponse.json({ error: "Geçersiz kullanıcı adı" }, { status: 400 })

  try {
    const erisim = await getFirmaErisim(firkod)
    if (!erisim)
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })

    // RDP hedefi: DNS varsa o tercih edilir (IP değişse de kısayol çalışsın).
    const rdpHedef = erisim.windows?.dns || erisim.windows?.ip || ""
    if (!rdpHedef)
      return NextResponse.json(
        { error: "Firmaya RDP sunucusu atanmamış — paket üretilemez" },
        { status: 409 },
      )

    // Domain kısa adı: "pusuladc.local" -> "PUSULADC"
    const domain = (erisim.ad?.domain ?? "").split(".")[0].toUpperCase() || "PUSULADC"

    const ini = [
      `# ${firkod} / ${kullanici} icin uretildi - Pusula Hub`,
      `# Bu dosya PusulaKurulum.exe ile AYNI klasorde durmali.`,
      `# Icerik saf ASCII: musteri Not Defteri ile acabilir.`,
      ``,
      `firma     = ${firkod}`,
      `kullanici = ${kullanici}`,
      `vpn       = ${VPN_SUNUCU}`,
      `rdp       = ${rdpHedef}`,
      `tunel     = ${TUNEL_ADI}`,
      `domain    = ${domain}`,
      `msiurl    = ${MSI_URL}`,
      ``,
    ].join("\r\n")

    const exeYolu = await exeYolunuBul()
    if (!exeYolu)
      return NextResponse.json(
        { error: "Kurulum programı sunucuda bulunamadı" },
        { status: 500 },
      )

    const exe = await fs.readFile(exeYolu)

    // Tarih veriliyor: createZip varsayılanı 1980-01-01 ve müşteri paketi
    // "çok eski" görünüyor.
    const simdi = new Date()
    const zip = createZip([
      { name: "PusulaKurulum.exe", data: new Uint8Array(exe), date: simdi },
      { name: "ayarlar.ini", data: new TextEncoder().encode(ini), date: simdi },
    ])

    const dosyaAdi = `PusulaKurulum-${kullanici}.zip`

    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${dosyaAdi}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
