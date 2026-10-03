using System;
using System.IO;
using System.Security.Cryptography;

namespace PusulaConnect
{
    /// <summary>
    /// Güncelleme imzası: yayınlanan exe, Pusula'da ÇEVRİMDIŞI tutulan özel anahtarla imzalanır
    /// (scripts/connect-yayinla.sh → ~/.ssh/pusula-connect-imza.pem, RSA-3072, SHA-256, PKCS#1 v1.5);
    /// istemci yalnız buradaki açık anahtarla doğrulanan exe'yi kurar. Servisin verdiği SHA-256 yetmez:
    /// servis ele geçirilirse SHA da değiştirilir. Anahtar değişirse önce bu sınıfla yeni sürüm yayınlanmalı
    /// (eski anahtarla imzalı), sonra yeni anahtara geçilmeli.
    /// </summary>
    internal static class GuncellemeImzasi
    {
        private const string Modulus = "hL1Ig++j3JOeBBD/68gHiZH1NpImuJixAUVN2Bh7n4h5T/Pt1JX4uodhW0n3craZ6LvQp96JOVM7j5rD+swqTZk+/8Htq3Orrq5X5GDb98F5KRL4lRZ05lqVlFL5La7k7fJ1o/Pq6o1unZROVS1nT25+TBmSn5D/LxNNCpt+0zoPjIZJVQ6sXbJOF+M0UfFCVMKm4BCsicq3q/nF3eU05sA3mYvGVWox5T2Mw9uEFGTXgdQ7pmkftzdSwPSnlEDR3kGNQF3JNVoCqj34IEVddSyaXNkNXvesL5TSIXxs0XCci+q/oPuoSa2v2GSu20Ws59qZH17yFWTFcwDpxcPIulPjldEPXwuUXRA5fnOn1BGjs2sclYVTXL9bVucp10OV3k56aWebXrZcJJHWwwvmgk+i28bf1zVa/URXT839jF1S6aJi/CKunSkdftwTkNvMuxlv/jtVbpZwvc1Z7wb9YJL6LRdLlB+Nkh051cxYZ124c6sfmsW5em2mYERoTwWv";
        private const string Exponent = "AQAB";

        public static bool Dogru(string dosya, string imzaBase64)
        {
            if (string.IsNullOrWhiteSpace(imzaBase64)) return false;
            try
            {
                var imza = Convert.FromBase64String(imzaBase64.Trim());
                using (var rsa = new RSACryptoServiceProvider())
                {
                    rsa.ImportParameters(new RSAParameters { Modulus = Convert.FromBase64String(Modulus), Exponent = Convert.FromBase64String(Exponent) });
                    using (var f = File.OpenRead(dosya))
                        return rsa.VerifyData(f, imza, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                }
            }
            catch (Exception e) { Gunluk.Yaz("İmza doğrulama hatası: " + e.Message); return false; }
        }
    }
}
