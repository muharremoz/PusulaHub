import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { psQuote, resolveCompanySites, siteAgent } from "@/lib/company-web-services"

/**
 * POST /api/companies/[firkod]/web-users/restart
 * Body: { siteName: string }
 *
 * Users.xml değiştikten sonra hizmeti yeniden başlatır. Uygulama dosyayı
 * AÇILIŞTA okuduğu için sadece dosyayı yazmak yetmiyor — worker process'in
 * yenilenmesi gerekiyor. Bu yüzden önce **app pool recycle**, sonra site
 * stop/start yapılıyor (yalnız site restart'ı worker'ı hep yenilemiyor).
 *
 * Neden `iis/action` değil: o uç siteyi `iis_sites.firma` kolonuyla doğruluyor,
 * hizmet sitelerinde bu kolon boş olabiliyor ve 403 dönüyor. Burada firma
 * eşlemesi `resolveCompanySites` ile yapılıyor (sihirbaz atamalarını da sayar).
 */

function buildRestartSite(siteName: string): string {
  const n = psQuote(siteName)
  return [
    `Import-Module WebAdministration -ErrorAction SilentlyContinue`,
    `$site='${n}'`,
    `$exists = $false`,
    `try{ if(Get-Website -Name $site -ErrorAction Stop){ $exists = $true } }catch{}`,
    `if(-not $exists){ Write-Output 'NOSITE' } else {` +
      `$pool = ''; ` +
      `try{ $pool = [string](Get-ItemProperty -Path ('IIS:\\Sites\\' + $site) -Name applicationPool -ErrorAction Stop).Value }catch{}; ` +
      // Worker process'i yenile — Users.xml açılışta okunuyor
      `if($pool){` +
        `try{ Restart-WebAppPool -Name $pool -ErrorAction Stop }catch{` +
          // Pool duruyorsa Restart hata verir; durdur-başlat ile topla
          `try{ Stop-WebAppPool -Name $pool -ErrorAction SilentlyContinue }catch{}; ` +
          `Start-Sleep -Milliseconds 500; ` +
          `try{ Start-WebAppPool -Name $pool -ErrorAction SilentlyContinue }catch{}` +
        `}` +
      `}; ` +
      `try{ Stop-Website -Name $site -ErrorAction SilentlyContinue }catch{}; ` +
      `Start-Sleep -Milliseconds 700; ` +
      `try{ Start-Website -Name $site -ErrorAction SilentlyContinue }catch{}; ` +
      `Start-Sleep -Milliseconds 500; ` +
      `$st = ''; try{ $st = [string](Get-WebsiteState -Name $site -ErrorAction Stop).Value }catch{}; ` +
      // Yakalanan hatalar stderr'e sızıp adımı yanlışlıkla hatalı göstermesin
      `$Error.Clear(); ` +
      `$global:LASTEXITCODE = 0; ` +
      `Write-Output ('STATE:' + $st)` +
    `}`,
  ].join("; ")
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Sunucuda servis durdurup başlatıyor — yazma yetkisi.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params

  try {
    const body = (await req.json()) as { siteName?: string }
    const siteName = body?.siteName?.trim() ?? ""
    if (!siteName) return NextResponse.json({ error: "siteName zorunludur" }, { status: 400 })

    const sb = await getSupabaseServer()
    const sites = await resolveCompanySites(sb, firkod)
    const site = sites.get(siteName.toLowerCase())
    if (!site) return NextResponse.json({ error: "Hizmet bu firmaya ait değil" }, { status: 403 })
    if (!site.server) return NextResponse.json({ error: "Hizmetin sunucusu bilinmiyor" }, { status: 400 })

    const srv = await siteAgent(sb, site.server)
    if (!srv?.ip || !srv.api_key) {
      return NextResponse.json({ error: "Sunucu agent bilgisi yok" }, { status: 400 })
    }

    const r = await execOnAgent(srv.ip, srv.agent_port ?? 8585, srv.api_key, buildRestartSite(site.name), 40)
    if (r.exitCode !== 0) {
      const why = r.timedOut ? "Sunucuya ulaşılamadı (zaman aşımı)" : (r.stderr?.trim() || "Agent komutu başarısız")
      return NextResponse.json({ error: why }, { status: 502 })
    }

    const out = (r.stdout ?? "").trim().split(/\r?\n/).pop()?.trim() ?? ""
    if (out === "NOSITE") {
      return NextResponse.json({ error: `IIS'te "${site.name}" sitesi bulunamadı` }, { status: 404 })
    }
    const state = out.startsWith("STATE:") ? out.slice(6).trim() : ""
    if (state !== "Started") {
      return NextResponse.json(
        { error: `Site yeniden başlatılamadı${state ? ` (durum: ${state})` : ""}` },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, state })
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users/restart]", err)
    return NextResponse.json({ error: "Hizmet yeniden başlatılamadı" }, { status: 500 })
  }
}
