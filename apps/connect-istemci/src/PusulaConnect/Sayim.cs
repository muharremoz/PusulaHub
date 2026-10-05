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
    /// Pusula X sayım modu: Pusula X'in bu bilgisayardaki kopyası (RFID.xml'li → giriş sonrası menü yerine
    /// sayım ekranı açılır, PC adı lisans denetimi yapılmaz). Ayarlar > Sayım'dan kurulur:
    ///   - paket (servis /sayim-paket, zip, SHA-256 doğrulanır) C:\Pusula\PusulaXSayım'a açılır
    ///   - server.xml: SQL dış adresi, firmanın SQL login'i/şifresi, firma kodu, IIS resim adresi —
    ///     bilgi Hub'dan (servis /api/sayim), Pusula X'in kendi şifrelemesiyle (TripleDES) yazılır
    ///   - lic.xml: firma kodu/adı, PC adı, kullanıcı, sabit program kodu (sayım modunda lisans sunucusu aranmaz)
    ///   - masaüstüne "Pusula Sayım" kısayolu
    /// C:\Pusula yoksa oluşturmak yönetici ister → "--sayim-klasor" ile ayrı süreç (UAC bir kez), sonra
    /// klasöre Users'a değiştirme hakkı verilir ki Pusula X kendini güncelleyebilsin (Update.exe).
    /// </summary>
    internal static class Sayim
    {
        public const string Kok = @"C:\Pusula";
        /// <summary>Geliştirme: PUSULA_SAYIM_KLASOR ile başka klasöre kurulur (bu PC'deki gerçek kopya ezilmesin).</summary>
        public static readonly string Klasor = Environment.GetEnvironmentVariable("PUSULA_SAYIM_KLASOR") is string k && k.Trim().Length > 0
            ? k.Trim() : Path.Combine(Kok, "PusulaXSayım");
        public static readonly string Exe = Path.Combine(Klasor, "PusulaX.exe");
        private static readonly string KisayolYolu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Pusula Sayım.lnk");
        private static string DurumDosyasi => Path.Combine(Kimlik.Klasor, "sayim.json");
        private const string ProgramKodu = "909";

        private static readonly object _kilit = new object();
        private static bool _kuruluyor;
        private static JObject _ilerleme;   // { adim, yuzde, mesaj, hiz, bitti, hata }
        /// <summary>Hub'daki SQL bilgisi değişti ama 2FA açık: yenileme kullanıcının kod girmesini bekliyor.</summary>
        public static bool GuncellemeBekliyor;

        public static bool Kurulu => File.Exists(Exe) && File.Exists(Path.Combine(Klasor, "RFID.xml")) && File.Exists(Path.Combine(Klasor, "server.xml"));

        // ------------------------------------------------------------ durum

        /// <summary>Durum() içine giren özet; ayrıca Ayarlar > Sayım kartı.</summary>
        public static object KisaDurum()
        {
            JObject d = null;
            try { if (File.Exists(DurumDosyasi)) d = JObject.Parse(File.ReadAllText(DurumDosyasi, Encoding.UTF8)); } catch { }
            lock (_kilit)
            {
                return new
                {
                    kurulu = Kurulu,
                    klasor = Klasor,
                    kisayol = File.Exists(KisayolYolu),
                    surum = Kurulu ? SurumOku() : null,
                    paketSurum = d?.Value<string>("paketSurum"),
                    kurulum = d?.Value<string>("kurulum"),
                    sunucu = d?.Value<string>("sunucu"),
                    kullanici = d?.Value<string>("kullanici"),
                    resimYolu = d?.Value<string>("resimYolu"),
                    test = d?["test"],
                    sonGuncelleme = d?.Value<string>("guncelleme"),
                    guncellemeBekliyor = GuncellemeBekliyor,
                    kuruluyor = _kuruluyor,
                    ilerleme = _ilerleme,
                };
            }
        }

        /// <summary>Diske yazılan son bilginin Hub imzası — nabızdaki imzayla karşılaştırılır.</summary>
        public static string UygulananImza
        {
            get { try { return File.Exists(DurumDosyasi) ? JObject.Parse(File.ReadAllText(DurumDosyasi, Encoding.UTF8)).Value<string>("imza") : null; } catch { return null; } }
        }

        private static string SurumOku()
        {
            try { return FileVersionInfo.GetVersionInfo(Exe).FileVersion; } catch { return null; }
        }

        private static void Ilerle(string adim, int yuzde, string mesaj, double hiz = 0, bool bitti = false, string hata = null)
        {
            lock (_kilit)
                _ilerleme = new JObject { ["adim"] = adim, ["yuzde"] = yuzde, ["mesaj"] = mesaj, ["hiz"] = hiz, ["bitti"] = bitti, ["hata"] = hata };
        }

        private static void DurumYaz(Action<JObject> degistir)
        {
            JObject d = null;
            try { if (File.Exists(DurumDosyasi)) d = JObject.Parse(File.ReadAllText(DurumDosyasi, Encoding.UTF8)); } catch { }
            d = d ?? new JObject();
            degistir(d);
            Directory.CreateDirectory(Path.GetDirectoryName(DurumDosyasi));
            File.WriteAllText(DurumDosyasi, d.ToString(), Encoding.UTF8);
        }

        // ------------------------------------------------------------ kur

        /// <summary>
        /// Arka planda kurar; ilerleme KisaDurum().ilerleme'den izlenir. bilgi: servis /api/sayim "bilgi",
        /// paket: "paket" (url servis adresine göreli, sha256, boyut, surum).
        /// </summary>
        public static void KurBaslat(JObject bilgi, JObject paket, string servisAdresi, string token)
        {
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
                    await Kur(bilgi, paket, servisAdresi, token);
                    Ilerle("bitti", 100, "Sayım kuruldu.", 0, true);
                    Gunluk.Yaz("Sayım kuruldu: " + Klasor);
                }
                catch (Exception e)
                {
                    var m = e is KullaniciHatasi ? e.Message : e.GetBaseException().Message;
                    Ilerle("hata", 0, null, 0, true, m);
                    Gunluk.Yaz("Sayım kurulamadı: " + m);
                }
                finally { lock (_kilit) _kuruluyor = false; }
            });
        }

        private static async Task Kur(JObject bilgi, JObject paket, string servisAdresi, string token)
        {
            // 1) Klasör — C:\Pusula yoksa ya da yazılamıyorsa yönetici
            if (!KlasorYazilabilir())
            {
                Ilerle("klasor", 2, "Klasör için yönetici izni isteniyor…");
                var kod = await YoneticiCalistir("--sayim-klasor");
                if (kod == -1) throw new KullaniciHatasi("Yönetici izni verilmedi. " + Klasor + " klasörünü oluşturmak için izin gerekir; tekrar deneyin.");
                if (!KlasorYazilabilir()) throw new KullaniciHatasi("Klasör oluşturulamadı: " + Klasor + " (çıkış kodu " + kod + ")");
            }

            // 2) Paket — zaten aynı sürüm kuruluysa indirme atlanır, yalnız dosyalar yenilenir
            var paketSurum = paket.Value<string>("surum");
            var kuruluSurum = Kurulu ? SurumOku() : null;
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

            // 3) Pusula X dosyaları
            Ilerle("dosyalar", 96, "Bağlantı dosyaları yazılıyor…");
            File.WriteAllText(Path.Combine(Klasor, "RFID.xml"), "");   // boş: Pusula X yalnız varlığına bakar
            DosyalariYaz(bilgi);

            // 4) Kısayol
            Ilerle("kisayol", 98, "Masaüstü kısayolu…");
            Kisayol();

            DurumYaz(d =>
            {
                d["kurulum"] = DateTime.Now.ToString("s");
                d["paketSurum"] = paketSurum;
                BilgiNotu(d, bilgi);
            });
            GuncellemeBekliyor = false;
        }

        /// <summary>Yalnız server.xml / lic.xml'i yeniler (bilgi Hub'da değişince; paket indirilmez).</summary>
        public static object Guncelle(JObject bilgi)
        {
            if (!Kurulu) throw new KullaniciHatasi("Sayım kurulu değil.", 409);
            DosyalariYaz(bilgi);
            DurumYaz(d => { d["guncelleme"] = DateTime.Now.ToString("s"); BilgiNotu(d, bilgi); });
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

        private static bool KlasorYazilabilir()
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

        private static string Indir(string url, string token, string beklenenSha, long boyut)
        {
            var klasor = Path.Combine(Path.GetTempPath(), "PusulaConnect2");
            Directory.CreateDirectory(klasor);
            var hedef = Path.Combine(klasor, "PusulaXSayim.zip");
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
                    if (y != son) { son = y; Ilerle("indir", y, "Pusula X indiriliyor… " + (alinan / 1048576) + " / " + (toplam / 1048576) + " MB", hiz); }
                }
                sha.TransformFinalBlock(new byte[0], 0, 0);
                var ozet = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                if (!string.IsNullOrEmpty(beklenenSha) && !string.Equals(ozet, beklenenSha, StringComparison.OrdinalIgnoreCase))
                    throw new KullaniciHatasi("İndirilen paket doğrulanamadı (SHA-256 uyuşmuyor); tekrar deneyin.");
            }
            return hedef;
        }

        /// <summary>Zip'i klasöre açar; var olan dosyaların üstüne yazar (lic/server/RFID zipte yok, korunur).</summary>
        private static void Ac(string zip)
        {
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
                    catch (IOException) when (Path.GetFileName(hedef).Equals("PusulaX.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new KullaniciHatasi("Pusula Sayım açık görünüyor; kapatıp tekrar deneyin.");
                    }
                }
            }
        }

        // ------------------------------------------------------------ Pusula X dosyaları

        private static void DosyalariYaz(JObject bilgi)
        {
            var sunucu = bilgi.Value<string>("sunucu");
            var kullanici = bilgi.Value<string>("kullanici");
            var sifre = bilgi.Value<string>("sifre");
            var dataCode = bilgi.Value<string>("dataCode");
            if (string.IsNullOrWhiteSpace(sunucu) || string.IsNullOrWhiteSpace(kullanici) || string.IsNullOrWhiteSpace(dataCode))
                throw new KullaniciHatasi("Sayım bilgisi eksik (sunucu / kullanıcı / firma kodu).");

            var server = new XElement("Server",
                new XElement("Name", PusulaSifrele(sunucu)),
                new XElement("UserName", PusulaSifrele(kullanici)),
                new XElement("Password", PusulaSifrele(sifre ?? "")),
                new XElement("DataCode", PusulaSifrele(dataCode)));
            var resim = bilgi.Value<string>("resimYolu");
            if (!string.IsNullOrWhiteSpace(resim)) server.Add(new XElement("ImgPath", resim));   // düz metin (Pusula X böyle okur)
            XmlYaz(Path.Combine(Klasor, "server.xml"), server);

            // Mevcut lic.xml'in LicenceCode'u korunur
            var licYolu = Path.Combine(Klasor, "lic.xml");
            string licenceCode = null;
            try { if (File.Exists(licYolu)) licenceCode = XDocument.Load(licYolu).Root?.Element("Licence")?.Element("LicenceCode")?.Value; } catch { }
            if (string.IsNullOrEmpty(licenceCode)) licenceCode = PusulaSifrele(Guid.NewGuid().ToString("N").Substring(0, 8).ToUpperInvariant());

            XmlYaz(licYolu, new XElement("Licence",
                new XElement("CompanyId", PusulaSifrele(dataCode)),
                new XElement("CompanyName", PusulaSifrele(bilgi.Value<string>("firmaAdi") ?? dataCode)),
                new XElement("PcName", PusulaSifrele(Environment.MachineName)),
                new XElement("LicenceName", PusulaSifrele(Kimlik.Profil()?.Value<string>("kullanici") ?? kullanici)),
                new XElement("LicenceCode", licenceCode),
                new XElement("ProgramCode", PusulaSifrele(ProgramKodu)),
                new XElement("Language", "tr")));
        }

        private static void XmlYaz(string yol, XElement tablo)
        {
            // Pusula X DataSet.ReadXml ile okur: <Pusula><Server>…</Server></Pusula>
            var d = new XDocument(new XDeclaration("1.0", null, "yes"), new XElement("Pusula", tablo));
            using (var w = new StreamWriter(yol, false, new UTF8Encoding(false))) d.Save(w);
        }

        /// <summary>Pusula X Model/Crypto.cs ile birebir: TripleDES CBC/PKCS7, key SHA1(UTF-16 anahtar)[0..24], IV SHA1("")[0..8], metin UTF-16LE.</summary>
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

        // ------------------------------------------------------------ kısayol

        private static void Kisayol()
        {
            try
            {
                var tur = Type.GetTypeFromProgID("WScript.Shell");
                var kabuk = Activator.CreateInstance(tur);
                var k = tur.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, kabuk, new object[] { KisayolYolu });
                var kt = k.GetType();
                kt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, k, new object[] { Exe });
                kt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, k, new object[] { Klasor });
                kt.InvokeMember("Description", BindingFlags.SetProperty, null, k, new object[] { "Pusula Sayım" });
                kt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, k, new object[] { Exe + ",0" });
                kt.InvokeMember("Save", BindingFlags.InvokeMethod, null, k, null);
            }
            catch (Exception e) { Gunluk.Yaz("Sayım kısayolu oluşturulamadı: " + e.Message); }
        }

        // ------------------------------------------------------------ test

        /// <summary>server.xml'deki bilgiyle SQL'e bağlanır, firma login'inin veritabanlarını listeler.</summary>
        public static async Task<object> Test()
        {
            if (!Kurulu) throw new KullaniciHatasi("Sayım kurulu değil.", 409);
            string sunucu, kullanici, sifre, dataCode;
            try
            {
                var s = XDocument.Load(Path.Combine(Klasor, "server.xml")).Root?.Element("Server");
                sunucu = PusulaCoz(s?.Element("Name")?.Value);
                kullanici = PusulaCoz(s?.Element("UserName")?.Value);
                sifre = PusulaCoz(s?.Element("Password")?.Value);
                dataCode = PusulaCoz(s?.Element("DataCode")?.Value);
            }
            catch (Exception e) { throw new KullaniciHatasi("server.xml okunamadı: " + e.Message); }
            if (string.IsNullOrWhiteSpace(sunucu)) throw new KullaniciHatasi("server.xml'de sunucu yok.");
            _ = dataCode;   // yalnız dosyadan okunduğu doğrulanır; liste login yetkisiyle gelir

            var sw = Stopwatch.StartNew();
            var sonuc = new JObject { ["zaman"] = DateTime.Now.ToString("s"), ["sunucu"] = sunucu, ["kullanici"] = kullanici };
            try
            {
                var cs = new SqlConnectionStringBuilder
                {
                    DataSource = sunucu, UserID = kullanici, Password = sifre, InitialCatalog = "master",
                    ConnectTimeout = 10, Encrypt = false, ApplicationName = "Pusula Connect (sayım testi)",
                };
                using (var c = new SqlConnection(cs.ConnectionString))
                {
                    await c.OpenAsync();
                    sonuc["sqlSurum"] = c.ServerVersion;
                    // Firma login'inin görebildiği veritabanları; paylaşımlı 'sirket' (giriş listesi için gerekli) sayılmaz
                    var liste = new JArray();
                    using (var cmd = new SqlCommand("select name from sys.databases where database_id > 4 and has_dbaccess(name) = 1 and name <> 'sirket' order by name", c))
                    using (var r = await cmd.ExecuteReaderAsync())
                        while (await r.ReadAsync()) liste.Add(new JObject { ["ad"] = r.GetString(0) });
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
            Gunluk.Yaz("Sayım SQL testi: " + (sonuc.Value<bool?>("ok") == true ? "bağlandı, " + ((JArray)sonuc["veritabanlari"]).Count + " veritabanı" : "hata: " + sonuc.Value<string>("hata")));
            return sonuc;
        }

        /// <summary>Klasörü Gezgin'de açar (WebView içinden file:// açılmaz).</summary>
        public static object KlasorAc()
        {
            if (!Directory.Exists(Klasor)) throw new KullaniciHatasi("Klasör yok: " + Klasor, 404);
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + Klasor + "\"") { UseShellExecute = true });
            return new { tamam = true };
        }

        // ------------------------------------------------------------ kaldır

        /// <summary>Kısayolu kaldırır; klasoruSil ise Pusula X kopyasını da siler.</summary>
        public static object Kaldir(bool klasoruSil)
        {
            try { if (File.Exists(KisayolYolu)) File.Delete(KisayolYolu); } catch (Exception e) { Gunluk.Yaz("Sayım kısayolu silinemedi: " + e.Message); }
            if (klasoruSil && Directory.Exists(Klasor))
            {
                try { Directory.Delete(Klasor, true); }
                catch (Exception e) { throw new KullaniciHatasi("Klasör silinemedi (Pusula Sayım açık olabilir): " + e.GetBaseException().Message); }
            }
            else if (!klasoruSil && Kurulu)
            {
                // Klasör kalıyor ama sayım kapalı: RFID.xml kaldırılırsa kopya normal Pusula X gibi açılır — istenmez,
                // o yüzden server.xml silinir (bağlantı bilgisi diskte kalmasın); yeniden açınca yeniden yazılır.
                try { File.Delete(Path.Combine(Klasor, "server.xml")); } catch { }
            }
            DurumYaz(d => { d["kurulum"] = null; d["test"] = null; d["imza"] = null; });
            GuncellemeBekliyor = false;
            Gunluk.Yaz("Sayım kaldırıldı" + (klasoruSil ? " (klasörle)" : ""));
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

        /// <summary>"--sayim-klasor": C:\Pusula\PusulaXSayım'ı oluşturur, Users'a değiştirme hakkı verir — pencere açmaz.</summary>
        public static int YoneticiOlarakCalistir()
        {
            try
            {
                Directory.CreateDirectory(Klasor);
                // Users (S-1-5-32-545) Modify: Pusula X kendini güncelleyebilsin, Connect dosyaları yazabilsin
                var p = Process.Start(new ProcessStartInfo("icacls.exe", "\"" + Klasor + "\" /grant *S-1-5-32-545:(OI)(CI)M /T /Q")
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
