using System;
using System.ComponentModel;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    /// <summary>
    /// Sayım modu — Pusula programının bu bilgisayardaki sayım kopyası. İki tür (Ayarlar > Sayım'da iki kart):
    ///
    ///   Pusula X ("pusulax"): C:\Pusula\PusulaXSayım, RFID.xml'li (giriş sonrası menü yerine sayım ekranı, PC adı
    ///     lisans denetimi yok). server.xml: SQL sunucusu, firmanın SQL login'i/şifresi, firma kodu (giriş ekranı
    ///     veritabanlarını guvenlik.kod ile süzer — kullanıcı veritabanını Pusula X'te seçer), resim adresi.
    ///     lic.xml: firma kodu/adı, PC adı, kullanıcı, sabit program kodu 909.
    ///
    ///   Eski program ("eski"): C:\Pusula\PusulaSayimEski, Pusula.exe. TEK veritabanıyla açılır: Server.xml
    ///     IP / USER / PASSWORD / DATA (şifreli) + USERID=1, FORMID (612 Perakende / 146 Toptan), IMGPATH, IMGURLWEB=1.
    ///     Veritabanı ve FORMID'i kullanıcı Connect'te seçer (veritabanı listesi Hub'dan, sirket.guvenlik).
    ///
    /// Ortak: paket servisten (zip, SHA-256 doğrulanır) indirilir; SQL bilgisi Hub'dan gelir (servis /api/sayim),
    /// Pusula'nın kendi şifrelemesiyle (TripleDES) yazılır; Hub'da değişince imza farkıyla kendiliğinden yenilenir.
    /// C:\Pusula yoksa klasörü oluşturmak yönetici ister → "--sayim-klasor &lt;yol&gt;" ile ayrı süreç (UAC bir kez),
    /// Users'a değiştirme hakkı verilir ki program kendini güncelleyebilsin.
    /// </summary>
    internal sealed class Sayim
    {
        public const string Kok = @"C:\Pusula";

        /// <summary>Pusula X sayımı. Geliştirme: PUSULA_SAYIM_KLASOR ile başka klasöre kurulur.</summary>
        public static readonly Sayim PusulaX = new Sayim("pusulax", "PUSULA_SAYIM_KLASOR", "PusulaXSayım", "PusulaX.exe",
            "Pusula Sayım", "sayim.json", "Pusula X");
        /// <summary>Eski program (Pusula.exe) sayımı. Geliştirme: PUSULA_SAYIM_ESKI_KLASOR.</summary>
        public static readonly Sayim Eski = new Sayim("eski", "PUSULA_SAYIM_ESKI_KLASOR", "PusulaSayimEski", "Pusula.exe",
            "Pusula Sayım (Eski)", "sayim-eski.json", "Pusula");
        public static readonly Sayim[] Hepsi = { PusulaX, Eski };

        public static Sayim Bul(string tur) => tur == "eski" ? Eski : PusulaX;

        public readonly string Tur;
        public readonly string Klasor;
        public readonly string Exe;
        private readonly string _kisayolAdi;
        private readonly string _kisayolYolu;
        private readonly string _durumAdi;
        private readonly string _programAdi;
        private bool EskiMi => Tur == "eski";

        private Sayim(string tur, string ortamDegiskeni, string klasorAdi, string exeAdi, string kisayolAdi, string durumAdi, string programAdi)
        {
            Tur = tur;
            var k = Environment.GetEnvironmentVariable(ortamDegiskeni);
            Klasor = !string.IsNullOrWhiteSpace(k) ? k.Trim() : Path.Combine(Kok, klasorAdi);
            Exe = Path.Combine(Klasor, exeAdi);
            _kisayolAdi = kisayolAdi;
            _kisayolYolu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), kisayolAdi + ".lnk");
            _durumAdi = durumAdi;
            _programAdi = programAdi;
        }

        private const string ProgramKoduPusulaX = "909";
        private const string ServerXmlPusulaX = "server.xml";
        private const string ServerXmlEski = "Server.xml";

        private string DurumDosyasi => Path.Combine(Kimlik.Klasor, _durumAdi);
        private string ServerXml => Path.Combine(Klasor, EskiMi ? ServerXmlEski : ServerXmlPusulaX);

        private readonly object _kilit = new object();
        private bool _kuruluyor;
        private JObject _ilerleme;   // { adim, yuzde, mesaj, hiz, bitti, hata }
        /// <summary>Hub'daki SQL bilgisi değişti ama 2FA açık: yenileme kullanıcının kod girmesini bekliyor.</summary>
        public bool GuncellemeBekliyor;

        public bool Kurulu => File.Exists(Exe) && File.Exists(ServerXml) && (EskiMi || File.Exists(Path.Combine(Klasor, "RFID.xml")));

        // ------------------------------------------------------------ durum

        private JObject DurumOku()
        {
            try { return File.Exists(DurumDosyasi) ? JObject.Parse(File.ReadAllText(DurumDosyasi, Encoding.UTF8)) : null; } catch { return null; }
        }

        /// <summary>Eski program: kullanıcının seçtiği veritabanı ve FORMID (yoksa null).</summary>
        public JObject Secim => DurumOku()?["secim"] as JObject;

        /// <summary>Durum() içine giren özet; ayrıca Ayarlar > Sayım kartı.</summary>
        public object KisaDurum()
        {
            var d = DurumOku();
            lock (_kilit)
            {
                return new
                {
                    tur = Tur,
                    kurulu = Kurulu,
                    klasor = Klasor,
                    kisayol = File.Exists(_kisayolYolu),
                    surum = Kurulu ? SurumOku() : null,
                    paketSurum = d?.Value<string>("paketSurum"),
                    kurulum = Tarih(d?["kurulum"]),
                    sunucu = d?.Value<string>("sunucu"),
                    kullanici = d?.Value<string>("kullanici"),
                    resimYolu = d?.Value<string>("resimYolu"),
                    secim = d?["secim"],
                    test = d?["test"],
                    sonGuncelleme = Tarih(d?["guncelleme"]),
                    guncellemeBekliyor = GuncellemeBekliyor,
                    kuruluyor = _kuruluyor,
                    ilerleme = _ilerleme,
                };
            }
        }

        /// <summary>
        /// Nabızla Hub'a giden özet (Hub /connect cihaz listesi). Şifre/sunucu adresi GİTMEZ; yalnız kurulu mu,
        /// sürüm, son test sonucu. Kurulu değilse null — eski istemcilerle aynı görünür.
        /// </summary>
        public object NabizOzeti()
        {
            var d = DurumOku();
            bool kuruluyor; JObject il; lock (_kilit) { kuruluyor = _kuruluyor; il = _ilerleme; }
            var kurulu = Kurulu;
            if (!kurulu && !kuruluyor && il?.Value<string>("hata") == null) return null;
            var t = d?["test"] as JObject;
            return new
            {
                kurulu,
                kuruluyor,
                hata = !kurulu && !kuruluyor ? il?.Value<string>("hata") : null,
                surum = kurulu ? SurumOku() : null,
                kurulum = Tarih(d?["kurulum"]),
                kisayol = File.Exists(_kisayolYolu),
                guncellemeBekliyor = GuncellemeBekliyor,
                // Eski program: hangi veritabanı / program (FORMID) — veritabanı adı hassas değil
                veritabani = EskiMi ? Secim?.Value<string>("veritabani") : null,
                formId = EskiMi ? Secim?.Value<string>("formId") : null,
                test = t == null ? null : new
                {
                    zaman = Tarih(t["zaman"]),
                    ok = t.Value<bool?>("ok") == true,
                    veritabani = (t["veritabanlari"] as JArray)?.Count,
                    hata = t.Value<string>("hata"),
                },
            };
        }

        /// <summary>Diske yazılan son bilginin Hub imzası — nabızdaki imzayla karşılaştırılır.</summary>
        public string UygulananImza => DurumOku()?.Value<string>("imza");

        /// <summary>JObject.Parse tarih alanlarını DateTime'a çevirir; metne dönerken ISO (s) biçimi kalsın.</summary>
        private static string Tarih(JToken t) =>
            t == null || t.Type == JTokenType.Null ? null : t.Type == JTokenType.Date ? t.Value<DateTime>().ToString("s") : t.ToString();

        private string SurumOku()
        {
            try { return FileVersionInfo.GetVersionInfo(Exe).FileVersion; } catch { return null; }
        }

        private void Ilerle(string adim, int yuzde, string mesaj, double hiz = 0, bool bitti = false, string hata = null)
        {
            lock (_kilit)
                _ilerleme = new JObject { ["adim"] = adim, ["yuzde"] = yuzde, ["mesaj"] = mesaj, ["hiz"] = hiz, ["bitti"] = bitti, ["hata"] = hata };
        }

        private void DurumYaz(Action<JObject> degistir)
        {
            var d = DurumOku() ?? new JObject();
            degistir(d);
            Directory.CreateDirectory(Path.GetDirectoryName(DurumDosyasi));
            File.WriteAllText(DurumDosyasi, d.ToString(), Encoding.UTF8);
        }

        // ------------------------------------------------------------ eski program: seçim

        /// <summary>612 Perakende, 146 Toptan (Pusula.exe FORMID).</summary>
        public static readonly string[] FormIdler = { "612", "146" };

        private static JObject SecimDenetle(JObject secim)
        {
            var vt = secim?.Value<string>("veritabani")?.Trim();
            var form = secim?.Value<string>("formId")?.Trim();
            if (string.IsNullOrEmpty(vt)) throw new KullaniciHatasi("Sayım yapılacak veritabanını seçin.");
            if (!FormIdler.Contains(form)) throw new KullaniciHatasi("Programı seçin (Perakende ya da Toptan).");
            return new JObject { ["veritabani"] = vt, ["ad"] = secim.Value<string>("ad")?.Trim() ?? vt, ["formId"] = form };
        }

        // ------------------------------------------------------------ kur

        /// <summary>
        /// Arka planda kurar; ilerleme KisaDurum().ilerleme'den izlenir. bilgi: servis /api/sayim "bilgi",
        /// paket: "paket" (url servis adresine göreli, sha256, boyut, surum). secim: yalnız eski program.
        /// </summary>
        public void KurBaslat(JObject bilgi, JObject paket, string servisAdresi, string token, JObject secim)
        {
            if (EskiMi) secim = SecimDenetle(secim);
            lock (_kilit)
            {
                if (_kuruluyor) throw new KullaniciHatasi("Sayım kurulumu zaten sürüyor.", 409);
                _kuruluyor = true;
            }
            Ilerle("hazirlik", 0, "Hazırlanıyor…");
            Task.Run(async () =>
            {
                try
                {
                    await Kur(bilgi, paket, servisAdresi, token, secim);
                    Ilerle("bitti", 100, "Sayım kuruldu.", 0, true);
                    Gunluk.Yaz("Sayım kuruldu (" + Tur + "): " + Klasor);
                }
                catch (Exception e)
                {
                    var m = e is KullaniciHatasi ? e.Message : e.GetBaseException().Message;
                    Ilerle("hata", 0, null, 0, true, m);
                    Gunluk.Yaz("Sayım kurulamadı (" + Tur + "): " + m);
                }
                finally { lock (_kilit) _kuruluyor = false; }
            });
        }

        private async Task Kur(JObject bilgi, JObject paket, string servisAdresi, string token, JObject secim)
        {
            // 1) Klasör — C:\Pusula yoksa ya da yazılamıyorsa yönetici
            if (!KlasorYazilabilir())
            {
                Ilerle("klasor", 2, "Klasör için yönetici izni isteniyor…");
                var kod = await YoneticiCalistir("--sayim-klasor \"" + Klasor + "\"");
                if (kod == -1) throw new KullaniciHatasi("Yönetici izni verilmedi. " + Klasor + " klasörünü oluşturmak için izin gerekir; tekrar deneyin.");
                if (!KlasorYazilabilir()) throw new KullaniciHatasi("Klasör oluşturulamadı: " + Klasor + " (çıkış kodu " + kod + ")");
            }

            // 2) Paket — zaten aynı sürüm kuruluysa indirme atlanır, yalnız dosyalar yenilenir
            var paketSurum = paket.Value<string>("surum");
            var kuruluSurum = File.Exists(Exe) ? SurumOku() : null;
            var ayni = paketSurum != null && kuruluSurum != null && kuruluSurum.StartsWith(paketSurum, StringComparison.Ordinal);
            if (!ayni || !File.Exists(Exe))
            {
                var url = new Uri(new Uri(servisAdresi), paket.Value<string>("url") ?? "sayim-paket").ToString();
                var zip = await Task.Run(() => Indir(url, token, paket.Value<string>("sha256"), paket.Value<long?>("boyut") ?? 0));
                try
                {
                    Ilerle("ac", 90, "Dosyalar açılıyor…");
                    await Task.Run(() => Ac(zip));
                }
                finally { try { File.Delete(zip); } catch { } }
            }

            // 3) Program dosyaları
            Ilerle("dosyalar", 96, "Bağlantı dosyaları yazılıyor…");
            if (!EskiMi) File.WriteAllText(Path.Combine(Klasor, "RFID.xml"), "");   // boş: Pusula X yalnız varlığına bakar
            DosyalariYaz(bilgi, secim);

            // 4) Kısayol yok — sayım Connect'ten başlatılır; eski sürümün bıraktığı kısayol silinir
            KisayolKaldir();

            DurumYaz(d =>
            {
                d["kurulum"] = DateTime.Now.ToString("s");
                d["paketSurum"] = paketSurum;
                if (secim != null) d["secim"] = secim;
                BilgiNotu(d, bilgi);
            });
            GuncellemeBekliyor = false;
        }

        /// <summary>
        /// Bağlantı dosyalarını Hub'daki güncel bilgiyle yeniden yazar (paket indirilmez). Eski programda secim
        /// verilirse veritabanı / FORMID değişir; verilmezse kayıtlı seçim kullanılır.
        /// </summary>
        public object Guncelle(JObject bilgi, JObject secim = null)
        {
            if (!Kurulu) throw new KullaniciHatasi("Sayım kurulu değil.", 409);
            if (EskiMi) secim = SecimDenetle(secim ?? Secim);
            DosyalariYaz(bilgi, secim);
            DurumYaz(d =>
            {
                d["guncelleme"] = DateTime.Now.ToString("s");
                if (secim != null) d["secim"] = secim;
                BilgiNotu(d, bilgi);
            });
            GuncellemeBekliyor = false;
            return KisaDurum();
        }

        private static void BilgiNotu(JObject d, JObject bilgi)
        {
            d["sunucu"] = bilgi.Value<string>("sunucu");
            d["kullanici"] = bilgi.Value<string>("kullanici");
            d["resimYolu"] = bilgi.Value<string>("resimYolu");
            d["imza"] = bilgi.Value<string>("imza");
        }

        private bool KlasorYazilabilir()
        {
            try
            {
                Directory.CreateDirectory(Klasor);
                var deneme = Path.Combine(Klasor, ".yazma-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(deneme, "");
                File.Delete(deneme);
                return true;
            }
            catch { return false; }
        }

        private string Indir(string url, string token, string beklenenSha, long boyut)
        {
            var klasor = Path.Combine(Path.GetTempPath(), "PusulaConnect2");
            Directory.CreateDirectory(klasor);
            var hedef = Path.Combine(klasor, "sayim-" + Tur + ".zip");
            if (File.Exists(hedef)) File.Delete(hedef);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var istek = (HttpWebRequest)WebRequest.Create(url);
            istek.Timeout = 30000;
            istek.ReadWriteTimeout = 60000;
            istek.Headers.Add("Authorization", "Bearer " + token);
            using (var sha = SHA256.Create())
            using (var yanit = (HttpWebResponse)istek.GetResponse())
            using (var akis = yanit.GetResponseStream())
            using (var dosya = File.Create(hedef))
            {
                var toplam = yanit.ContentLength > 0 ? yanit.ContentLength : boyut;
                var tampon = new byte[1 << 16];
                long alinan = 0, hizBayt = 0;
                var hizAn = DateTime.Now;
                double hiz = 0;
                int n, son = -1;
                while ((n = akis.Read(tampon, 0, tampon.Length)) > 0)
                {
                    dosya.Write(tampon, 0, n);
                    sha.TransformBlock(tampon, 0, n, null, 0);
                    alinan += n;
                    var dt = (DateTime.Now - hizAn).TotalSeconds;
                    if (dt >= 1)
                    {
                        var anlik = (alinan - hizBayt) / dt;
                        hiz = hiz <= 0 ? anlik : hiz * 0.5 + anlik * 0.5;
                        hizAn = DateTime.Now; hizBayt = alinan;
                    }
                    // İndirme 5–88 arası; açma 90+
                    var y = toplam > 0 ? 5 + (int)(alinan * 83 / toplam) : 5;
                    if (y != son) { son = y; Ilerle("indir", y, _programAdi + " indiriliyor… " + (alinan / 1048576) + " / " + (toplam / 1048576) + " MB", hiz); }
                }
                sha.TransformFinalBlock(new byte[0], 0, 0);
                var ozet = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                if (!string.IsNullOrEmpty(beklenenSha) && !string.Equals(ozet, beklenenSha, StringComparison.OrdinalIgnoreCase))
                    throw new KullaniciHatasi("İndirilen paket doğrulanamadı (SHA-256 uyuşmuyor); tekrar deneyin.");
            }
            return hedef;
        }

        /// <summary>Zip'i klasöre açar; var olan dosyaların üstüne yazar (bağlantı dosyaları zipte yok, korunur).</summary>
        private void Ac(string zip)
        {
            var exeAdi = Path.GetFileName(Exe);
            using (var arsiv = ZipFile.OpenRead(zip))
            {
                var tam = Path.GetFullPath(Klasor + Path.DirectorySeparatorChar);
                foreach (var g in arsiv.Entries)
                {
                    var hedef = Path.GetFullPath(Path.Combine(Klasor, g.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (!hedef.StartsWith(tam, StringComparison.OrdinalIgnoreCase)) continue;   // zip slip
                    if (string.IsNullOrEmpty(g.Name)) { Directory.CreateDirectory(hedef); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(hedef));
                    try { g.ExtractToFile(hedef, true); }
                    catch (IOException) when (Path.GetFileName(hedef).Equals(exeAdi, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new KullaniciHatasi(_kisayolAdi + " açık görünüyor; kapatıp tekrar deneyin.");
                    }
                }
            }
        }

        // ------------------------------------------------------------ bağlantı dosyaları

        private void DosyalariYaz(JObject bilgi, JObject secim)
        {
            var sunucu = bilgi.Value<string>("sunucu");
            var kullanici = bilgi.Value<string>("kullanici");
            var sifre = bilgi.Value<string>("sifre");
            var dataCode = bilgi.Value<string>("dataCode");
            if (string.IsNullOrWhiteSpace(sunucu) || string.IsNullOrWhiteSpace(kullanici) || string.IsNullOrWhiteSpace(dataCode))
                throw new KullaniciHatasi("Sayım bilgisi eksik (sunucu / kullanıcı / firma kodu).");
            var resim = bilgi.Value<string>("resimYolu");

            if (EskiMi) { EskiServerXml(sunucu, kullanici, sifre, resim, secim); return; }

            var server = new XElement("Server",
                new XElement("Name", PusulaSifrele(sunucu)),
                new XElement("UserName", PusulaSifrele(kullanici)),
                new XElement("Password", PusulaSifrele(sifre ?? "")),
                new XElement("DataCode", PusulaSifrele(dataCode)));
            if (!string.IsNullOrWhiteSpace(resim)) server.Add(new XElement("ImgPath", resim));   // düz metin (Pusula X böyle okur)
            XmlYaz(ServerXml, "Pusula", server);

            // Mevcut lic.xml'in LicenceCode'u korunur
            var licYolu = Path.Combine(Klasor, "lic.xml");
            string licenceCode = null;
            try { if (File.Exists(licYolu)) licenceCode = XDocument.Load(licYolu).Root?.Element("Licence")?.Element("LicenceCode")?.Value; } catch { }
            if (string.IsNullOrEmpty(licenceCode)) licenceCode = PusulaSifrele(Guid.NewGuid().ToString("N").Substring(0, 8).ToUpperInvariant());

            XmlYaz(licYolu, "Pusula", new XElement("Licence",
                new XElement("CompanyId", PusulaSifrele(dataCode)),
                new XElement("CompanyName", PusulaSifrele(bilgi.Value<string>("firmaAdi") ?? dataCode)),
                new XElement("PcName", PusulaSifrele(Environment.MachineName)),
                new XElement("LicenceName", PusulaSifrele(Kimlik.Profil()?.Value<string>("kullanici") ?? kullanici)),
                new XElement("LicenceCode", licenceCode),
                new XElement("ProgramCode", PusulaSifrele(ProgramKoduPusulaX)),
                new XElement("Language", "tr")));
        }

        /// <summary>
        /// Eski program Server.xml — örnek (elle kurulmuş kopya):
        ///   &lt;Servers&gt;&lt;Server&gt; IP, PASSWORD, DATA, USER (şifreli), USERID 1, FORMID 612|146,
        ///   IMGPATH http://host:port// , IMGURLWEB 1 &lt;/Server&gt;&lt;/Servers&gt;
        /// IP: varsayılan port (1433) ise yalnız adres yazılır (örnekteki gibi), değilse "adres,port".
        /// </summary>
        private void EskiServerXml(string sunucu, string kullanici, string sifre, string resim, JObject secim)
        {
            if (secim == null) throw new KullaniciHatasi("Sayım yapılacak veritabanını ve programı seçin.");
            var ip = sunucu.EndsWith(",1433", StringComparison.Ordinal) ? sunucu.Substring(0, sunucu.Length - 5) : sunucu;
            var server = new XElement("Server",
                new XElement("IP", PusulaSifrele(ip)),
                new XElement("PASSWORD", PusulaSifrele(sifre ?? "")),
                new XElement("DATA", PusulaSifrele(secim.Value<string>("veritabani"))),
                new XElement("USER", PusulaSifrele(kullanici)),
                new XElement("USERID", "1"),
                new XElement("FORMID", secim.Value<string>("formId")));
            // Örnekte resim adresi çift bölüyle bitiyor ("http://host:port//") — program yola böyle ekliyor
            if (!string.IsNullOrWhiteSpace(resim)) server.Add(new XElement("IMGPATH", resim.TrimEnd('/') + "//"));
            server.Add(new XElement("IMGURLWEB", "1"));
            XmlYaz(ServerXml, "Servers", server);
        }

        private static void XmlYaz(string yol, string kok, XElement tablo)
        {
            // Program DataSet.ReadXml ile okur: <Kok><Tablo>…</Tablo></Kok>
            var d = new XDocument(new XDeclaration("1.0", null, "yes"), new XElement(kok, tablo));
            using (var w = new StreamWriter(yol, false, new UTF8Encoding(false))) d.Save(w);
        }

        /// <summary>Pusula Model/Crypto.cs ile birebir: TripleDES CBC/PKCS7, key SHA1(UTF-16 anahtar)[0..24], IV SHA1("")[0..8], metin UTF-16LE.</summary>
        private const string PusulaAnahtar = "14PuSuLa53*";
        private static byte[] Kes(string metin, int uzunluk)
        {
            using (var sha1 = SHA1.Create())
            {
                var h = sha1.ComputeHash(Encoding.Unicode.GetBytes(metin));
                Array.Resize(ref h, uzunluk);
                return h;
            }
        }
        internal static string PusulaSifrele(string metin)
        {
            if (string.IsNullOrEmpty(metin)) return "";
            using (var des = new TripleDESCryptoServiceProvider { Key = Kes(PusulaAnahtar, 24), IV = Kes("", 8) })
            using (var enc = des.CreateEncryptor())
            {
                var b = Encoding.Unicode.GetBytes(metin);
                return Convert.ToBase64String(enc.TransformFinalBlock(b, 0, b.Length));
            }
        }
        internal static string PusulaCoz(string b64)
        {
            if (string.IsNullOrWhiteSpace(b64)) return "";
            using (var des = new TripleDESCryptoServiceProvider { Key = Kes(PusulaAnahtar, 24), IV = Kes("", 8) })
            using (var dec = des.CreateDecryptor())
            {
                var b = Convert.FromBase64String(b64);
                return Encoding.Unicode.GetString(dec.TransformFinalBlock(b, 0, b.Length));
            }
        }

        // ------------------------------------------------------------ kısayol (kaldırıldı)

        /// <summary>
        /// Sayım Connect'ten başlatılır; masaüstü kısayolu oluşturulmaz. 0.6.0 kısayol bırakmıştı — açılışta ve
        /// kurulumda silinir (yalnız bizim adımızdaki kısayol, hedefi bizim exe'miz ise).
        /// </summary>
        public void KisayolKaldir()
        {
            try
            {
                if (!File.Exists(_kisayolYolu)) return;
                File.Delete(_kisayolYolu);
                Gunluk.Yaz("Eski sayım kısayolu kaldırıldı (" + Tur + "): " + _kisayolYolu);
            }
            catch (Exception e) { Gunluk.Yaz("Sayım kısayolu kaldırılamadı (" + Tur + "): " + e.Message); }
        }

        // ------------------------------------------------------------ test

        /// <summary>
        /// Bağlantı dosyasındaki bilgiyle SQL'e bağlanır. Pusula X: firma login'inin veritabanlarını listeler.
        /// Eski program: seçili veritabanına (DATA) bağlanır — açılabiliyorsa o tek veritabanı listelenir.
        /// </summary>
        public async Task<object> Test()
        {
            if (!Kurulu) throw new KullaniciHatasi("Sayım kurulu değil.", 409);
            string sunucu, kullanici, sifre, data = null;
            try
            {
                var s = XDocument.Load(ServerXml).Root?.Element("Server");
                if (EskiMi)
                {
                    sunucu = PusulaCoz(s?.Element("IP")?.Value);
                    kullanici = PusulaCoz(s?.Element("USER")?.Value);
                    sifre = PusulaCoz(s?.Element("PASSWORD")?.Value);
                    data = PusulaCoz(s?.Element("DATA")?.Value);
                }
                else
                {
                    sunucu = PusulaCoz(s?.Element("Name")?.Value);
                    kullanici = PusulaCoz(s?.Element("UserName")?.Value);
                    sifre = PusulaCoz(s?.Element("Password")?.Value);
                }
            }
            catch (Exception e) { throw new KullaniciHatasi(Path.GetFileName(ServerXml) + " okunamadı: " + e.Message); }
            if (string.IsNullOrWhiteSpace(sunucu)) throw new KullaniciHatasi(Path.GetFileName(ServerXml) + "'de sunucu yok.");

            var sw = Stopwatch.StartNew();
            var sonuc = new JObject { ["zaman"] = DateTime.Now.ToString("s"), ["sunucu"] = sunucu, ["kullanici"] = kullanici };
            try
            {
                var cs = new SqlConnectionStringBuilder
                {
                    DataSource = sunucu, UserID = kullanici, Password = sifre,
                    InitialCatalog = EskiMi && !string.IsNullOrEmpty(data) ? data : "master",
                    ConnectTimeout = 10, Encrypt = false, ApplicationName = "Pusula Connect (sayım testi)",
                };
                using (var c = new SqlConnection(cs.ConnectionString))
                {
                    await c.OpenAsync();
                    sonuc["sqlSurum"] = c.ServerVersion;
                    var liste = new JArray();
                    if (EskiMi)
                        liste.Add(new JObject { ["ad"] = c.Database });   // açılabildi: program da bu veritabanıyla açılır
                    else
                    {
                        // Firma login'inin görebildiği veritabanları; paylaşımlı 'sirket' (giriş listesi için gerekli) sayılmaz
                        using (var cmd = new SqlCommand("select name from sys.databases where database_id > 4 and has_dbaccess(name) = 1 and name <> 'sirket' order by name", c))
                        using (var r = await cmd.ExecuteReaderAsync())
                            while (await r.ReadAsync()) liste.Add(new JObject { ["ad"] = r.GetString(0) });
                    }
                    sonuc["ok"] = true;
                    sonuc["veritabanlari"] = liste;
                }
            }
            catch (Exception e)
            {
                sonuc["ok"] = false;
                sonuc["hata"] = e.GetBaseException().Message;
            }
            sonuc["sureMs"] = (int)sw.ElapsedMilliseconds;
            DurumYaz(d => d["test"] = sonuc);
            Gunluk.Yaz("Sayım SQL testi (" + Tur + "): " + (sonuc.Value<bool?>("ok") == true ? "bağlandı, " + ((JArray)sonuc["veritabanlari"]).Count + " veritabanı" : "hata: " + sonuc.Value<string>("hata")));
            return sonuc;
        }

        /// <summary>Sayım programını başlatır (Pusula X: PusulaX.exe, eski: Pusula.exe); çalışma klasörü program klasörü.</summary>
        public object Baslat()
        {
            if (!Kurulu) throw new KullaniciHatasi("Sayım kurulu değil.", 409);
            Process.Start(new ProcessStartInfo(Exe) { WorkingDirectory = Klasor, UseShellExecute = true });
            Gunluk.Yaz("Sayım programı başlatıldı (" + Tur + ")");
            return new { tamam = true };
        }

        /// <summary>Klasörü Gezgin'de açar (WebView içinden file:// açılmaz).</summary>
        public object KlasorAc()
        {
            if (!Directory.Exists(Klasor)) throw new KullaniciHatasi("Klasör yok: " + Klasor, 404);
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + Klasor + "\"") { UseShellExecute = true });
            return new { tamam = true };
        }

        // ------------------------------------------------------------ kaldır

        /// <summary>Kısayolu kaldırır; klasoruSil ise program kopyasını da siler.</summary>
        public object Kaldir(bool klasoruSil)
        {
            try { if (File.Exists(_kisayolYolu)) File.Delete(_kisayolYolu); } catch (Exception e) { Gunluk.Yaz("Sayım kısayolu silinemedi: " + e.Message); }
            if (klasoruSil && Directory.Exists(Klasor))
            {
                try { Directory.Delete(Klasor, true); }
                catch (Exception e) { throw new KullaniciHatasi("Klasör silinemedi (" + _kisayolAdi + " açık olabilir): " + e.GetBaseException().Message); }
            }
            else if (!klasoruSil && Kurulu)
            {
                // Klasör kalıyor ama sayım kapalı: bağlantı bilgisi diskte kalmasın; yeniden açınca yeniden yazılır.
                try { File.Delete(ServerXml); } catch { }
            }
            DurumYaz(d => { d["kurulum"] = null; d["test"] = null; d["imza"] = null; });
            GuncellemeBekliyor = false;
            Gunluk.Yaz("Sayım kaldırıldı (" + Tur + ")" + (klasoruSil ? " (klasörle)" : ""));
            return KisaDurum();
        }

        // ------------------------------------------------------------ yönetici

        private static async Task<int> YoneticiCalistir(string argumanlar)
        {
            Process p;
            try { p = Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, argumanlar) { Verb = "runas", UseShellExecute = true }); }
            catch (Win32Exception e) when (e.NativeErrorCode == 1223) { Gunluk.Yaz("Sayım: UAC reddedildi"); return -1; }
            using (p)
            {
                for (var i = 0; i < 1200 && !p.HasExited; i++) await Task.Delay(100);
                return p.HasExited ? p.ExitCode : -2;
            }
        }

        /// <summary>
        /// "--sayim-klasor [yol]": klasörü oluşturur, Users'a değiştirme hakkı verir — pencere açmaz.
        /// Yol yalnız C:\Pusula altında kabul edilir (yönetici süreci keyfi klasöre hak vermesin); verilmezse Pusula X klasörü.
        /// </summary>
        public static int YoneticiOlarakCalistir(string[] args)
        {
            try
            {
                var i = Array.IndexOf(args, "--sayim-klasor");
                var yol = i >= 0 && i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[i + 1] : PusulaX.Klasor;
                yol = Path.GetFullPath(yol);
                var izinli = Hepsi.Any(s => string.Equals(Path.GetFullPath(s.Klasor), yol, StringComparison.OrdinalIgnoreCase));
                if (!izinli) { Gunluk.Yaz("--sayim-klasor: izinsiz yol reddedildi: " + yol); return -4; }
                Directory.CreateDirectory(yol);
                // Users (S-1-5-32-545) Modify: program kendini güncelleyebilsin, Connect dosyaları yazabilsin
                var p = Process.Start(new ProcessStartInfo("icacls.exe", "\"" + yol + "\" /grant *S-1-5-32-545:(OI)(CI)M /T /Q")
                { UseShellExecute = false, CreateNoWindow = true });
                p.WaitForExit(60000);
                return p.HasExited ? p.ExitCode : -2;
            }
            catch (Exception e)
            {
                try { Gunluk.Yaz("--sayim-klasor: " + e.Message); } catch { }
                return -3;
            }
        }
    }
}
