import { NextResponse } from "next/server"
import { readFile, stat } from "fs/promises"
import path from "path"
import { requirePermission } from "@/lib/require-permission"
import { createZip, type ZipEntry } from "@/lib/zip"

/**
 * GET /api/agent/download?os=windows|linux
 *
 * Sunucuya kurulacak agent dosyalarını tek ZIP olarak indirir.
 * Kaynak: repo'daki `apps/agent/<os>/` — build'e kopyalanmaz, çalışma
 * anında diskten okunur (dosyalar birkaç KB).
 *
 * ⚠ Deploy notu: Coolify `base_directory: /apps/web` ile çalıştığı için
 * `apps/agent` dizini container'da bulunmayabilir. Bu yüzden birkaç aday
 * yol denenir; hiçbiri yoksa 503 + açıklayıcı mesaj döner (sessizce boş
 * ZIP üretmez).
 */

export const dynamic = "force-dynamic"

/** Her platform için pakete girecek dosyalar. */
const DOSYALAR: Record<string, string[]> = {
  windows: ["KUR.bat", "PusulaAgent.cs", "PusulaNotify.cs"],
  linux:   ["install.sh", "pusul-agent.py"],
}

/** `apps/agent/<os>` dizinini bulmayı dener. */
async function agentDiziniBul(os: string): Promise<string | null> {
  const cwd = process.cwd()
  const adaylar = [
    path.join(cwd, "..", "agent", os),              // cwd = apps/web (normal)
    path.join(cwd, "..", "..", "apps", "agent", os), // cwd = apps/web/.next vb.
    path.join(cwd, "apps", "agent", os),             // cwd = repo kökü
  ]
  for (const dizin of adaylar) {
    try {
      const s = await stat(dizin)
      if (s.isDirectory()) return dizin
    } catch {
      // yok, sıradakini dene
    }
  }
  return null
}

export async function GET(req: Request) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate

  const os = new URL(req.url).searchParams.get("os") ?? "windows"
  const dosyalar = DOSYALAR[os]
  if (!dosyalar) {
    return NextResponse.json(
      { error: "Geçersiz platform", gecerli: Object.keys(DOSYALAR) },
      { status: 400 },
    )
  }

  const dizin = await agentDiziniBul(os)
  if (!dizin) {
    return NextResponse.json(
      { error: `Agent dosyaları sunucuda bulunamadı (apps/agent/${os}). Deploy paketine dahil edilmemiş olabilir.` },
      { status: 503 },
    )
  }

  try {
    const entries: ZipEntry[] = []
    for (const ad of dosyalar) {
      const tam = path.join(dizin, ad)
      const [icerik, bilgi] = await Promise.all([readFile(tam), stat(tam)])
      entries.push({ name: ad, data: new Uint8Array(icerik), date: bilgi.mtime })
    }

    // Kurulum adımlarını arşive ekle — indiren kişi ayrıca doküman aramasın.
    entries.push({
      name: "OKUBENI.txt",
      data: new TextEncoder().encode(TALIMAT[os]),
      date: new Date(),
    })

    const zip = createZip(entries)
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="pusula-agent-${os}.zip"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[GET /api/agent/download]", err)
    return NextResponse.json({ error: "Agent paketi hazırlanamadı" }, { status: 500 })
  }
}

const TALIMAT: Record<string, string> = {
  windows: `PusulaAgent - Windows Kurulumu
================================

1) Bu klasordeki UC dosyayi da hedef sunucuya kopyalayin:
     KUR.bat
     PusulaAgent.cs
     PusulaNotify.cs

2) KUR.bat dosyasina sag tiklayip "Yonetici olarak calistir" secin.

   Script sunlari yapar:
     - Iki C# dosyasini csc.exe ile derler
     - Varsa eski PusulaAgent servisini durdurur ve siler
     - Windows Service olarak kurar (start= auto -> sunucu yeniden baslasa da calisir)
     - Firewall kurali ve URL ACL ekler (varsayilan port 8585)
     - Servisi baslatir

3) Agent ilk acilista config.json uretir ve bir API Key olusturur.
   Bu anahtari agent'in kurulum ekranindan kopyalayin.

4) PusulaHub -> Sunucular -> Yeni Sunucu ekranindaki
   "Agent Bilgileri" bolumune API Key ve Port degerlerini girin.
   Bu degerler agent'taki config.json ile BIREBIR ayni olmalidir,
   aksi halde Hub agent'a baglanamaz (401).

Not: Sunucularda eski .NET Framework csc.exe bulunabilir. Kaynak kod
C# 6.0+ ozellikleri kullanmaz; dosyalari duzenlerken bu kurala uyun.
`,
  linux: `PusulaAgent - Linux Kurulumu
=============================

1) Iki dosyayi da hedef sunucuya kopyalayin:
     install.sh
     pusul-agent.py

2) Kurulumu root olarak calistirin:
     chmod +x install.sh
     sudo ./install.sh

3) Kurulum sonrasi uretilen API Key ve port degerlerini
   PusulaHub -> Sunucular -> Yeni Sunucu ekranindaki
   "Agent Bilgileri" bolumune girin.
`,
}
