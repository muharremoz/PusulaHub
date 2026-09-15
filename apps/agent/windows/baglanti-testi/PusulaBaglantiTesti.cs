/* ================================================================
   PusulaBaglantiTesti — RDP oturumu içinden çalışan bağlantı testi

   Müşteri "sunucu yavaş" dediği anda terminal sunucusundaki masaüstü
   kısayolundan çalıştırır. 30 saniye (uzun test: 60) boyunca KENDİ oturumunun Windows
   RDP sayaçlarını (RemoteFX Network / Graphics, User Input Delay) ve
   sunucu yükünü ölçer; yavaşlığın sunucudan mı bağlantıdan mı
   kaynaklandığını gösterir. Sonuç rapor koduyla
   C:\ProgramData\Pusula\BaglantiTesti\ altına JSON olarak yazılır.

   Derleme (DERLE.bat):
     csc /nologo /target:winexe /optimize+ /codepage:65001
         /r:System.Windows.Forms.dll /r:System.Drawing.dll
         /out:PusulaBaglantiTesti.exe PusulaBaglantiTesti.cs

   Not: Eski csc (C# 5) uyumlu yazıldı — $"", ?., => gövde yok.
   Tasarım önizlemesi: PusulaBaglantiTesti.exe --onizleme <cikti.png>
================================================================ */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Pusula Bağlantı Testi")]
[assembly: AssemblyProduct("PusulaHub")]
[assembly: AssemblyVersion("1.2.0.0")]

namespace PusulaBaglantiTesti
{

/* ================================================================
   OTURUM BİLGİSİ — kendi oturumumuz (WTS_CURRENT_SESSION)
================================================================ */
static class Oturum
{
    [DllImport("wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool WTSQuerySessionInformation(IntPtr hServer, int sessionId, int infoClass,
        out IntPtr buffer, out int bytesReturned);

    [DllImport("wtsapi32.dll")]
    static extern void WTSFreeMemory(IntPtr memory);

    const int WTS_CURRENT_SESSION = -1;
    const int WTSUserName = 5, WTSWinStationName = 6, WTSDomainName = 7, WTSClientName = 10, WTSClientAddress = 14;

    public static int Id { get { return Process.GetCurrentProcess().SessionId; } }

    static string Metin(int sinif)
    {
        IntPtr buf; int n;
        try
        {
            if (!WTSQuerySessionInformation(IntPtr.Zero, WTS_CURRENT_SESSION, sinif, out buf, out n)) return "";
            try { return Marshal.PtrToStringUni(buf) ?? ""; }
            finally { WTSFreeMemory(buf); }
        }
        catch { return ""; }
    }

    public static string Kullanici { get { string u = Metin(WTSUserName); return u != "" ? u : Environment.UserName; } }
    public static string Istasyon { get { return Metin(WTSWinStationName); } }
    public static string IstemciAdi { get { return Metin(WTSClientName); } }

    public static string IstemciIp
    {
        get
        {
            IntPtr buf; int n;
            try
            {
                if (!WTSQuerySessionInformation(IntPtr.Zero, WTS_CURRENT_SESSION, WTSClientAddress, out buf, out n)) return "";
                try
                {
                    int aile = Marshal.ReadInt32(buf);
                    if (aile != 2) return ""; // yalnız IPv4
                    // WTS_CLIENT_ADDRESS.Address: sockaddr_in'in port sonrası baytları (2..5)
                    return string.Format("{0}.{1}.{2}.{3}",
                        Marshal.ReadByte(buf, 4 + 2), Marshal.ReadByte(buf, 4 + 3),
                        Marshal.ReadByte(buf, 4 + 4), Marshal.ReadByte(buf, 4 + 5));
                }
                finally { WTSFreeMemory(buf); }
            }
            catch { return ""; }
        }
    }

    // "RDP-Tcp#17" -> sayaç örneği "rdp-tcp 17"
    public static string SayacOrnegi
    {
        get
        {
            string ist = Istasyon;
            if (string.IsNullOrEmpty(ist)) return "";
            return ist.Replace("#", " ").ToLowerInvariant();
        }
    }
}

/* ================================================================
   SAYAÇ OKUMA — eksik sayaç test durdurmaz, null döner
================================================================ */
class Sayac
{
    PerformanceCounter _pc;

    public Sayac(string kategori, string sayac, string ornek)
    {
        try
        {
            if (!PerformanceCounterCategory.Exists(kategori)) return;
            var kat = new PerformanceCounterCategory(kategori);
            string bulunan = null;
            if (string.IsNullOrEmpty(ornek)) bulunan = "";
            else
                foreach (string ad in kat.GetInstanceNames())
                    if (string.Equals(ad, ornek, StringComparison.OrdinalIgnoreCase)) { bulunan = ad; break; }
            if (bulunan == null) return;
            _pc = new PerformanceCounter(kategori, sayac, bulunan, true);
            _pc.NextValue(); // oran sayaçlarının ilk okuması 0 döner
        }
        catch { _pc = null; }
    }

    public bool Var { get { return _pc != null; } }

    public double? Oku()
    {
        if (_pc == null) return null;
        try { return _pc.NextValue(); }
        catch { return null; }
    }
}

class Seri
{
    public readonly List<double> Degerler = new List<double>();
    public bool Olculdu { get { return Degerler.Count > 0; } }
    public void Ekle(double? v) { if (v.HasValue && !double.IsNaN(v.Value)) Degerler.Add(v.Value); }

    public double Ort { get { if (!Olculdu) return 0; double t = 0; foreach (var d in Degerler) t += d; return t / Degerler.Count; } }
    public double Max { get { double m = 0; foreach (var d in Degerler) if (d > m) m = d; return m; } }
    public double Toplam { get { double t = 0; foreach (var d in Degerler) t += d; return t; } }

    // Ardışık örnekler arası ortalama mutlak fark (dalgalanma)
    public double Dalgalanma
    {
        get
        {
            if (Degerler.Count < 2) return 0;
            double t = 0;
            for (int i = 1; i < Degerler.Count; i++) t += Math.Abs(Degerler[i] - Degerler[i - 1]);
            return t / (Degerler.Count - 1);
        }
    }
}

enum Durum { Iyi, Orta, Zayif, Bilinmiyor }

class Satir
{
    public string Etiket, Deger;
    public Durum Durum;
    public Satir(string e, string d, Durum s) { Etiket = e; Deger = d; Durum = s; }
}

class Sonuc
{
    public string Kod, Kullanici, Istasyon, IstemciIp, IstemciAdi, Sunucu;
    public DateTime Zaman;
    public int OturumId;
    public int SureSn;

    public Seri Rtt = new Seri(), Bant = new Seri(), Kayip = new Seri(), Yeniden = new Seri();
    public Seri RttUdp = new Seri(), BazUdpRtt = new Seri(), BantUdp = new Seri(), UdpPaket = new Seri();
    public Seri UdpGonder = new Seri(), TcpGonder = new Seri();

    // Taşıma türü veri akışından belirlenir: görüntü verisi UDP'den akıyorsa UDP.
    // (Sunucu TCP'ye zorladığında da bağlantı başında UDP denemesi yapılır; Base UDP RTT
    // dolar ama veri TCP'den akar — bu durumda oturum TCP sayılmalı.)
    public bool UdpKullaniliyor { get { return UdpGonder.Ort > 0 && UdpGonder.Ort > TcpGonder.Ort * 2; } }

    static bool HepsiAyni(Seri s, double v) { if (!s.Olculdu) return false; foreach (var d in s.Degerler) if (d != v) return false; return true; }

    // TCP sayaçları Windows başlangıç değerlerinde (400 ms / 512 Kbps) kaldıysa ölçüm yapılmamıştır
    public bool TcpVarsayilan { get { return HepsiAyni(Rtt, 400) && HepsiAyni(Bant, 512); } }

    // TCP ölçülmediyse ama bağlantı başındaki UDP denemesi gecikme ölçtüyse onu kullan
    public bool BaslangicOlcumu { get { return !UdpKullaniliyor && TcpVarsayilan && BazUdpRtt.Max > 0; } }

    // Görüntü oranları için yeterli kare akmış mı (boşta oturumda 1/2 gibi yanıltıcı oranlar çıkmasın)
    public bool KareYeterli { get { return CiktiKare.Toplam + AtlaAg.Toplam + AtlaSunucu.Toplam + AtlaIstemci.Toplam >= 30; } }

    public Seri EtkinRtt
    {
        get
        {
            if (BaslangicOlcumu) return BazUdpRtt;
            if (!UdpKullaniliyor) return Rtt;
            return RttUdp.Max > 0 ? RttUdp : BazUdpRtt;
        }
    }

    public Seri EtkinBant
    {
        get
        {
            if (!UdpKullaniliyor) return Bant;
            // UDP bant sayacı ölçüm oturmadan anlamsız büyük değer dönebiliyor (ör. 2783181384)
            var s = new Seri();
            foreach (var v in BantUdp.Degerler) if (v > 0 && v < 10000000) s.Degerler.Add(v);
            return s;
        }
    }
    public Seri CiktiKare = new Seri(), AtlaAg = new Seri(), AtlaSunucu = new Seri(), AtlaIstemci = new Seri();
    public Seri GirisGecikme = new Seri();
    public Seri Cpu = new Seri(), Ram = new Seri(), Disk = new Seri(), Kuyruk = new Seri();

    public Durum SunucuDurum, BaglantiDurum, IstemciDurum;
    public List<Satir> SunucuSatirlar = new List<Satir>(), BaglantiSatirlar = new List<Satir>();
    public string Hukum, Oneri;

    static double Oran(Seri atlanan, Seri cikti)
    {
        double a = atlanan.Toplam, c = cikti.Toplam;
        if (a + c <= 0) return 0;
        return 100.0 * a / (a + c);
    }

    // İstemci ağ otomatik algılamayı yapmazsa Windows sabit başlangıç değerleri
    // raporlar (RTT 400 ms, bant 512 Kbps). Bunlar ölçüm değildir; "zayıf" sayılmamalı.
    public bool VarsayilanDegerler
    {
        get
        {
            return !UdpKullaniliyor && TcpVarsayilan && BazUdpRtt.Max <= 0;
        }
    }

    public double AgAtlamaOrani { get { return Oran(AtlaAg, CiktiKare); } }
    public double SunucuAtlamaOrani { get { return Oran(AtlaSunucu, CiktiKare); } }
    public double IstemciAtlamaOrani { get { return Oran(AtlaIstemci, CiktiKare); } }

    static Durum Kotu(Durum a, Durum b)
    {
        if (a == Durum.Bilinmiyor) return b;
        if (b == Durum.Bilinmiyor) return a;
        return (int)a > (int)b ? a : b;
    }

    static string Ms(double v) { return Math.Round(v).ToString("0", CultureInfo.InvariantCulture) + " ms"; }
    static string Yuzde(double v) { return "%" + Math.Round(v).ToString("0", CultureInfo.InvariantCulture); }
    static string Mbps(double kbps)
    {
        double m = kbps / 1000.0;
        return (m >= 10 ? m.ToString("0", CultureInfo.GetCultureInfo("tr-TR")) : m.ToString("0.0", CultureInfo.GetCultureInfo("tr-TR"))) + " Mbps";
    }

    public void Degerlendir()
    {
        // ---------- SUNUCU ----------
        SunucuDurum = Durum.Iyi;
        if (Cpu.Olculdu)
        {
            Durum d = Cpu.Ort > 90 ? Durum.Zayif : Cpu.Ort > 75 ? Durum.Orta : Durum.Iyi;
            SunucuSatirlar.Add(new Satir("İşlemci", Yuzde(Cpu.Ort) + "  ·  maks " + Yuzde(Cpu.Max), d));
            SunucuDurum = Kotu(SunucuDurum, d);
        }
        if (Ram.Olculdu)
        {
            Durum d = Ram.Ort > 95 ? Durum.Zayif : Ram.Ort > 88 ? Durum.Orta : Durum.Iyi;
            SunucuSatirlar.Add(new Satir("Bellek", Yuzde(Ram.Ort), d));
            SunucuDurum = Kotu(SunucuDurum, d);
        }
        if (Disk.Olculdu)
        {
            double ms = Disk.Ort * 1000;
            Durum d = ms > 60 ? Durum.Zayif : ms > 25 ? Durum.Orta : Durum.Iyi;
            SunucuSatirlar.Add(new Satir("Disk yanıt süresi", Ms(ms), d));
            SunucuDurum = Kotu(SunucuDurum, d);
        }
        if (GirisGecikme.Olculdu)
        {
            Durum d = GirisGecikme.Max > 200 ? Durum.Zayif : GirisGecikme.Max > 80 ? Durum.Orta : Durum.Iyi;
            SunucuSatirlar.Add(new Satir("Tıklamaya yanıt", Ms(GirisGecikme.Max), d));
            SunucuDurum = Kotu(SunucuDurum, d);
        }
        if (CiktiKare.Olculdu && KareYeterli)
        {
            double o = SunucuAtlamaOrani;
            Durum d = o > 15 ? Durum.Zayif : o > 5 ? Durum.Orta : Durum.Iyi;
            SunucuSatirlar.Add(new Satir("Sunucu kaynaklı atlanan görüntü", Yuzde(o), d));
            SunucuDurum = Kotu(SunucuDurum, d);
        }
        if (SunucuSatirlar.Count == 0) SunucuDurum = Durum.Bilinmiyor;

        // ---------- BAĞLANTI ----------
        BaglantiDurum = Durum.Bilinmiyor;
        Seri rtt = EtkinRtt, bant = EtkinBant;
        if (VarsayilanDegerler)
        {
            BaglantiSatirlar.Add(new Satir("Gecikme ve bağlantı hızı", "ölçülemedi", Durum.Bilinmiyor));
        }
        else if (rtt.Olculdu && rtt.Max > 0)
        {
            string tur = UdpKullaniliyor ? " (UDP)" : BaslangicOlcumu ? " (bağlantı başı)" : "";
            Durum d = rtt.Ort > 150 ? Durum.Zayif : rtt.Ort > 70 ? Durum.Orta : Durum.Iyi;
            BaglantiSatirlar.Add(new Satir("Gecikme" + tur, Ms(rtt.Ort) + "  ·  maks " + Ms(rtt.Max), d));
            BaglantiDurum = Kotu(BaglantiDurum, d);

            if (!BaslangicOlcumu && !(UdpKullaniliyor && RttUdp.Max <= 0))
            {
                Durum dj = rtt.Dalgalanma > 60 ? Durum.Zayif : rtt.Dalgalanma > 25 ? Durum.Orta : Durum.Iyi;
                BaglantiSatirlar.Add(new Satir("Dalgalanma", Ms(rtt.Dalgalanma), dj));
                BaglantiDurum = Kotu(BaglantiDurum, dj);
            }
        }
        if (Kayip.Olculdu)
        {
            double k = Math.Max(Kayip.Ort, Yeniden.Olculdu ? Yeniden.Ort : 0);
            Durum d = k > 3 ? Durum.Zayif : k > 1 ? Durum.Orta : Durum.Iyi;
            BaglantiSatirlar.Add(new Satir("Paket kaybı", "%" + k.ToString("0.0", CultureInfo.GetCultureInfo("tr-TR")), d));
            BaglantiDurum = Kotu(BaglantiDurum, d);
        }
        if (!VarsayilanDegerler && !BaslangicOlcumu && bant.Olculdu && bant.Max > 0)
        {
            Durum d = bant.Ort < 1000 ? Durum.Zayif : bant.Ort < 3000 ? Durum.Orta : Durum.Iyi;
            BaglantiSatirlar.Add(new Satir("Bağlantı hızı", Mbps(bant.Ort), d));
            BaglantiDurum = Kotu(BaglantiDurum, d);
        }
        if (CiktiKare.Olculdu && KareYeterli)
        {
            double o = AgAtlamaOrani;
            Durum d = o > 15 ? Durum.Zayif : o > 5 ? Durum.Orta : Durum.Iyi;
            BaglantiSatirlar.Add(new Satir("Bağlantı kaynaklı atlanan görüntü", Yuzde(o), d));
            BaglantiDurum = Kotu(BaglantiDurum, d);
        }

        IstemciDurum = Durum.Iyi;
        if (CiktiKare.Olculdu && KareYeterli)
        {
            double o = IstemciAtlamaOrani;
            IstemciDurum = o > 15 ? Durum.Zayif : o > 5 ? Durum.Orta : Durum.Iyi;
            if (IstemciDurum != Durum.Iyi)
                BaglantiSatirlar.Add(new Satir("Bilgisayarınız kaynaklı atlanan görüntü", Yuzde(o), IstemciDurum));
        }

        // ---------- HÜKÜM ----------
        bool sunucuIyi = SunucuDurum == Durum.Iyi;
        bool baglantiKotu = BaglantiDurum == Durum.Zayif || BaglantiDurum == Durum.Orta;

        if (VarsayilanDegerler && sunucuIyi && !baglantiKotu)
            { Hukum = "Sunucu normal çalışıyor. Görüntü aktarımında kayıp yok. Gecikme ölçülemedi: kullandığınız " +
                    "Uzak Masaüstü programı bağlantı ölçümü yapmıyor (Windows'un kendi Uzak Masaüstü Bağlantısı ile deneyin)."; Oneri = "Windows'un kendi Uzak Masaüstü Bağlantısı (mstsc) ile bağlanıp testi tekrar çalıştırın."; }
        else if (BaglantiDurum == Durum.Bilinmiyor && sunucuIyi)
            { Hukum = "Sunucu normal çalışıyor. Bağlantı ölçümü bu oturumda alınamadı; lütfen testi tekrar edin."; Oneri = "Pencereyi kapatıp testi yeniden başlatın. Sorun sürerse rapor kodunu destek ekibine iletin."; }
        else if (sunucuIyi && baglantiKotu)
            { Hukum = "Sunucu normal çalışıyor. Yaşadığınız yavaşlık internet / ağ bağlantınızdan kaynaklanıyor."; Oneri = "Öneri: Modem ve Wi-Fi bağlantınızı kontrol edin; mümkünse kablolu bağlanın. Aynı ağda yoğun indirme veya görüntülü görüşme yapan cihaz olup olmadığına bakın. Sorun sürerse internet servis sağlayıcınızla görüşün."; }
        else if (sunucuIyi && IstemciDurum != Durum.Iyi)
            { Hukum = "Sunucu ve bağlantı normal. Yavaşlık kullandığınız bilgisayarın görüntüyü işleyememesinden kaynaklanıyor."; Oneri = "Öneri: Bilgisayarınızda açık olan diğer programları kapatın; Uzak Masaüstü penceresini daha küçük bir çözünürlükte açmayı deneyin."; }
        else if (sunucuIyi)
            { Hukum = "Sunucu ve bağlantınız şu anda normal görünüyor."; Oneri = "Yavaşlık yeniden yaşandığında testi tam o anda çalıştırın; sonuç o anki durumu gösterir."; }
        else if (baglantiKotu)
            { Hukum = "Hem sunucu yükünde hem bağlantınızda sorun görüldü. Rapor kodunu Pusula destek ekibine iletin."; Oneri = "Rapor kodunu Pusula destek ekibine iletin; sunucu tarafını inceleyeceğiz. Bağlantınızı da kablolu olarak kontrol edin."; }
        else
            { Hukum = "Sunucu tarafında yük görüldü, bağlantınız normal. Rapor kodunu Pusula destek ekibine iletin."; Oneri = "Rapor kodunu Pusula destek ekibine iletin; sunucu tarafını inceleyeceğiz."; }
    }

    public string Metin()
    {
        var sb = new StringBuilder();
        sb.AppendLine("PUSULA BAĞLANTI TESTİ");
        sb.AppendLine("Rapor kodu : " + Kod);
        sb.AppendLine("Zaman      : " + Zaman.ToString("dd.MM.yyyy HH:mm:ss"));
        sb.AppendLine("Kullanıcı  : " + Kullanici + "  (" + Sunucu + ")");
        if (IstemciIp != "") sb.AppendLine("İstemci    : " + IstemciIp + (IstemciAdi != "" ? " / " + IstemciAdi : ""));
        sb.AppendLine();
        sb.AppendLine("SUNUCU: " + DurumYazi(SunucuDurum));
        foreach (var s in SunucuSatirlar) sb.AppendLine("  " + s.Etiket + ": " + s.Deger);
        sb.AppendLine();
        sb.AppendLine("BAĞLANTINIZ: " + DurumYazi(BaglantiDurum));
        foreach (var s in BaglantiSatirlar) sb.AppendLine("  " + s.Etiket + ": " + s.Deger);
        sb.AppendLine();
        sb.AppendLine("SONUÇ: " + Hukum);
        if (!string.IsNullOrEmpty(Oneri)) sb.AppendLine(Oneri);
        return sb.ToString();
    }

    public static string DurumYazi(Durum d)
    {
        switch (d)
        {
            case Durum.Iyi: return "İYİ";
            case Durum.Orta: return "ORTA";
            case Durum.Zayif: return "ZAYIF";
            default: return "ÖLÇÜLEMEDİ";
        }
    }

    static string J(string s)
    {
        if (s == null) return "\"\"";
        return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n") + "\"";
    }
    static string N(double v) { return Math.Round(v, 2).ToString(CultureInfo.InvariantCulture); }
    static string S(Seri s)
    {
        if (!s.Olculdu) return "null";
        return "{\"ort\":" + N(s.Ort) + ",\"max\":" + N(s.Max) + ",\"dalga\":" + N(s.Dalgalanma) + ",\"n\":" + s.Degerler.Count + "}";
    }

    public string Json()
    {
        var sb = new StringBuilder();
        sb.Append("{");
        sb.Append("\"kod\":" + J(Kod) + ",");
        sb.Append("\"zaman\":" + J(Zaman.ToString("yyyy-MM-ddTHH:mm:ss")) + ",");
        sb.Append("\"sunucu\":" + J(Sunucu) + ",");
        sb.Append("\"kullanici\":" + J(Kullanici) + ",");
        sb.Append("\"oturumId\":" + OturumId + ",");
        sb.Append("\"sureSn\":" + SureSn + ",");
        sb.Append("\"istasyon\":" + J(Istasyon) + ",");
        sb.Append("\"istemciIp\":" + J(IstemciIp) + ",");
        sb.Append("\"istemciAdi\":" + J(IstemciAdi) + ",");
        sb.Append("\"sunucuDurum\":" + J(DurumYazi(SunucuDurum)) + ",");
        sb.Append("\"baglantiDurum\":" + J(DurumYazi(BaglantiDurum)) + ",");
        sb.Append("\"hukum\":" + J(Hukum) + ",");
        sb.Append("\"oneri\":" + J(Oneri) + ",");
        sb.Append("\"surum\":\"1.2.0\",");
        sb.Append("\"agAlgilamaKapali\":" + (VarsayilanDegerler ? "true" : "false") + ",");
        sb.Append("\"tasima\":" + J(UdpKullaniliyor ? "UDP" : "TCP") + ",");
        sb.Append("\"udp\":{\"rttMs\":" + S(RttUdp) + ",\"bazRttMs\":" + S(BazUdpRtt) + ",\"bantKbps\":" + S(BantUdp) + ",\"paketSn\":" + S(UdpPaket) + ",\"udpGonderBps\":" + S(UdpGonder) + ",\"tcpGonderBps\":" + S(TcpGonder) + "},");
        sb.Append("\"baslangicOlcumu\":" + (BaslangicOlcumu ? "true" : "false") + ",\"kareYeterli\":" + (KareYeterli ? "true" : "false") + ",");
        sb.Append("\"olcum\":{");
        sb.Append("\"rttMs\":" + S(Rtt) + ",\"bantKbps\":" + S(Bant) + ",\"kayipYuzde\":" + S(Kayip) + ",\"yenidenGonderimYuzde\":" + S(Yeniden) + ",");
        sb.Append("\"ciktiKareSn\":" + S(CiktiKare) + ",\"atlananAgSn\":" + S(AtlaAg) + ",\"atlananSunucuSn\":" + S(AtlaSunucu) + ",\"atlananIstemciSn\":" + S(AtlaIstemci) + ",");
        sb.Append("\"agAtlamaYuzde\":" + N(AgAtlamaOrani) + ",\"sunucuAtlamaYuzde\":" + N(SunucuAtlamaOrani) + ",\"istemciAtlamaYuzde\":" + N(IstemciAtlamaOrani) + ",");
        sb.Append("\"girisGecikmeMs\":" + S(GirisGecikme) + ",\"cpuYuzde\":" + S(Cpu) + ",\"ramYuzde\":" + S(Ram) + ",\"diskSn\":" + S(Disk) + ",\"islemciKuyrugu\":" + S(Kuyruk));
        sb.Append("}}");
        return sb.ToString();
    }
}

/* ================================================================
   ÖLÇÜM
================================================================ */
static class Olcum
{
    [StructLayout(LayoutKind.Sequential)]
    class MEMORYSTATUSEX
    {
        public uint dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
        public uint dwMemoryLoad;
        public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX m);

    public const int VarsayilanSn = 30, UzunSn = 60;

    public static Sonuc Calistir(int sureSn, Action<int> ilerleme)
    {
        var r = new Sonuc();
        r.Zaman = DateTime.Now;
        r.Kod = KodUret();
        r.Kullanici = Oturum.Kullanici;
        r.OturumId = Oturum.Id;
        r.Istasyon = Oturum.Istasyon;
        r.IstemciIp = Oturum.IstemciIp;
        r.IstemciAdi = Oturum.IstemciAdi;
        r.Sunucu = Environment.MachineName;

        string ornek = Oturum.SayacOrnegi;
        string oturum = r.OturumId.ToString(CultureInfo.InvariantCulture);

        var rtt = new Sayac("RemoteFX Network", "Current TCP RTT", ornek);
        var bant = new Sayac("RemoteFX Network", "Current TCP Bandwidth", ornek);
        var rttUdp = new Sayac("RemoteFX Network", "Current UDP RTT", ornek);
        var bazUdp = new Sayac("RemoteFX Network", "Base UDP RTT", ornek);
        var bantUdp = new Sayac("RemoteFX Network", "Current UDP Bandwidth", ornek);
        var udpPaket = new Sayac("RemoteFX Network", "UDP Packets Received/sec", ornek);
        var udpGonder = new Sayac("RemoteFX Network", "UDP Sent Rate", ornek);
        var tcpGonder = new Sayac("RemoteFX Network", "TCP Sent Rate", ornek);
        var kayip = new Sayac("RemoteFX Network", "Loss Rate", ornek);
        var yeniden = new Sayac("RemoteFX Network", "Retransmission Rate", ornek);
        var cikti = new Sayac("RemoteFX Graphics", "Output Frames/Second", ornek);
        var atlaAg = new Sayac("RemoteFX Graphics", "Frames Skipped/Second - Insufficient Network Resources", ornek);
        var atlaSunucu = new Sayac("RemoteFX Graphics", "Frames Skipped/Second - Insufficient Server Resources", ornek);
        var atlaIstemci = new Sayac("RemoteFX Graphics", "Frames Skipped/Second - Insufficient Client Resources", ornek);
        var giris = new Sayac("User Input Delay per Session", "Max Input Delay", oturum);
        var cpu = new Sayac("Processor Information", "% Processor Utility", "_Total");
        if (!cpu.Var) cpu = new Sayac("Processor", "% Processor Time", "_Total");
        var disk = new Sayac("PhysicalDisk", "Avg. Disk sec/Transfer", "_Total");
        var kuyruk = new Sayac("System", "Processor Queue Length", "");

        r.SureSn = sureSn;
        for (int i = 0; i < sureSn; i++)
        {
            Thread.Sleep(1000);
            r.Rtt.Ekle(rtt.Oku());
            r.Bant.Ekle(bant.Oku());
            r.RttUdp.Ekle(rttUdp.Oku());
            r.BazUdpRtt.Ekle(bazUdp.Oku());
            r.BantUdp.Ekle(bantUdp.Oku());
            r.UdpPaket.Ekle(udpPaket.Oku());
            r.UdpGonder.Ekle(udpGonder.Oku());
            r.TcpGonder.Ekle(tcpGonder.Oku());
            r.Kayip.Ekle(kayip.Oku());
            r.Yeniden.Ekle(yeniden.Oku());
            r.CiktiKare.Ekle(cikti.Oku());
            r.AtlaAg.Ekle(atlaAg.Oku());
            r.AtlaSunucu.Ekle(atlaSunucu.Oku());
            r.AtlaIstemci.Ekle(atlaIstemci.Oku());
            r.GirisGecikme.Ekle(giris.Oku());
            double? c = cpu.Oku();
            if (c.HasValue) r.Cpu.Ekle(Math.Min(100, c.Value));
            r.Disk.Ekle(disk.Oku());
            r.Kuyruk.Ekle(kuyruk.Oku());
            var m = new MEMORYSTATUSEX();
            if (GlobalMemoryStatusEx(m)) r.Ram.Ekle(m.dwMemoryLoad);
            if (ilerleme != null) ilerleme(i + 1);
        }

        r.Degerlendir();
        Kaydet(r);
        return r;
    }

    static string KodUret()
    {
        const string harf = "ABCDEFGHJKLMNPRSTUVYZ23456789";
        var rnd = new Random();
        var sb = new StringBuilder("BT-");
        for (int i = 0; i < 5; i++) sb.Append(harf[rnd.Next(harf.Length)]);
        return sb.ToString();
    }

    public static string KayitHatasi;

    static void Kaydet(Sonuc r)
    {
        try
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Pusula\\BaglantiTesti");
            string guvenliAd = r.Kullanici;
            foreach (char ch in Path.GetInvalidFileNameChars()) guvenliAd = guvenliAd.Replace(ch, '_');
            string ad = r.Zaman.ToString("yyyyMMdd_HHmmss") + "_" + guvenliAd + "_" + r.Kod + ".json";
            File.WriteAllText(Path.Combine(dir, ad), r.Json(), new UTF8Encoding(false));
        }
        catch (Exception ex) { KayitHatasi = ex.Message; }
    }
}


/* ================================================================
   ARAYÜZ — Pusula Import tasarım dili
   Mor başlık şeridi, beyaz sol adım paneli, #F8F9FC içerik zemini,
   yuvarlak köşeli beyaz kartlar, altta aksiyon çubuğu.
================================================================ */
static class Tema
{
    public static readonly Color Marka = Color.FromArgb(0x51, 0x3B, 0xD3);
    public static readonly Color MarkaKoyu = Color.FromArgb(0x3A, 0x29, 0xB0);
    public static readonly Color MarkaSoluk = Color.FromArgb(0xB9, 0xAF, 0xF0);
    public static readonly Color Hover = Color.FromArgb(0xF3, 0xF0, 0xFF);
    public static readonly Color Zemin = Color.FromArgb(0xF8, 0xF9, 0xFC);
    public static readonly Color Kart = Color.White;
    public static readonly Color Kenar = Color.FromArgb(0xE5, 0xE7, 0xEB);
    public static readonly Color KenarAcik = Color.FromArgb(0xEB, 0xEB, 0xF0);
    public static readonly Color Yazi = Color.FromArgb(0x11, 0x18, 0x27);
    public static readonly Color Yazi2 = Color.FromArgb(0x6B, 0x72, 0x80);
    public static readonly Color Soluk = Color.FromArgb(0x9C, 0xA3, 0xAF);
    public static readonly Color Basari = Color.FromArgb(0x10, 0xB9, 0x81);
    public static readonly Color Uyari = Color.FromArgb(0xF5, 0x9E, 0x0B);
    public static readonly Color Hata = Color.FromArgb(0xEF, 0x44, 0x44);

    public static Color Renk(Durum d)
    {
        switch (d) { case Durum.Iyi: return Basari; case Durum.Orta: return Uyari; case Durum.Zayif: return Hata; default: return Soluk; }
    }

    public static GraphicsPath Yuvarlak(RectangleF r, float yc)
    {
        var p = new GraphicsPath();
        float d = yc * 2;
        if (d > r.Height) d = r.Height;
        if (d > r.Width) d = r.Width;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    public static Font F(float boy, bool kalin) { return new Font(kalin ? "Segoe UI Semibold" : "Segoe UI", boy, GraphicsUnit.Point); }
}


static class TR
{
    static readonly Bitmap _olcu = new Bitmap(1, 1);

    static StringFormat Bicim(TextFormatFlags b)
    {
        var sf = new StringFormat(StringFormat.GenericTypographic);
        sf.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;
        if ((b & TextFormatFlags.HorizontalCenter) != 0) sf.Alignment = StringAlignment.Center;
        if ((b & TextFormatFlags.VerticalCenter) != 0) sf.LineAlignment = StringAlignment.Center;
        if ((b & TextFormatFlags.WordBreak) == 0) sf.FormatFlags |= StringFormatFlags.NoWrap;
        return sf;
    }

    public static void DrawText(Graphics g, string s, Font f, Rectangle r, Color c, TextFormatFlags b)
    {
        using (var br = new SolidBrush(c)) using (var sf = Bicim(b)) g.DrawString(s, f, br, r, sf);
    }

    public static void DrawText(Graphics g, string s, Font f, Point p, Color c, TextFormatFlags b)
    {
        using (var br = new SolidBrush(c)) using (var sf = Bicim(b)) g.DrawString(s, f, br, p, sf);
    }

    public static Size MeasureText(string s, Font f)
    {
        lock (_olcu)
            using (var g = Graphics.FromImage(_olcu))
            using (var sf = Bicim(TextFormatFlags.Default))
                return Size.Ceiling(g.MeasureString(s, f, 10000, sf));
    }
}

// Import'taki "Bağlantıyı Test Et" (çerçeveli) ve "İleri" (dolu) düğmeleri
class Dugme : Control
{
    public bool Ana;
    bool _uzerinde;

    public Dugme(string metin, bool ana)
    {
        Text = metin; Ana = ana;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint |
                 ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
        Cursor = Cursors.Hand;
        Size = new Size(150, 40);
        BackColor = Color.White;
    }

    protected override void OnMouseEnter(EventArgs e) { _uzerinde = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _uzerinde = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }
    protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(Parent != null ? Parent.BackColor : Color.White);
        var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        Color metin;
        using (var p = Tema.Yuvarlak(r, 7))
        {
            if (Ana)
            {
                Color zemin = !Enabled ? Tema.MarkaSoluk : _uzerinde ? Tema.MarkaKoyu : Tema.Marka;
                using (var b = new SolidBrush(zemin)) g.FillPath(b, p);
                metin = Color.White;
            }
            else
            {
                using (var b = new SolidBrush(_uzerinde && Enabled ? Tema.Hover : Color.White)) g.FillPath(b, p);
                using (var pen = new Pen(Enabled ? Tema.Marka : Tema.MarkaSoluk, 1.5f)) g.DrawPath(pen, p);
                metin = Enabled ? Tema.Marka : Tema.MarkaSoluk;
            }
        }
        using (var f = Tema.F(10f, true))
        {
            TR.DrawText(g, Text, f, new Rectangle(0, 0, Width, Height), metin,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        }
    }
}

class AnaForm : Form
{
    const int W = 1000, H = 640, Baslik = 40, Kenarlik = 250, Alt = 72;

    public Sonuc Sonuc;
    int _saniye;
    bool _calisiyor;
    float _faz;
    int _baslikHover = -1; // 0 = küçült, 1 = kapat
    readonly System.Windows.Forms.Timer _anim;
    readonly Dugme _tekrar, _kopyala, _uzun;
    int _sure = Olcum.VarsayilanSn;
    readonly Icon _ikon;

    string _kullanici, _sunucu, _istemci;

    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int wp, int lp);

    public AnaForm()
    {
        Text = "Pusula Bağlantı Testi";
        FormBorderStyle = FormBorderStyle.None;
        AutoScaleMode = AutoScaleMode.None;
        ClientSize = new Size(W, H);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Tema.Zemin;
        Font = Tema.F(9.5f, false);
        DoubleBuffered = true;
        try { _ikon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); Icon = _ikon; } catch { }

        _kullanici = Oturum.Kullanici;
        _sunucu = Environment.MachineName;
        _istemci = Oturum.IstemciIp;
        string ad = Oturum.IstemciAdi;
        if (ad != "") _istemci = _istemci == "" ? ad : _istemci + "  ·  " + ad;

        _tekrar = new Dugme("Tekrar Test Et", true) { Location = new Point(W - 32 - 150, H - Alt + 16), BackColor = Color.White };
        _uzun = new Dugme("Uzun Test (60 sn)", false) { Location = new Point(W - 32 - 150 - 12 - 150 - 12 - 150, H - Alt + 16), BackColor = Color.White };
        _uzun.Click += delegate { Baslat(Olcum.UzunSn); };
        Controls.Add(_uzun);
        _kopyala = new Dugme("Sonucu Kopyala", false) { Location = new Point(W - 32 - 150 - 12 - 150, H - Alt + 16), BackColor = Color.White };
        _tekrar.Click += delegate { Baslat(Olcum.VarsayilanSn); };
        _kopyala.Click += delegate
        {
            if (Sonuc == null) return;
            try { Clipboard.SetText(Sonuc.Metin()); _kopyala.Text = "Kopyalandı ✓"; }
            catch { _kopyala.Text = "Kopyalanamadı"; }
        };
        Controls.Add(_tekrar);
        Controls.Add(_kopyala);

        _anim = new System.Windows.Forms.Timer { Interval = 33 };
        _anim.Tick += delegate { _faz += 0.06f; Invalidate(new Rectangle(Kenarlik, Baslik, W - Kenarlik, H - Baslik - Alt)); };

        Shown += delegate { if (Sonuc == null && !_calisiyor) Baslat(Olcum.VarsayilanSn); };
    }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ClassStyle |= 0x20000; /* CS_DROPSHADOW */ cp.Style |= 0x20000; /* WS_MINIMIZEBOX */ return cp; }
    }

    Rectangle KucultAlan { get { return new Rectangle(W - 92, 0, 46, Baslik); } }
    Rectangle KapatAlan { get { return new Rectangle(W - 46, 0, 46, Baslik); } }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        int h = KapatAlan.Contains(e.Location) ? 1 : KucultAlan.Contains(e.Location) ? 0 : -1;
        if (h != _baslikHover) { _baslikHover = h; Invalidate(new Rectangle(W - 92, 0, 92, Baslik)); }
        base.OnMouseMove(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        if (_baslikHover != -1) { _baslikHover = -1; Invalidate(new Rectangle(W - 92, 0, 92, Baslik)); }
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left && e.Y < Baslik)
        {
            if (KapatAlan.Contains(e.Location)) { Close(); return; }
            if (KucultAlan.Contains(e.Location)) { WindowState = FormWindowState.Minimized; return; }
            ReleaseCapture();
            SendMessage(Handle, 0xA1 /* WM_NCLBUTTONDOWN */, 2 /* HTCAPTION */, 0);
            return;
        }
        base.OnMouseDown(e);
    }

    void Baslat(int sure)
    {
        if (_calisiyor) return;
        _calisiyor = true;
        _sure = sure;
        Sonuc = null;
        _saniye = 0;
        _tekrar.Enabled = _kopyala.Enabled = _uzun.Enabled = false;
        _kopyala.Text = "Sonucu Kopyala";
        _anim.Start();
        Invalidate();
        var t = new Thread(delegate ()
        {
            Sonuc s = null;
            try { s = Olcum.Calistir(sure, delegate (int sn) { BeginInvoke((MethodInvoker)delegate { _saniye = sn; Invalidate(new Rectangle(0, Baslik, Kenarlik, H)); }); }); }
            catch { }
            BeginInvoke((MethodInvoker)delegate
            {
                Sonuc = s;
                _calisiyor = false;
                _anim.Stop();
                _tekrar.Enabled = _uzun.Enabled = true;
                _kopyala.Enabled = s != null;
                Invalidate();
            });
        });
        t.IsBackground = true;
        t.Start();
    }

    public void OnizlemeSonuc(Sonuc s)
    {
        Sonuc = s; _kullanici = s.Kullanici; _sunucu = s.Sunucu; _istemci = s.IstemciIp + "  ·  " + s.IstemciAdi;
        _tekrar.Enabled = _kopyala.Enabled = _uzun.Enabled = true;
    }

    public void OnizlemeOlcum(int sn)
    {
        _calisiyor = true; _saniye = sn; _faz = 1.3f; _sure = Olcum.VarsayilanSn;
        _kullanici = "4626.mimra1"; _sunucu = "PUSULARDP3"; _istemci = "172.22.202.43  ·  MIMRA-KASA";
        _tekrar.Enabled = _kopyala.Enabled = _uzun.Enabled = false;
    }

    // ------------------------------------------------------------ çizim
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

        BaslikCiz(g);
        KenarCiz(g);
        AltCiz(g);

        if (_calisiyor || Sonuc == null) OlcumCiz(g);
        else SonucCiz(g);
    }

    void Yaz(Graphics g, string s, Font f, Color c, float x, float y)
    {
        TR.DrawText(g, s, f, new Point((int)x, (int)y), c, TextFormatFlags.NoPadding);
    }

    void BaslikCiz(Graphics g)
    {
        using (var b = new SolidBrush(Tema.Marka)) g.FillRectangle(b, 0, 0, W, Baslik);
        if (_ikon != null)
            using (var ic = new Icon(_ikon, 20, 20)) g.DrawIcon(ic, new Rectangle(14, 10, 20, 20));
        using (var f = Tema.F(10f, true)) Yaz(g, "Pusula Bağlantı Testi", f, Color.White, 46, 11);

        if (_baslikHover == 0) using (var b = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillRectangle(b, KucultAlan);
        if (_baslikHover == 1) using (var b = new SolidBrush(Color.FromArgb(0xE8, 0x11, 0x23))) g.FillRectangle(b, KapatAlan);
        using (var pen = new Pen(Color.White, 1.2f))
        {
            var k = KucultAlan; g.DrawLine(pen, k.X + 18, 20, k.X + 28, 20);
            var c = KapatAlan; g.DrawLine(pen, c.X + 18, 15, c.X + 28, 25); g.DrawLine(pen, c.X + 28, 15, c.X + 18, 25);
        }
    }

    void KenarCiz(Graphics g)
    {
        using (var b = new SolidBrush(Color.White)) g.FillRectangle(b, 0, Baslik, Kenarlik, H - Baslik);
        using (var pen = new Pen(Tema.KenarAcik)) g.DrawLine(pen, Kenarlik - 1, Baslik, Kenarlik - 1, H);

        using (var f = new Font("Segoe UI", 20f, FontStyle.Bold)) Yaz(g, "Pusula", f, Tema.Marka, 24, 70);
        using (var f = Tema.F(9.5f, false)) Yaz(g, "Bağlantı Testi", f, Tema.Soluk, 27, 108);
        using (var pen = new Pen(Tema.KenarAcik)) g.DrawLine(pen, 18, 142, Kenarlik - 18, 142);

        bool bitti = !_calisiyor && Sonuc != null;
        AdimCiz(g, 168, 1, "Ölçüm", _calisiyor ? "İzleniyor · " + _saniye + " / " + _sure + " sn" : "Sunucu ve bağlantı izlendi",
            bitti ? 2 : 1);
        using (var pen = new Pen(Tema.Kenar, 2f)) g.DrawLine(pen, 42, 206, 42, 226);
        AdimCiz(g, 228, 2, "Sonuç", "Yavaşlığın kaynağı", bitti ? 1 : 0);

        // Oturum bilgisi
        float y = 318;
        using (var pen = new Pen(Tema.KenarAcik)) g.DrawLine(pen, 18, y - 18, Kenarlik - 18, y - 18);
        using (var fe = Tema.F(7.5f, true))
        using (var fd = Tema.F(9.5f, false))
        {
            BilgiCiz(g, fe, fd, ref y, "KULLANICI", _kullanici);
            BilgiCiz(g, fe, fd, ref y, "SUNUCU", _sunucu);
            if (!string.IsNullOrEmpty(_istemci)) BilgiCiz(g, fe, fd, ref y, "BAĞLANAN CİHAZ", _istemci);
        }

        using (var f = Tema.F(8.5f, false)) Yaz(g, "v1.2.0", f, Tema.Soluk, 24, H - 34);
    }

    void BilgiCiz(Graphics g, Font fe, Font fd, ref float y, string etiket, string deger)
    {
        Yaz(g, etiket, fe, Tema.Soluk, 24, y);
        Yaz(g, deger, fd, Tema.Yazi, 24, y + 16);
        y += 48;
    }

    // durum: 0 = bekliyor, 1 = etkin, 2 = tamamlandı
    void AdimCiz(Graphics g, int y, int no, string baslik, string alt, int durum)
    {
        var daire = new RectangleF(24, y, 36, 36);
        if (durum == 0)
        {
            using (var b = new SolidBrush(Color.White)) g.FillEllipse(b, daire);
            using (var pen = new Pen(Tema.Kenar, 2f)) g.DrawEllipse(pen, daire);
        }
        else using (var b = new SolidBrush(Tema.Marka)) g.FillEllipse(b, daire);

        string icerik = durum == 2 ? "✓" : no.ToString(CultureInfo.InvariantCulture);
        using (var f = Tema.F(10f, true))
            TR.DrawText(g, icerik, f, Rectangle.Round(daire), durum == 0 ? Tema.Soluk : Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);

        using (var f = Tema.F(10f, durum == 1))
            Yaz(g, baslik, f, durum == 1 ? Tema.Marka : durum == 2 ? Tema.Yazi : Tema.Yazi2, 74, y + 1);
        using (var f = Tema.F(8.5f, false)) Yaz(g, alt, f, Tema.Soluk, 74, y + 20);
    }

    void AltCiz(Graphics g)
    {
        using (var b = new SolidBrush(Color.White)) g.FillRectangle(b, Kenarlik, H - Alt, W - Kenarlik, Alt);
        using (var pen = new Pen(Tema.KenarAcik)) g.DrawLine(pen, Kenarlik, H - Alt, W, H - Alt);
        string metin = _calisiyor || Sonuc == null ? "Adım 1 / 2" : "Rapor kodu:  " + Sonuc.Kod;
        using (var f = Tema.F(9.5f, Sonuc != null && !_calisiyor))
            Yaz(g, metin, f, Sonuc != null && !_calisiyor ? Tema.Yazi2 : Tema.Soluk, Kenarlik + 32, H - Alt + 26);
    }

    void KartCiz(Graphics g, RectangleF r)
    {
        using (var p = Tema.Yuvarlak(new RectangleF(r.X, r.Y + 1, r.Width, r.Height), 10))
        using (var b = new SolidBrush(Color.FromArgb(10, 17, 24, 39))) g.FillPath(b, p);
        using (var p = Tema.Yuvarlak(r, 10))
        {
            using (var b = new SolidBrush(Tema.Kart)) g.FillPath(b, p);
            using (var pen = new Pen(Tema.KenarAcik)) g.DrawPath(pen, p);
        }
    }

    void KartBaslik(Graphics g, float x, float y, int no, string baslik, string alt)
    {
        var daire = new RectangleF(x, y, 30, 30);
        using (var b = new SolidBrush(Tema.Marka)) g.FillEllipse(b, daire);
        using (var f = Tema.F(9.5f, true))
            TR.DrawText(g, no.ToString(CultureInfo.InvariantCulture), f, Rectangle.Round(daire), Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        using (var f = Tema.F(10.5f, true)) Yaz(g, baslik, f, Tema.Yazi, x + 44, y - 1);
        using (var f = Tema.F(8.5f, false)) Yaz(g, alt, f, Tema.Yazi2, x + 44, y + 18);
    }

    void IcerikBaslik(Graphics g, string baslik, string alt)
    {
        using (var f = new Font("Segoe UI", 17f, FontStyle.Bold)) Yaz(g, baslik, f, Tema.Yazi, Kenarlik + 32, Baslik + 26);
        using (var f = Tema.F(10f, false)) Yaz(g, alt, f, Tema.Yazi2, Kenarlik + 34, Baslik + 64);
    }

    void OlcumCiz(Graphics g)
    {
        IcerikBaslik(g, _calisiyor ? "Bağlantınız Ölçülüyor" : "Ölçüm Tamamlanamadı",
            _calisiyor ? "Lütfen bu pencere açıkken bekleyin; sunucu ve bağlantınız aynı anda izleniyor"
                       : "Tekrar Test Et ile yeniden deneyin");

        float x = Kenarlik + 32, y = Baslik + 104, w = W - Kenarlik - 64, h = H - Alt - 28 - y;
        KartCiz(g, new RectangleF(x, y, w, h));
        KartBaslik(g, x + 24, y + 22, 1, _sure == Olcum.UzunSn ? "Uzun Ölçüm" : "Canlı Ölçüm", _sure + " saniye boyunca RDP bağlantınızın Windows ölçümleri okunur");

        // Hareketli çubuklar — ekran güncellemesi üretir, görüntü aktarımı da ölçülebilsin
        int n = 28, gen = 12, bosluk = 8;
        float toplam = n * gen + (n - 1) * bosluk;
        float x0 = x + (w - toplam) / 2, taban = y + h - 88;
        for (int i = 0; i < n; i++)
        {
            float oran = (float)(0.5 + 0.5 * Math.Sin(_faz * 3 + i * 0.42));
            float bh = 24 + 150 * oran;
            var r = new RectangleF(x0 + i * (gen + bosluk), taban - bh, gen, bh);
            using (var p = Tema.Yuvarlak(r, 4))
            using (var b = new SolidBrush(Color.FromArgb(60 + (int)(195 * oran), Tema.Marka))) g.FillPath(b, p);
        }

        // İlerleme
        var bar = new RectangleF(x + 24, y + h - 50, w - 48, 8);
        using (var p = Tema.Yuvarlak(bar, 4)) using (var b = new SolidBrush(Tema.Hover)) g.FillPath(b, p);
        float dolu = (w - 48) * _saniye / _sure;
        if (dolu > 8)
            using (var p = Tema.Yuvarlak(new RectangleF(bar.X, bar.Y, dolu, 8), 4)) using (var b = new SolidBrush(Tema.Marka)) g.FillPath(b, p);
        using (var f = Tema.F(8.5f, false))
        {
            Yaz(g, "Ölçüm sürüyor", f, Tema.Yazi2, bar.X, bar.Y + 16);
            string sn = _saniye + " / " + _sure + " sn";
            var sz = TR.MeasureText(sn, f);
            Yaz(g, sn, f, Tema.Yazi2, bar.Right - sz.Width, bar.Y + 16);
        }
    }

    void Rozet(Graphics g, string metin, Color renk, float sagX, float y)
    {
        using (var f = Tema.F(8.5f, true))
        {
            var sz = TR.MeasureText(metin, f);
            var r = new RectangleF(sagX - sz.Width - 18, y, sz.Width + 18, 24);
            using (var p = Tema.Yuvarlak(r, 12))
            using (var b = new SolidBrush(Color.FromArgb(30, renk))) g.FillPath(b, p);
            TR.DrawText(g, metin, f, Rectangle.Round(r), renk,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }
    }

    void BolumCiz(Graphics g, float x, float y, float w, float h, int no, string baslik, string alt, Durum d, List<Satir> satirlar)
    {
        KartCiz(g, new RectangleF(x, y, w, h));
        KartBaslik(g, x + 20, y + 20, no, baslik, alt);
        Rozet(g, Sonuc.DurumYazi(d), Tema.Renk(d), x + w - 20, y + 23);
        using (var pen = new Pen(Tema.KenarAcik)) g.DrawLine(pen, x + 20, y + 66, x + w - 20, y + 66);

        using (var fe = Tema.F(9f, false))
        using (var fd = Tema.F(9f, true))
        {
            if (satirlar.Count == 0) Yaz(g, "Bu oturumda ölçüm alınamadı.", fe, Tema.Yazi2, x + 20, y + 80);
            for (int i = 0; i < satirlar.Count; i++)
            {
                float sy = y + 80 + i * 27;
                using (var b = new SolidBrush(Tema.Renk(satirlar[i].Durum))) g.FillEllipse(b, x + 20, sy + 5, 8, 8);
                Yaz(g, satirlar[i].Etiket, fe, Tema.Yazi2, x + 36, sy);
                var sz = TR.MeasureText(satirlar[i].Deger, fd);
                Yaz(g, satirlar[i].Deger, fd, Tema.Yazi, x + w - 20 - sz.Width, sy);
            }
        }
    }

    void SonucCiz(Graphics g)
    {
        bool sunucuIyi = Sonuc.SunucuDurum == Durum.Iyi;
        IcerikBaslik(g, "Test Sonucu", Sonuc.Zaman.ToString("dd.MM.yyyy HH:mm") + " tarihinde " + Sonuc.SureSn + " saniye boyunca ölçüldü" + (Sonuc.SureSn == Olcum.UzunSn ? " (uzun test)" : ""));

        float x = Kenarlik + 32, y = Baslik + 104, w = W - Kenarlik - 64, bosluk = 16;
        float kw = (w - bosluk) / 2;
        int satir = Math.Max(Math.Max(Sonuc.SunucuSatirlar.Count, Sonuc.BaglantiSatirlar.Count), 1);
        float kh = 80 + satir * 27 + 8;

        BolumCiz(g, x, y, kw, kh, 1, "Sunucu", "Pusula sunucusunun o anki durumu", Sonuc.SunucuDurum, Sonuc.SunucuSatirlar);
        BolumCiz(g, x + kw + bosluk, y, kw, kh, 2, "Sizin Bağlantınız", "İnternet / ağ bağlantınız", Sonuc.BaglantiDurum, Sonuc.BaglantiSatirlar);

        // Hüküm kutusu
        Durum hd = sunucuIyi
            ? (Sonuc.BaglantiDurum == Durum.Zayif || Sonuc.BaglantiDurum == Durum.Orta || Sonuc.IstemciDurum != Durum.Iyi ? Durum.Orta : Durum.Iyi)
            : Durum.Zayif;
        Color hr = Tema.Renk(hd);
        float hy = y + kh + bosluk, hh = H - Alt - 24 - hy;
        var kutu = new RectangleF(x, hy, w, hh);
        using (var p = Tema.Yuvarlak(kutu, 10))
        {
            using (var b = new SolidBrush(Color.FromArgb(22, hr))) g.FillPath(b, p);
            using (var pen = new Pen(Color.FromArgb(110, hr))) g.DrawPath(pen, p);
        }
        var daire = new RectangleF(x + 22, hy + 22, 30, 30);
        using (var b = new SolidBrush(hr)) g.FillEllipse(b, daire);
        using (var f = new Font("Segoe UI", 11f, FontStyle.Bold))
            TR.DrawText(g, hd == Durum.Iyi ? "✓" : "!", f, Rectangle.Round(daire), Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        using (var f = Tema.F(8f, true)) Yaz(g, "SONUÇ", f, hr, x + 66, hy + 18);
        float metinY = hy + 38;
        using (var f = Tema.F(10.5f, true))
        {
            var sz = g.MeasureString(Sonuc.Hukum, f, (int)w - 90);
            TR.DrawText(g, Sonuc.Hukum, f, new Rectangle((int)x + 66, (int)metinY, (int)w - 90, (int)sz.Height + 4), Tema.Yazi,
                TextFormatFlags.WordBreak | TextFormatFlags.NoPadding);
            metinY += sz.Height + 10;
        }
        if (!string.IsNullOrEmpty(Sonuc.Oneri))
            using (var f = Tema.F(9f, false))
                TR.DrawText(g, Sonuc.Oneri, f, new Rectangle((int)x + 66, (int)metinY, (int)w - 90, (int)(hy + hh - metinY - 8)), Tema.Yazi2,
                    TextFormatFlags.WordBreak | TextFormatFlags.NoPadding);
        if (Olcum.KayitHatasi != null)
            using (var f = Tema.F(8f, false)) Yaz(g, "Not: rapor dosyası yazılamadı (" + Olcum.KayitHatasi + ")", f, Tema.Hata, x + 66, hy + hh - 22);
    }
}

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (args.Length >= 2 && args[0] == "--onizleme")
        {
            Onizleme(args[1], args.Length >= 3 ? args[2] : "baglanti");
            return;
        }

        using (new Mutex(true, "PusulaBaglantiTesti_" + Oturum.Id))
            Application.Run(new AnaForm());
    }

    // Tasarım kontrolü için sahte veriyle ekran görüntüsü üretir
    static void Onizleme(string png, string senaryo)
    {
        var s = new Sonuc
        {
            Kod = "BT-7F3K2", Kullanici = "4626.mimra1", Sunucu = "PUSULARDP3",
            IstemciIp = "172.22.202.43", IstemciAdi = "MIMRA-KASA", Istasyon = "RDP-Tcp#16",
            Zaman = new DateTime(2026, 9, 14, 10, 42, 0), OturumId = 41, SureSn = 30
        };
        var rnd = new Random(7);
        bool agKotu = senaryo == "baglanti";
        bool varsayilan = senaryo == "varsayilan";
        for (int i = 0; i < 20; i++)
        {
            s.Cpu.Ekle(14 + rnd.Next(10)); s.Ram.Ekle(41); s.Disk.Ekle(0.003 + rnd.NextDouble() * 0.002);
            s.GirisGecikme.Ekle(rnd.Next(6)); s.Kuyruk.Ekle(0);
            s.Rtt.Ekle(varsayilan ? 400 : agKotu ? 180 + rnd.Next(140) : 18 + rnd.Next(8));
            s.Bant.Ekle(varsayilan ? 512 : agKotu ? 1100 + rnd.Next(300) : 24000);
            s.Kayip.Ekle(agKotu ? 3.5 : 0); s.Yeniden.Ekle(agKotu ? 4.1 : 0);
            s.TcpGonder.Ekle(40000); s.UdpGonder.Ekle(0);
            s.CiktiKare.Ekle(agKotu ? 9 : 24); s.AtlaAg.Ekle(agKotu ? 5 : 0); s.AtlaSunucu.Ekle(0); s.AtlaIstemci.Ekle(0);
        }
        s.Degerlendir();

        var f = new AnaForm();
        if (senaryo == "olcum") f.OnizlemeOlcum(12);
        else f.OnizlemeSonuc(s);
        f.StartPosition = FormStartPosition.Manual;
        f.Location = new Point(-4000, -4000);
        f.Show();
        Application.DoEvents();
        using (var bmp = new Bitmap(f.ClientSize.Width, f.ClientSize.Height))
        {
            f.DrawToBitmap(bmp, new Rectangle(0, 0, bmp.Width, bmp.Height));
            bmp.Save(png, System.Drawing.Imaging.ImageFormat.Png);
        }
        f.Close();
    }
}

}
