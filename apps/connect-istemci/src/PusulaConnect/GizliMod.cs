using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PusulaConnect
{
    /// <summary>
    /// Ayarlar > Güvenlik > "Uygulamayı gizle" (0.7.3). Açıkken masaüstü/Başlat kısayolu ve tepsi simgesi olmaz,
    /// Windows açılışında pencere göstermeden başlar, ✕ uygulamayı kapatmaz gizler; pencere kullanıcının seçtiği
    /// genel kısayol tuşuyla (RegisterHotKey) açılır. Tuş başka bir programa aitse gizli mod AÇILMAZ — aksi halde
    /// kullanıcı uygulamaya geri dönemezdi.
    /// </summary>
    internal static class GizliMod
    {
        public const string VarsayilanTus = "Ctrl+Alt+P";
        private const int Kimlik = 0x5043; // "PC"
        private const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_WIN = 8, MOD_NOREPEAT = 0x4000;

        [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
        [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr h, int id);

        private static Dinleyici _dinleyici;
        private static Control _ui;
        private static string _kayitli;

        /// <summary>Tuşa basılınca (UI iş parçacığında).</summary>
        public static Action Basildi;

        /// <summary>UI iş parçacığında, Application.Run'dan önce çağrılır.</summary>
        public static void Kur(Control ui)
        {
            _ui = ui;
            _dinleyici = new Dinleyici();
        }

        /// <summary>
        /// Tuşu kaydeder (null: kaydı kaldırır). Hata varsa kullanıcıya gösterilecek mesaj, yoksa null.
        /// Her iş parçacığından çağrılabilir.
        /// </summary>
        public static string TusAyarla(string tus)
        {
            if (_ui == null || _dinleyici == null) return "Kısayol tuşu şu an ayarlanamıyor.";
            if (_ui.InvokeRequired) return (string)_ui.Invoke((Func<string>)(() => TusAyarla(tus)));

            if (tus == null)
            {
                if (_kayitli != null) { UnregisterHotKey(_dinleyici.Handle, Kimlik); Gunluk.Yaz("Gizli mod kısayolu kaldırıldı: " + _kayitli); }
                _kayitli = null;
                return null;
            }
            if (!Coz(tus, out var mod, out var vk, out var hata)) return hata;
            if (string.Equals(_kayitli, tus, StringComparison.OrdinalIgnoreCase)) return null;
            var onceki = _kayitli;
            if (onceki != null) UnregisterHotKey(_dinleyici.Handle, Kimlik);
            if (!RegisterHotKey(_dinleyici.Handle, Kimlik, mod | MOD_NOREPEAT, vk))
            {
                var kod = Marshal.GetLastWin32Error();
                Gunluk.Yaz("Gizli mod kısayolu kaydedilemedi (" + tus + "): Win32 " + kod);
                // Eskisi geri alınır — kullanıcı tuşsuz kalmasın
                if (onceki != null && Coz(onceki, out var m0, out var v0, out _)) RegisterHotKey(_dinleyici.Handle, Kimlik, m0 | MOD_NOREPEAT, v0);
                return kod == 1409 // ERROR_HOTKEY_ALREADY_REGISTERED
                    ? tus + " başka bir program tarafından kullanılıyor; başka bir kısayol seçin."
                    : tus + " kısayol olarak kaydedilemedi (" + kod + ").";
            }
            _kayitli = tus;
            Gunluk.Yaz("Gizli mod kısayolu: " + tus);
            return null;
        }

        /// <summary>
        /// "Ctrl+Alt+P" → değiştirici + sanal tuş. En az bir değiştirici (Ctrl/Alt/Win) şart: tek tuş ya da yalnız
        /// Shift'li tuş her yazıda tetiklenirdi.
        /// </summary>
        public static bool Coz(string tus, out uint mod, out uint vk, out string hata)
        {
            mod = 0; vk = 0; hata = null;
            var parcalar = (tus ?? "").Split('+').Select(p => p.Trim()).Where(p => p.Length > 0).ToList();
            if (parcalar.Count < 2) { hata = "Kısayol en az bir değiştirici tuş (Ctrl, Alt, Win) ve bir tuştan oluşmalı."; return false; }
            foreach (var p in parcalar.Take(parcalar.Count - 1))
            {
                switch (p.ToLowerInvariant())
                {
                    case "ctrl": mod |= MOD_CONTROL; break;
                    case "alt": mod |= MOD_ALT; break;
                    case "shift": mod |= MOD_SHIFT; break;
                    case "win": mod |= MOD_WIN; break;
                    default: hata = "Tanınmayan değiştirici: " + p; return false;
                }
            }
            // Tek değiştirici (Ctrl+P, Alt+F4…) tüm Windows'ta o kısayolu ele geçirirdi: Win'li ya da en az iki değiştiricili olmalı.
            var m = mod;
            var adet = new[] { MOD_CONTROL, MOD_ALT, MOD_SHIFT }.Count(b => (m & b) != 0);
            if ((mod & MOD_WIN) == 0 && adet < 2) { hata = "Kısayol en az iki değiştirici tuşla (ör. Ctrl+Alt, Ctrl+Shift) ya da Win ile olmalı; tek değiştirici başka programların kısayolunu ele geçirir."; return false; }
            var son = parcalar[parcalar.Count - 1];
            Keys k;
            if (son.Length == 1 && char.IsLetterOrDigit(son[0])) k = son[0] >= '0' && son[0] <= '9' ? Keys.D0 + (son[0] - '0') : (Keys)char.ToUpperInvariant(son[0]);
            else if (!Enum.TryParse(son, true, out k) || k == Keys.None) { hata = "Tanınmayan tuş: " + son; return false; }
            if (!((k >= Keys.F1 && k <= Keys.F24) || (k >= Keys.A && k <= Keys.Z) || (k >= Keys.D0 && k <= Keys.D9)))
            {
                hata = "Kısayolun son tuşu harf, rakam ya da F1–F24 olmalı.";
                return false;
            }
            // Türkçe klavyede Ctrl+Alt = Alt Gr: Q (@), E (€), rakamlar ({ [ ] } # $ ½ £ >) yazılamaz hale gelirdi
            if (mod == (MOD_CONTROL | MOD_ALT) && (k == Keys.Q || k == Keys.E || (k >= Keys.D0 && k <= Keys.D9)))
            {
                hata = "Ctrl+Alt+" + son + " Türkçe klavyede Alt Gr ile çakışır (@, €, {, [ gibi karakterler yazılamaz); başka bir tuş seçin.";
                return false;
            }
            vk = (uint)k;
            return true;
        }

        /// <summary>WM_HOTKEY'i alan görünmez pencere (yalnız mesaj).</summary>
        private sealed class Dinleyici : NativeWindow
        {
            public Dinleyici() { CreateHandle(new CreateParams { Parent = new IntPtr(-3) /* HWND_MESSAGE */ }); }

            protected override void WndProc(ref Message m)
            {
                if (m.Msg == 0x0312 && m.WParam.ToInt32() == Kimlik) // WM_HOTKEY
                {
                    try { Basildi?.Invoke(); } catch (Exception e) { Gunluk.Yaz("Kısayol işlenemedi: " + e.Message); }
                    return;
                }
                base.WndProc(ref m);
            }
        }
    }
}
