using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

class PusulaHubStarter
{
    static readonly string ProjectDir = @"C:\GitHub\Pusula Yazılım\PusulaHub";
    const int Port = 4242;

    static int Main()
    {
        Console.Title = "PusulaHub Starter";
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine();
        Console.WriteLine("        PusulaHub Baslatiliyor...");
        Console.WriteLine();
        Console.ResetColor();

        if (!Directory.Exists(ProjectDir))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("HATA: Uygulama dizini bulunamadi!");
            Console.WriteLine("      " + ProjectDir);
            Console.ResetColor();
            Console.WriteLine();
            Console.Write("Kapatmak icin Enter'a basin...");
            Console.ReadLine();
            return 1;
        }

        // Port doluysa oradaki process'i oldur
        KillPortOwner(Port);

        // Firewall kurali (sessizce dene)
        TryAddFirewallRule();

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("[1/1] Sunucu baslatiliyor (pnpm dev)...");
        Console.ResetColor();
        Console.WriteLine();
        Console.WriteLine("  > http://localhost:" + Port);
        foreach (string ip in GetLanIPs())
        {
            Console.WriteLine("  > Ag: http://" + ip + ":" + Port);
        }
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine("  Bu pencereyi kapatmayin - sunucu bu pencerede calisir.");
        Console.WriteLine("  Durdurmak icin: Ctrl+C veya pencereyi kapatin.");
        Console.ResetColor();
        Console.WriteLine();

        // 10 sn sonra tarayiciyi ac
        try
        {
            ProcessStartInfo openBrowser = new ProcessStartInfo("cmd.exe",
                "/c timeout /t 10 /nobreak >nul && start http://localhost:" + Port);
            openBrowser.CreateNoWindow = true;
            openBrowser.UseShellExecute = false;
            openBrowser.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(openBrowser);
        }
        catch { }

        // pnpm dev - konsolu bu pencerede tut
        ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c pnpm dev");
        psi.WorkingDirectory = ProjectDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = false;

        Process p = Process.Start(psi);
        p.WaitForExit();

        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("[BILGI] Sunucu durdu.");
        Console.ResetColor();
        Console.Write("Kapatmak icin Enter'a basin...");
        Console.ReadLine();
        return p.ExitCode;
    }

    static string[] GetLanIPs()
    {
        System.Collections.Generic.List<string> list = new System.Collections.Generic.List<string>();
        try
        {
            foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                {
                    if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                    {
                        string addr = ip.Address.ToString();
                        if (!addr.StartsWith("169.254."))
                        {
                            list.Add(addr);
                        }
                    }
                }
            }
        }
        catch { }
        return list.ToArray();
    }

    static void KillPortOwner(int port)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe",
                "/c for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :" + port + " ^| findstr LISTENING') do taskkill /F /PID %a >nul 2>&1");
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process k = Process.Start(psi);
            k.WaitForExit(3000);
        }
        catch { }
    }

    static void TryAddFirewallRule()
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe",
                "/c netsh advfirewall firewall show rule name=\"PusulaHub 4242\" >nul 2>&1 || netsh advfirewall firewall add rule name=\"PusulaHub 4242\" dir=in action=allow protocol=TCP localport=4242 >nul 2>&1");
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process f = Process.Start(psi);
            f.WaitForExit(3000);
        }
        catch { }
    }
}
