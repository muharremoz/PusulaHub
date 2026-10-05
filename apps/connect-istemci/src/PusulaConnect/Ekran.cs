using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PusulaConnect
{
    /// <summary>
    /// Ekran DPI'ı doğrudan Windows'tan. WinForms'un Control.DeviceDpi'ı .NET Framework 4.8'de app.config'te
    /// DpiAwareness ayarı yoksa 96 dönebiliyor: süreç PerMonitorV2 olsa da (Program.DpiFarkinda) %200 ölçekli
    /// dizüstünde uzak masaüstü %100 açılıyor, simgeler yarı boyutta kalıyordu (0.5.0, 1895 müşterisi).
    /// Sıra: pencerenin bulunduğu monitör → sistem DPI'ı → DeviceDpi.
    /// </summary>
    internal static class Ekran
    {
        [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern uint GetDpiForSystem();

        public static int Dpi(Control c)
        {
            try
            {
                var form = c?.FindForm();
                var h = form != null && form.IsHandleCreated ? form.Handle : c != null && c.IsHandleCreated ? c.Handle : IntPtr.Zero;
                if (h != IntPtr.Zero)
                {
                    var d = GetDpiForWindow(h);
                    if (d >= 96) return (int)d;
                }
                var s = GetDpiForSystem();
                if (s >= 96) return (int)s;
            }
            catch { /* Windows 10 1607 öncesi: API yok */ }
            return c?.DeviceDpi ?? 96;
        }

        /// <summary>96 DPI'a göre çarpan (1.0, 1.25, 1.5, 2.0 …).</summary>
        public static float Carpan(Control c) => Dpi(c) / 96f;
    }
}
