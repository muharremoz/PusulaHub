// PusulaBilgi.exe — BGInfo baslaticisi (terminaller, HKLM Run "PusulaBilgi").
//
// 1) Ayni klasordeki Bginfo64.exe'yi pusula.bgi ile calistirir ve bitmesini bekler.
// 2) Duvar kagidi yerlesimini "Doldur" yapar (WallpaperStyle=10, TileWallpaper=0) ve duvar kagidini yeniler.
//
// Neden (09.10.2026): BGInfo resmi oturum acilisindaki ekran boyutunda uretir ve HER ZAMAN "doseme"
// (TileWallpaper=1) ile koyar; bgi'deki yerlesim ayari bunu degistirmiyor (T4'te 0-7 denendi).
// Connect pencere buyuyunce uzak oturumun cozunurlugunu oturum icinde buyutuyor -> kucuk resim 2x2
// tekrarlaniyordu. "Doldur" ile resim ekrani kaplayacak sekilde buyur, tekrarlanmaz.
//
// Derleme (sunucuda, eski csc uyumlu — C# 5):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /optimize+ /out:PusulaBilgi.exe PusulaBilgi.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

static class PusulaBilgi
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SystemParametersInfo(int uiAction, int uiParam, string pvParam, int fWinIni);

    const int SPI_SETDESKWALLPAPER = 0x14;
    const int SPIF_UPDATEINIFILE = 0x01;
    const int SPIF_SENDCHANGE = 0x02;

    static int Main()
    {
        string klasor = AppDomain.CurrentDomain.BaseDirectory;
        string bginfo = Path.Combine(klasor, "Bginfo64.exe");
        string bgi = Path.Combine(klasor, "pusula.bgi");

        try
        {
            var psi = new ProcessStartInfo(bginfo, "\"" + bgi + "\" /timer:0 /nolicprompt /silent");
            psi.UseShellExecute = false;
            psi.WorkingDirectory = klasor;
            using (var p = Process.Start(psi))
            {
                p.WaitForExit(120000);
            }
        }
        catch { }

        try
        {
            using (var k = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", true))
            {
                if (k == null) return 1;
                string resim = k.GetValue("Wallpaper") as string;
                k.SetValue("WallpaperStyle", "10");
                k.SetValue("TileWallpaper", "0");
                if (!string.IsNullOrEmpty(resim))
                    SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, resim, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
            }
        }
        catch { return 1; }
        return 0;
    }
}
