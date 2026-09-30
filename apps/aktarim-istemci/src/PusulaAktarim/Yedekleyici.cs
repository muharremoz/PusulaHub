using System;
using System.Data.SqlClient;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace PusulaAktarim
{
    /// <summary>
    /// Veritabanı yedeği: <c>BACKUP DATABASE … WITH COPY_ONLY</c>.
    ///
    /// COPY_ONLY: müşterinin kendi yedek zincirine (diferansiyel tabanı) dokunmaz.
    /// SQL Server çalışırken alınır — detach/servis durdurma gerekmez (web
    /// aktarımındaki kilitli .mdf sorunu burada yok).
    ///
    /// Dosyayı SQL Server servisi yazar; yalnız SQL bu bilgisayardaysa bizim
    /// okuyabileceğimiz bir klasöre yazdırabiliriz → <see cref="Klasor"/>,
    /// herkese yazma izniyle açılır (SQL servis hesabı her kurulumda farklı).
    /// </summary>
    internal static class Yedekleyici
    {
        public static string Klasor => Path.Combine(Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\", "PusulaAktarim", "Yedek");

        public static string KlasoruHazirla()
        {
            var k = Klasor;
            Directory.CreateDirectory(k);
            try
            {
                var di = new DirectoryInfo(k);
                var acl = di.GetAccessControl();
                var herkes = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
                acl.AddAccessRule(new FileSystemAccessRule(herkes, FileSystemRights.Modify,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                di.SetAccessControl(acl);
            }
            catch { /* izin verilemezse SQL yazamazsa hata mesajı açıklar */ }
            return k;
        }

        /// <summary>Boş yer (bayt) — yedek klasörünün sürücüsü.</summary>
        public static long BosYer()
        {
            try { return new DriveInfo(Path.GetPathRoot(Klasor)).AvailableFreeSpace; } catch { return -1; }
        }

        private static readonly Regex Yuzde = new Regex(@"^(\d{1,3}) percent", RegexOptions.IgnoreCase);

        /// <summary>Yedeği alır; ilerleme 0-100. İptal edilirse SQL'deki yedek de kesilir.</summary>
        public static async Task Al(SqlHedef h, string veritabani, string dosya, bool sikistir,
            Action<int> ilerleme, CancellationToken iptal)
        {
            if (File.Exists(dosya)) File.Delete(dosya);
            using (var c = new SqlConnection(h.BaglantiMetni("master", 15)))
            {
                c.FireInfoMessageEventOnUserErrors = false;
                c.InfoMessage += (s, e) =>
                {
                    // STATS = 5 → "10 percent processed."
                    foreach (SqlError m in e.Errors)
                    {
                        var eslesme = Yuzde.Match(m.Message ?? "");
                        if (eslesme.Success) ilerleme(Math.Min(100, int.Parse(eslesme.Groups[1].Value)));
                    }
                };
                await c.OpenAsync(iptal).ConfigureAwait(false);
                var secenek = "COPY_ONLY, CHECKSUM, INIT, FORMAT, STATS = 5" + (sikistir ? ", COMPRESSION" : "");
                var sorgu = "BACKUP DATABASE " + Koseli(veritabani) + " TO DISK = @dosya WITH " + secenek;
                using (var k = new SqlCommand(sorgu, c) { CommandTimeout = 0 })
                {
                    k.Parameters.AddWithValue("@dosya", dosya);
                    using (iptal.Register(() => { try { k.Cancel(); } catch { } }))
                        await k.ExecuteNonQueryAsync(iptal).ConfigureAwait(false);
                }
            }
            ilerleme(100);
        }

        private static string Koseli(string ad) => "[" + ad.Replace("]", "]]") + "]";
    }
}
