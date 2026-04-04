/* ================================================================
   PusulaAgent — Windows Tray Agent (Pull Model)
   Hub bu agent'in HTTP API'sini cagirarak metrik toplar.

   Derleme: csc /target:winexe /out:PusulaAgent.exe
            /r:System.Core.dll,System.Windows.Forms.dll,
               System.Drawing.dll,System.Management.dll,
               System.ServiceProcess.dll
            PusulaAgent.cs
================================================================ */

using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PusulaAgent
{

/* ================================================================
   JSON HELPER — Minimal serializer (no external dependency)
================================================================ */
static class Json
{
    public static string Serialize(object obj)
    {
        if (obj == null) return "null";
        if (obj is string) return "\"" + Escape((string)obj) + "\"";
        if (obj is bool) return (bool)obj ? "true" : "false";
        if (obj is int || obj is long || obj is float || obj is double || obj is decimal)
            return string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0}", obj);
        if (obj is IDictionary)
        {
            var dict = (IDictionary)obj;
            var parts = new List<string>();
            foreach (DictionaryEntry e in dict)
                parts.Add("\"" + Escape(e.Key.ToString()) + "\":" + Serialize(e.Value));
            return "{" + string.Join(",", parts) + "}";
        }
        if (obj is IEnumerable)
        {
            var parts = new List<string>();
            foreach (var item in (IEnumerable)obj)
                parts.Add(Serialize(item));
            return "[" + string.Join(",", parts) + "]";
        }
        return "\"" + Escape(obj.ToString()) + "\"";
    }

    private static string Escape(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
    }
}

/* ================================================================
   CONFIGURATION
================================================================ */
class AgentConfig
{
    public int Port { get; set; }
    public string ApiKey { get; set; }
    public bool AutoStart { get; set; }

    private string _path;

    public AgentConfig()
    {
        Port = 8585;
        ApiKey = "";
        AutoStart = true;
    }

    public static AgentConfig Load(string dir)
    {
        var cfg = new AgentConfig();
        cfg._path = Path.Combine(dir, "config.json");
        if (!File.Exists(cfg._path)) return null;
        try
        {
            string raw = File.ReadAllText(cfg._path, Encoding.UTF8);
            var m1 = Regex.Match(raw, "\"port\"\\s*:\\s*(\\d+)");
            var m2 = Regex.Match(raw, "\"apiKey\"\\s*:\\s*\"([^\"]*)\"");
            var m3 = Regex.Match(raw, "\"autoStart\"\\s*:\\s*(true|false)");
            if (m1.Success) cfg.Port = int.Parse(m1.Groups[1].Value);
            if (m2.Success) cfg.ApiKey = m2.Groups[1].Value;
            if (m3.Success) cfg.AutoStart = m3.Groups[1].Value == "true";
            return cfg;
        }
        catch { return null; }
    }

    public void Save(string dir)
    {
        _path = Path.Combine(dir, "config.json");
        string json = string.Format(
            "{{\n  \"port\": {0},\n  \"apiKey\": \"{1}\",\n  \"autoStart\": {2}\n}}",
            Port, ApiKey, AutoStart ? "true" : "false");
        File.WriteAllText(_path, json, Encoding.UTF8);
    }

    public static string GenerateApiKey()
    {
        var g = Guid.NewGuid().ToString("N");
        return string.Format("psl-{0}-{1}-{2}",
            g.Substring(0, 4), g.Substring(4, 4), g.Substring(8, 4));
    }
}

/* ================================================================
   METRIC COLLECTOR
================================================================ */
static class Metrics
{
    private static PerformanceCounter _cpuCounter;
    private static readonly object _lock = new object();
    private static Dictionary<string, object> _lastSnapshot;

    public static void Init()
    {
        try
        {
            _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
            _cpuCounter.NextValue(); // ilk cagri her zaman 0 doner
        }
        catch { }
    }

    public static Dictionary<string, object> Collect()
    {
        var report = new Dictionary<string, object>();
        report["hostname"] = Environment.MachineName;
        report["ip"] = GetPrimaryIp();
        report["os"] = "windows";
        report["version"] = "2.0.0";

        // --- CPU ---
        float cpu = 0;
        try
        {
            if (_cpuCounter != null) cpu = _cpuCounter.NextValue();
        }
        catch { }
        // PerformanceCounter basarisizsa WMI ile dene
        if (cpu <= 0)
        {
            try
            {
                using (var mos = new ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        cpu = Convert.ToSingle(mo["LoadPercentage"]);
                        break;
                    }
                }
            }
            catch { }
        }

        // --- RAM ---
        long totalMB = 0, freeMB = 0;
        try
        {
            using (var mos = new ManagementObjectSearcher("SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem"))
            {
                foreach (ManagementObject mo in mos.Get())
                {
                    totalMB = Convert.ToInt64(mo["TotalVisibleMemorySize"]) / 1024;
                    freeMB = Convert.ToInt64(mo["FreePhysicalMemory"]) / 1024;
                }
            }
        }
        catch { }
        long usedMB = totalMB - freeMB;

        // --- DISK ---
        var disks = new List<Dictionary<string, object>>();
        try
        {
            foreach (var d in DriveInfo.GetDrives())
            {
                if (d.DriveType != DriveType.Fixed || !d.IsReady) continue;
                double totalGB = Math.Round(d.TotalSize / 1073741824.0, 1);
                double freeGB = Math.Round(d.AvailableFreeSpace / 1073741824.0, 1);
                double usedGB = Math.Round(totalGB - freeGB, 1);
                int pct = totalGB > 0 ? (int)Math.Round((usedGB / totalGB) * 100) : 0;
                var dd = new Dictionary<string, object>();
                dd["drive"] = d.Name;
                dd["totalGB"] = totalGB;
                dd["usedGB"] = usedGB;
                dd["percent"] = pct;
                disks.Add(dd);
            }
        }
        catch { }

        // --- UPTIME ---
        long uptimeSec = 0;
        try
        {
            uptimeSec = (long)(Environment.TickCount / 1000.0);
            if (uptimeSec < 0) uptimeSec = 0; // TickCount overflows after 49 days
            // Use WMI for accurate uptime
            using (var mos = new ManagementObjectSearcher("SELECT LastBootUpTime FROM Win32_OperatingSystem"))
            {
                foreach (ManagementObject mo in mos.Get())
                {
                    var bootStr = mo["LastBootUpTime"].ToString();
                    var boot = ManagementDateTimeConverter.ToDateTime(bootStr);
                    uptimeSec = (long)(DateTime.Now - boot).TotalSeconds;
                }
            }
        }
        catch { }

        // --- NETWORK ---
        var nets = new List<Dictionary<string, object>>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var props = ni.GetIPProperties();
                string ipv4 = "";
                foreach (var addr in props.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        ipv4 = addr.Address.ToString();
                        break;
                    }
                }
                if (string.IsNullOrEmpty(ipv4)) continue;
                var nd = new Dictionary<string, object>();
                nd["name"] = ni.Name;
                nd["ipv4"] = ipv4;
                nd["sentMB"] = 0;
                nd["recvMB"] = 0;
                nets.Add(nd);
            }
        }
        catch { }

        // Metrics object
        var metrics = new Dictionary<string, object>();
        metrics["cpu"] = Math.Round(cpu, 1);
        var ram = new Dictionary<string, object>();
        ram["totalMB"] = totalMB;
        ram["usedMB"] = usedMB;
        ram["freeMB"] = freeMB;
        metrics["ram"] = ram;
        metrics["disks"] = disks;
        metrics["uptimeSeconds"] = uptimeSec;
        metrics["network"] = nets;
        report["metrics"] = metrics;

        // --- ROLES ---
        var roles = new List<string>();
        try
        {
            var services = ServiceController.GetServices();
            if (services.Any(s => s.ServiceName == "W3SVC")) roles.Add("IIS");
            if (services.Any(s => s.ServiceName == "MSSQLSERVER" || s.ServiceName.StartsWith("MSSQL$"))) roles.Add("MSSQL");
            if (services.Any(s => s.ServiceName == "NTDS")) roles.Add("AD");
            if (services.Any(s => s.ServiceName == "DNS")) roles.Add("DNS");
            if (services.Any(s => s.ServiceName == "DHCPServer")) roles.Add("DHCP");
        }
        catch { }
        report["roles"] = roles;

        // --- IIS SITES ---
        if (roles.Contains("IIS"))
        {
            try { report["iis"] = CollectIis(); } catch { }
        }

        // --- SESSIONS (quser) ---
        try { report["sessions"] = CollectSessions(); } catch { }

        // --- SECURITY (adapters, ports, shares, firewall) ---
        try { report["security"] = CollectSecurity(); } catch { }

        // --- LOGS (Event Log + Failed Logins) ---
        try { report["logs"] = CollectLogs(); } catch { }

        // --- AD USERS ---
        if (roles.Contains("AD"))
        {
            try { report["ad"] = CollectAD(); } catch { }
        }
        else
        {
            try { report["localUsers"] = CollectLocalUsers(); } catch { }
        }

        // --- MSSQL ---
        if (roles.Contains("MSSQL"))
        {
            try { report["mssql"] = CollectMssql(); } catch { }
        }

        lock (_lock) { _lastSnapshot = report; }
        return report;
    }

    public static Dictionary<string, object> GetLast()
    {
        lock (_lock) { return _lastSnapshot; }
    }

    private static Dictionary<string, object> CollectIis()
    {
        var sites = new List<Dictionary<string, object>>();
        var pools = new List<Dictionary<string, object>>();
        try
        {
            using (var mos = new ManagementObjectSearcher("root\\WebAdministration", "SELECT * FROM Site"))
            {
                foreach (ManagementObject mo in mos.Get())
                {
                    var sd = new Dictionary<string, object>();
                    sd["name"] = (mo["Name"] ?? "").ToString();
                    sd["id"] = Convert.ToInt32(mo["Id"]);
                    sites.Add(sd);
                }
            }
        }
        catch { }
        var result = new Dictionary<string, object>();
        result["sites"] = sites;
        result["pools"] = pools;
        return result;
    }

    /* --- SESSIONS via quser --- */
    private static List<Dictionary<string, object>> CollectSessions()
    {
        var list = new List<Dictionary<string, object>>();
        try
        {
            var psi = new ProcessStartInfo("quser")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.GetEncoding(850)
            };
            var proc = Process.Start(psi);
            string output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(5000);

            var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 1; i < lines.Length; i++) // skip header
            {
                string line = lines[i];
                // quser format:  USERNAME  SESSIONNAME  ID  STATE  IDLE TIME  LOGON TIME
                // May have > prefix for current user
                string trimmed = line.TrimStart('>').TrimStart();
                // Parse by fixed column positions (quser uses fixed-width columns)
                // Alternative: split by 2+ spaces
                var parts = Regex.Split(trimmed, "\\s{2,}");
                if (parts.Length < 4) continue;

                var d = new Dictionary<string, object>();
                d["username"] = parts[0].Trim();

                // Detect if session name is present (RDP-Tcp#N or console)
                string sessionName = "";
                string state = "";
                string logonTime = "";

                if (parts.Length >= 6)
                {
                    sessionName = parts[1].Trim();
                    // parts[2] = ID, parts[3] = STATE, parts[4] = IDLE, parts[5] = LOGON TIME
                    state = parts[3].Trim();
                    logonTime = parts[5].Trim();
                }
                else if (parts.Length >= 5)
                {
                    sessionName = parts[1].Trim();
                    state = parts[3].Trim();
                    logonTime = parts[4].Trim();
                }
                else
                {
                    state = parts[2].Trim();
                    logonTime = parts.Length > 3 ? parts[3].Trim() : "";
                }

                d["sessionType"] = sessionName.ToLower().Contains("rdp") ? "RDP"
                                 : sessionName.ToLower().Contains("console") ? "Console"
                                 : "RDP";
                d["state"] = state;
                d["logonTime"] = logonTime;
                d["clientIp"] = "";
                list.Add(d);
            }

            // Try to get client IPs from qwinsta /mode
            try
            {
                var psi2 = new ProcessStartInfo("query", "session")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    StandardOutputEncoding = Encoding.GetEncoding(850)
                };
                // We'll use WMI Win32_LogonSession + Win32_NetworkLoginProfile for client IPs
            }
            catch { }
        }
        catch { }
        return list;
    }

    /* --- SECURITY: adapters, ports, shares, firewall --- */
    private static Dictionary<string, object> CollectSecurity()
    {
        var result = new Dictionary<string, object>();

        // Firewall status
        var fw = new Dictionary<string, object>();
        fw["enabled"] = false;
        fw["rulesCount"] = 0;
        try
        {
            var psi = new ProcessStartInfo("netsh", "advfirewall show allprofiles state")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            };
            var proc = Process.Start(psi);
            string fwOut = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(5000);
            fw["enabled"] = fwOut.ToLower().Contains("on");

            // Count rules
            var psi2 = new ProcessStartInfo("netsh", "advfirewall firewall show rule name=all")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            };
            var proc2 = Process.Start(psi2);
            string rulesOut = proc2.StandardOutput.ReadToEnd();
            proc2.WaitForExit(10000);
            int count = 0;
            foreach (string line in rulesOut.Split('\n'))
            {
                if (line.TrimStart().StartsWith("Rule Name:") || line.TrimStart().StartsWith("Kural Ad"))
                    count++;
            }
            fw["rulesCount"] = count;
        }
        catch { }
        result["firewall"] = fw;

        // Network adapters (detailed)
        var adapters = new List<Dictionary<string, object>>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var props = ni.GetIPProperties();
                string ipv4 = "";
                foreach (var addr in props.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        ipv4 = addr.Address.ToString();
                        break;
                    }
                }
                if (string.IsNullOrEmpty(ipv4)) continue;

                var ad = new Dictionary<string, object>();
                ad["name"] = ni.Description;
                ad["ip"] = ipv4;
                ad["mac"] = ni.GetPhysicalAddress().ToString();
                // Format MAC address
                string rawMac = ni.GetPhysicalAddress().ToString();
                if (rawMac.Length == 12)
                {
                    ad["mac"] = string.Format("{0}:{1}:{2}:{3}:{4}:{5}",
                        rawMac.Substring(0,2), rawMac.Substring(2,2), rawMac.Substring(4,2),
                        rawMac.Substring(6,2), rawMac.Substring(8,2), rawMac.Substring(10,2));
                }
                ad["speed"] = ni.Speed > 0 ? string.Format("{0} Mbps", ni.Speed / 1000000) : "N/A";
                ad["status"] = ni.OperationalStatus.ToString();
                adapters.Add(ad);
            }
        }
        catch { }
        result["adapters"] = adapters;

        // Open ports (netstat)
        var ports = new List<Dictionary<string, object>>();
        try
        {
            var psi = new ProcessStartInfo("netstat", "-ano")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            };
            var proc = Process.Start(psi);
            string netstatOut = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(10000);

            var seen = new HashSet<string>();
            foreach (string line in netstatOut.Split('\n'))
            {
                string trimmed = line.Trim();
                if (!trimmed.StartsWith("TCP") && !trimmed.StartsWith("UDP")) continue;
                if (!trimmed.Contains("LISTENING") && !trimmed.StartsWith("UDP")) continue;

                var parts = Regex.Split(trimmed, "\\s+");
                if (parts.Length < 4) continue;

                string proto = parts[0];
                string localAddr = parts[1];
                string pidStr = parts[parts.Length - 1];

                // Extract port
                int lastColon = localAddr.LastIndexOf(':');
                if (lastColon < 0) continue;
                string portStr = localAddr.Substring(lastColon + 1);
                int portNum;
                if (!int.TryParse(portStr, out portNum)) continue;

                // Skip ephemeral ports
                if (portNum > 49151) continue;

                string key = proto + ":" + portNum;
                if (seen.Contains(key)) continue;
                seen.Add(key);

                int pid = 0;
                int.TryParse(pidStr, out pid);

                string procName = "";
                try
                {
                    if (pid > 0)
                    {
                        var p = Process.GetProcessById(pid);
                        procName = p.ProcessName;
                    }
                }
                catch { }

                var pd = new Dictionary<string, object>();
                pd["port"] = portNum;
                pd["protocol"] = proto;
                pd["process"] = procName;
                pd["pid"] = pid;
                ports.Add(pd);
            }
            // Sort by port number
            ports.Sort((a, b) => ((int)a["port"]).CompareTo((int)b["port"]));
            // Limit to first 50
            if (ports.Count > 50) ports = ports.GetRange(0, 50);
        }
        catch { }
        result["ports"] = ports;

        // Shared folders
        var shares = new List<Dictionary<string, object>>();
        try
        {
            using (var mos = new ManagementObjectSearcher("SELECT Name, Path, Description FROM Win32_Share"))
            {
                foreach (ManagementObject mo in mos.Get())
                {
                    string name = (mo["Name"] ?? "").ToString();
                    // Skip default admin shares (C$, D$, ADMIN$, IPC$)
                    if (name.EndsWith("$")) continue;
                    var sd = new Dictionary<string, object>();
                    sd["name"] = name;
                    sd["path"] = (mo["Path"] ?? "").ToString();
                    sd["access"] = (mo["Description"] ?? "").ToString();
                    shares.Add(sd);
                }
            }
        }
        catch { }
        result["shares"] = shares;

        // Firewall rules (first 50 enabled)
        var fwRules = new List<Dictionary<string, object>>();
        try
        {
            var psi = new ProcessStartInfo("powershell", "-NoProfile -Command \"Get-NetFirewallRule -Enabled True | Select-Object -First 50 DisplayName,Direction,Action | ConvertTo-Csv -NoTypeInformation\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                StandardOutputEncoding = Encoding.UTF8
            };
            var proc = Process.Start(psi);
            string csvOut = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(15000);

            var csvLines = csvOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 1; i < csvLines.Length && i <= 50; i++)
            {
                // CSV: "DisplayName","Direction","Action"
                var match = Regex.Match(csvLines[i], "\"([^\"]*)\",\"([^\"]*)\",\"([^\"]*)\"");
                if (!match.Success) continue;
                var rd = new Dictionary<string, object>();
                rd["name"] = match.Groups[1].Value;
                rd["direction"] = match.Groups[2].Value == "1" ? "In" : "Out";
                rd["action"] = match.Groups[3].Value == "2" ? "Allow" : "Block";
                rd["enabled"] = true;
                fwRules.Add(rd);
            }
        }
        catch { }
        result["firewallRules"] = fwRules;

        return result;
    }

    /* --- LOGS: Event Log + Failed Logins --- */
    private static Dictionary<string, object> CollectLogs()
    {
        var result = new Dictionary<string, object>();

        // Recent events from System + Application (last 1 hour, max 30)
        var events = new List<Dictionary<string, object>>();
        try
        {
            // Use WMI to query event log — works without admin for most logs
            string query = "SELECT TimeGenerated, EventType, SourceName, Message FROM Win32_NTLogEvent WHERE (LogFile='System' OR LogFile='Application') AND EventType<=3 AND TimeGenerated > '" +
                ManagementDateTimeConverter.ToDmtfDateTime(DateTime.Now.AddHours(-1)) + "'";

            using (var mos = new ManagementObjectSearcher(query))
            {
                int count = 0;
                foreach (ManagementObject mo in mos.Get())
                {
                    if (count >= 30) break;
                    var ed = new Dictionary<string, object>();
                    try
                    {
                        var timeStr = mo["TimeGenerated"].ToString();
                        var time = ManagementDateTimeConverter.ToDateTime(timeStr);
                        ed["timestamp"] = time.ToString("yyyy-MM-ddTHH:mm:ss");
                    }
                    catch { ed["timestamp"] = ""; }

                    int eventType = Convert.ToInt32(mo["EventType"]);
                    ed["level"] = eventType == 1 ? "error" : eventType == 2 ? "warning" : "info";
                    ed["source"] = (mo["SourceName"] ?? "").ToString();
                    string msg = (mo["Message"] ?? "").ToString();
                    // Truncate long messages
                    if (msg.Length > 200)
                    {
                        int nl = msg.IndexOf('\n');
                        if (nl > 0 && nl < 200) msg = msg.Substring(0, nl);
                        else msg = msg.Substring(0, 200);
                    }
                    ed["message"] = msg.Trim();
                    events.Add(ed);
                    count++;
                }
            }
        }
        catch { }
        result["events"] = events;

        // Failed logins (Security Log, EventID 4625)
        var failedLogins = new List<Dictionary<string, object>>();
        try
        {
            string query = "SELECT TimeGenerated, InsertionStrings FROM Win32_NTLogEvent WHERE LogFile='Security' AND EventCode=4625 AND TimeGenerated > '" +
                ManagementDateTimeConverter.ToDmtfDateTime(DateTime.Now.AddHours(-24)) + "'";

            using (var mos = new ManagementObjectSearcher(query))
            {
                int count = 0;
                foreach (ManagementObject mo in mos.Get())
                {
                    if (count >= 20) break;
                    var fd = new Dictionary<string, object>();
                    try
                    {
                        var timeStr = mo["TimeGenerated"].ToString();
                        var time = ManagementDateTimeConverter.ToDateTime(timeStr);
                        fd["timestamp"] = time.ToString("yyyy-MM-ddTHH:mm:ss");
                    }
                    catch { fd["timestamp"] = ""; }

                    fd["username"] = "";
                    fd["clientIp"] = "";
                    try
                    {
                        var ins = (string[])mo["InsertionStrings"];
                        if (ins != null && ins.Length > 5)
                        {
                            fd["username"] = ins[5]; // TargetUserName
                        }
                        if (ins != null && ins.Length > 19)
                        {
                            fd["clientIp"] = ins[19]; // IpAddress
                        }
                    }
                    catch { }
                    failedLogins.Add(fd);
                    count++;
                }
            }
        }
        catch { }
        result["failedLogins"] = failedLogins;

        return result;
    }

    /* --- Active Directory users --- */
    private static Dictionary<string, object> CollectAD()
    {
        var result = new Dictionary<string, object>();
        var users = new List<Dictionary<string, object>>();
        try
        {
            // Use PowerShell to get AD users (requires RSAT/AD module)
            var psi = new ProcessStartInfo("powershell", "-NoProfile -Command \"Import-Module ActiveDirectory; Get-ADUser -Filter * -Properties LastLogonDate,EmailAddress,DisplayName -ResultSetSize 200 | Select-Object SamAccountName,DisplayName,EmailAddress,Enabled,@{N='OU';E={($_.DistinguishedName -split ',OU=' | Select-Object -Index 1)}},@{N='LastLogin';E={if($_.LastLogonDate){$_.LastLogonDate.ToString('dd.MM.yyyy HH:mm')}else{'Hic'}}} | ConvertTo-Csv -NoTypeInformation\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                StandardOutputEncoding = Encoding.UTF8
            };
            var proc = Process.Start(psi);
            string csvOut = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(30000);

            var csvLines = csvOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 1; i < csvLines.Length; i++)
            {
                // CSV: "SamAccountName","DisplayName","EmailAddress","Enabled","OU","LastLogin"
                var parts = new List<string>();
                var m = Regex.Matches(csvLines[i], "\"([^\"]*)\"");
                foreach (Match match in m) parts.Add(match.Groups[1].Value);
                if (parts.Count < 6) continue;

                var ud = new Dictionary<string, object>();
                ud["username"] = parts[0];
                ud["displayName"] = parts[1];
                ud["email"] = parts[2];
                ud["enabled"] = parts[3].ToLower() == "true";
                ud["ou"] = parts[4];
                ud["lastLogin"] = parts[5];
                users.Add(ud);
            }
        }
        catch { }
        result["users"] = users;
        result["ouTree"] = new List<object>();
        return result;
    }

    private static List<Dictionary<string, object>> CollectLocalUsers()
    {
        var users = new List<Dictionary<string, object>>();
        try
        {
            var psi = new ProcessStartInfo("powershell",
                "-NoProfile -Command \"Get-LocalUser | Select-Object Name,FullName,Enabled,LastLogon,Description | ConvertTo-Csv -NoTypeInformation\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                StandardOutputEncoding = Encoding.UTF8
            };
            var proc = Process.Start(psi);
            string csvOut = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(10000);

            var csvLines = csvOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            // CSV: "Name","FullName","Enabled","LastLogon","Description"
            for (int i = 1; i < csvLines.Length; i++)
            {
                var parts = new List<string>();
                var m = Regex.Matches(csvLines[i], "\"([^\"]*)\"");
                foreach (Match match in m) parts.Add(match.Groups[1].Value);
                if (parts.Count < 5) continue;

                DateTime dt;
                string lastLogin = DateTime.TryParse(parts[3], out dt)
                    ? dt.ToString("dd.MM.yyyy HH:mm")
                    : "Hiç";

                var ud = new Dictionary<string, object>();
                ud["username"]    = parts[0];
                ud["displayName"] = string.IsNullOrEmpty(parts[1]) ? parts[0] : parts[1];
                ud["enabled"]     = parts[2].ToLower() == "true";
                ud["lastLogin"]   = lastLogin;
                ud["description"] = parts[4];
                users.Add(ud);
            }
        }
        catch { }
        return users;
    }

    /* --- MSSQL databases --- */
    private static Dictionary<string, object> CollectMssql()
    {
        var result = new Dictionary<string, object>();
        var databases = new List<Dictionary<string, object>>();
        try
        {
            var psi = new ProcessStartInfo("sqlcmd", "-Q \"SET NOCOUNT ON; SELECT name, (SELECT SUM(size*8/1024) FROM sys.master_files f WHERE f.database_id=d.database_id AND f.type=0) as sizeMB, state_desc, (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D') as lastBackup FROM sys.databases d WHERE name NOT IN ('master','tempdb','model','msdb')\" -h -1 -s \"|\" -W")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                StandardOutputEncoding = Encoding.UTF8
            };
            var proc = Process.Start(psi);
            string output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(15000);

            foreach (string line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split('|');
                if (parts.Length < 4) continue;
                string name = parts[0].Trim();
                if (string.IsNullOrEmpty(name) || name.StartsWith("-")) continue;

                var dd = new Dictionary<string, object>();
                dd["name"] = name;
                int sizeMB = 0;
                int.TryParse(parts[1].Trim(), out sizeMB);
                dd["sizeMB"] = sizeMB;
                dd["status"] = parts[2].Trim();
                dd["lastBackup"] = parts[3].Trim() == "NULL" ? "Yok" : parts[3].Trim();
                dd["tables"] = 0;
                databases.Add(dd);
            }
        }
        catch { }
        result["databases"] = databases;
        return result;
    }

    private static string GetPrimaryIp()
    {
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var props = ni.GetIPProperties();
                if (props.GatewayAddresses.Count == 0) continue;
                foreach (var addr in props.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        return addr.Address.ToString();
                }
            }
        }
        catch { }
        return "127.0.0.1";
    }
}

/* ================================================================
   WINDOWS SERVICES LIST
================================================================ */
static class SvcList
{
    public static List<Dictionary<string, object>> Get()
    {
        var result = new List<Dictionary<string, object>>();
        try
        {
            foreach (var sc in ServiceController.GetServices())
            {
                var d = new Dictionary<string, object>();
                d["name"] = sc.ServiceName;
                d["displayName"] = sc.DisplayName;
                d["status"] = sc.Status.ToString();
                d["startType"] = "Unknown";
                try
                {
                    using (var mos = new ManagementObjectSearcher(
                        string.Format("SELECT StartMode FROM Win32_Service WHERE Name='{0}'", sc.ServiceName.Replace("'", "''"))))
                    {
                        foreach (ManagementObject mo in mos.Get())
                            d["startType"] = (mo["StartMode"] ?? "Unknown").ToString();
                    }
                }
                catch { }
                result.Add(d);
            }
        }
        catch { }
        return result;
    }
}

/* ================================================================
   HTTP API SERVER
================================================================ */
class ApiServer
{
    private HttpListener _listener;
    private Thread _thread;
    private volatile bool _running;
    private AgentConfig _config;
    private DateTime _lastHubQuery = DateTime.MinValue;
    public DateTime LastHubQuery { get { return _lastHubQuery; } }

    public ApiServer(AgentConfig config)
    {
        _config = config;
    }

    public void Start()
    {
        _running = true;
        _listener = new HttpListener();
        try
        {
            _listener.Prefixes.Add(string.Format("http://+:{0}/", _config.Port));
            _listener.Start();
        }
        catch
        {
            _listener.Close();
            _listener = new HttpListener();
            _listener.Prefixes.Add(string.Format("http://localhost:{0}/", _config.Port));
            _listener.Start();
        }
        _thread = new Thread(Listen) { IsBackground = true, Name = "ApiServer" };
        _thread.Start();
    }

    public void Stop()
    {
        _running = false;
        try { _listener.Stop(); } catch { }
    }

    private void Listen()
    {
        while (_running)
        {
            try
            {
                var ctx = _listener.GetContext();
                ThreadPool.QueueUserWorkItem((_) => HandleRequest(ctx));
            }
            catch { if (!_running) break; }
        }
    }

    private void HandleRequest(HttpListenerContext ctx)
    {
        try
        {
            string path = ctx.Request.Url.AbsolutePath.TrimEnd('/');
            string method = ctx.Request.HttpMethod;

            // CORS
            ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
            ctx.Response.Headers.Add("Access-Control-Allow-Headers", "X-Api-Key, Content-Type");
            if (method == "OPTIONS") { Respond(ctx, 200, "{}"); return; }

            // Health - no auth
            if (path == "/health" || path == "")
            {
                var d = new Dictionary<string, object>();
                d["status"] = "ok";
                d["hostname"] = Environment.MachineName;
                d["version"] = "2.0.0";
                d["port"] = _config.Port;
                Respond(ctx, 200, Json.Serialize(d));
                return;
            }

            // Auth check for /api/* — /api/ack muaf (localhost-only, PusulaNotify kullanir)
            if (path.StartsWith("/api") && path != "/api/ack")
            {
                string key = ctx.Request.Headers["X-Api-Key"];
                if (key != _config.ApiKey)
                {
                    Respond(ctx, 401, "{\"error\":\"Unauthorized\"}");
                    return;
                }
                _lastHubQuery = DateTime.Now;
            }

            // Routes
            if (path == "/api/report" && method == "GET")
            {
                var report = Metrics.GetLast();
                if (report == null) report = Metrics.Collect();

                // Bekleyen ACK'leri rapora ekle ve listeyi temizle
                var acks = PopPendingAcks();
                if (acks.Count > 0)
                {
                    var ackList = new List<object>();
                    foreach (var ack in acks)
                        ackList.Add(ack);
                    report["pendingAcks"] = ackList;
                }

                Respond(ctx, 200, Json.Serialize(report));
            }
            else if (path == "/api/services" && method == "GET")
            {
                Respond(ctx, 200, Json.Serialize(SvcList.Get()));
            }
            else if (path == "/api/exec" && method == "POST")
            {
                HandleExec(ctx);
            }
            else if (path == "/api/notify" && method == "POST")
            {
                HandleNotify(ctx);
            }
            else if (path == "/api/ack" && method == "POST")
            {
                HandleAck(ctx);
            }
            else
            {
                Respond(ctx, 404, "{\"error\":\"Not found\"}");
            }
        }
        catch (Exception ex)
        {
            try { Respond(ctx, 500, "{\"error\":\"" + Json.Serialize(ex.Message).Trim('"') + "\"}"); }
            catch { }
        }
    }

    private void HandleExec(HttpListenerContext ctx)
    {
        string body;
        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            body = reader.ReadToEnd();

        var mCmd = Regex.Match(body, "\"command\"\\s*:\\s*\"([^\"]*)\"");
        var mTimeout = Regex.Match(body, "\"timeout\"\\s*:\\s*(\\d+)");
        if (!mCmd.Success)
        {
            Respond(ctx, 400, "{\"error\":\"command required\"}");
            return;
        }

        string command = mCmd.Groups[1].Value.Replace("\\\"", "\"").Replace("\\\\", "\\");
        int timeout = mTimeout.Success ? int.Parse(mTimeout.Groups[1].Value) * 1000 : 30000;

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = string.Format("-NonInteractive -Command \"{0}\"", command.Replace("\"", "\\\""))
            };
            psi.WorkingDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;

            var proc = Process.Start(psi);
            string stdout = proc.StandardOutput.ReadToEnd();
            string stderr = proc.StandardError.ReadToEnd();
            bool exited = proc.WaitForExit(timeout);

            if (!exited)
            {
                try { proc.Kill(); } catch { }
            }

            var result = new Dictionary<string, object>();
            result["exitCode"] = exited ? proc.ExitCode : -1;
            result["stdout"] = stdout;
            result["stderr"] = stderr;
            result["timedOut"] = !exited;
            Respond(ctx, 200, Json.Serialize(result));
        }
        catch (Exception ex)
        {
            var err = new Dictionary<string, object>();
            err["exitCode"] = -1;
            err["stdout"] = "";
            err["stderr"] = ex.Message;
            err["timedOut"] = false;
            Respond(ctx, 200, Json.Serialize(err));
        }
    }

    // PusulaNotify.exe localhost'tan /api/ack POST eder; buraya gelir.
    // Hub bir sonraki /api/report cagrisinda bu listeyi alir ve temizler.
    private static readonly List<Dictionary<string,string>> _pendingAcks =
        new List<Dictionary<string,string>>();
    private static readonly object _ackLock = new object();

    internal static void AddPendingAck(string msgId, string username)
    {
        var ack = new Dictionary<string,string>();
        ack["msgId"]    = msgId;
        ack["username"] = username;
        lock (_ackLock) { _pendingAcks.Add(ack); }
    }

    internal static List<Dictionary<string,string>> PopPendingAcks()
    {
        lock (_ackLock)
        {
            var copy = new List<Dictionary<string,string>>(_pendingAcks);
            _pendingAcks.Clear();
            return copy;
        }
    }

    private void HandleAck(HttpListenerContext ctx)
    {
        // Sadece localhost'tan kabul et — API key gerekmez
        string remoteIp = ctx.Request.RemoteEndPoint != null
            ? ctx.Request.RemoteEndPoint.Address.ToString()
            : "";
        if (remoteIp != "127.0.0.1" && remoteIp != "::1")
        {
            Respond(ctx, 403, "{\"error\":\"forbidden\"}");
            return;
        }

        string body;
        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            body = reader.ReadToEnd();

        string msgId    = ExtractJson(body, "msgId");
        string username = ExtractJson(body, "username");

        if (!string.IsNullOrEmpty(msgId) && !string.IsNullOrEmpty(username))
            AddPendingAck(msgId, username);

        Respond(ctx, 200, "{\"ok\":true}");
    }

    private static string ExtractJson(string json, string key)
    {
        var m = Regex.Match(json,
            "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        if (!m.Success) return null;
        return m.Groups[1].Value;
    }

    private void HandleNotify(HttpListenerContext ctx)
    {
        string body;
        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            body = reader.ReadToEnd();

        string notifyExe = Path.Combine(
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "",
            "PusulaNotify.exe");

        if (!File.Exists(notifyExe))
        {
            Respond(ctx, 500, "{\"error\":\"PusulaNotify.exe bulunamadi\"}");
            return;
        }

        // agentPort'u payload'a ekle; PusulaNotify localhost'a ACK gonderecek
        string payload = body.TrimEnd();
        if (payload.EndsWith("}"))
            payload = payload.Substring(0, payload.Length - 1) +
                      ",\"agentPort\":" + _config.Port + "}";

        string base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(payload));
        int injected = 0;
        try { injected = SessionInjector.Inject(notifyExe, base64); }
        catch (Exception ex)
        {
            Respond(ctx, 500, "{\"error\":\"" + ex.Message.Replace("\"","'") + "\"}");
            return;
        }

        Respond(ctx, 200, "{\"ok\":true,\"sessions\":" + injected + "}");
    }

    private static void Respond(HttpListenerContext ctx, int status, string body)
    {
        try
        {
            byte[] buf = Encoding.UTF8.GetBytes(body);
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.ContentLength64 = buf.Length;
            ctx.Response.OutputStream.Write(buf, 0, buf.Length);
            ctx.Response.Close();
        }
        catch { }
    }
}

/* ================================================================
   SETUP FORM
================================================================ */
class SetupForm : Form
{
    private TextBox _txtPort;
    private TextBox _txtKey;
    private CheckBox _chkAuto;
    public int ResultPort { get; private set; }
    public string ResultKey { get; private set; }
    public bool ResultAutoStart { get; private set; }
    public bool Confirmed { get; private set; }

    public SetupForm(int port, string apiKey, bool autoStart)
    {
        Text = "PusulaAgent - Kurulum";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(400, 320);
        BackColor = Color.White;
        Font = new Font("Segoe UI", 9);
        Icon = TrayApp.CreateAppIcon(Color.FromArgb(34, 139, 34));

        // Title
        var lblTitle = new Label
        {
            Text = "PusulaAgent",
            Font = new Font("Segoe UI", 18, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(24, 16),
            AutoSize = true
        };
        Controls.Add(lblTitle);

        var lblSub = new Label
        {
            Text = "Sunucu izleme servisi kurulumu",
            ForeColor = Color.Gray,
            Location = new Point(26, 50),
            AutoSize = true
        };
        Controls.Add(lblSub);

        // Separator
        var sep1 = new Label
        {
            BorderStyle = BorderStyle.Fixed3D,
            Location = new Point(24, 78),
            Size = new Size(352, 2)
        };
        Controls.Add(sep1);

        // Port
        var lblPort = new Label { Text = "Dinleme Portu:", Location = new Point(24, 96), AutoSize = true };
        Controls.Add(lblPort);
        _txtPort = new TextBox
        {
            Text = port.ToString(),
            Location = new Point(24, 118),
            Size = new Size(120, 28)
        };
        Controls.Add(_txtPort);

        // API Key
        var lblKey = new Label { Text = "API Anahtari:", Location = new Point(24, 154), AutoSize = true };
        Controls.Add(lblKey);
        _txtKey = new TextBox
        {
            Text = string.IsNullOrEmpty(apiKey) ? AgentConfig.GenerateApiKey() : apiKey,
            Location = new Point(24, 176),
            Size = new Size(250, 28),
            Font = new Font("Consolas", 10)
        };
        Controls.Add(_txtKey);

        var btnGen = new Button
        {
            Text = "Yenile",
            Location = new Point(282, 175),
            Size = new Size(90, 28),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(240, 240, 240)
        };
        btnGen.Click += (s, e) => { _txtKey.Text = AgentConfig.GenerateApiKey(); };
        Controls.Add(btnGen);

        // Auto-start
        _chkAuto = new CheckBox
        {
            Text = "Windows ile birlikte otomatik baslat",
            Location = new Point(24, 218),
            AutoSize = true,
            Checked = autoStart
        };
        Controls.Add(_chkAuto);

        // Info
        var lblInfo = new Label
        {
            Text = "Not: API anahtarini PusulaHub'a eklemeniz gerekecek.",
            ForeColor = Color.FromArgb(150, 150, 150),
            Font = new Font("Segoe UI", 8),
            Location = new Point(24, 248),
            AutoSize = true
        };
        Controls.Add(lblInfo);

        // Install button
        var btnInstall = new Button
        {
            Text = "Kur ve Baslat",
            Location = new Point(24, 274),
            Size = new Size(352, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(34, 139, 34),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        btnInstall.FlatAppearance.BorderSize = 0;
        btnInstall.Click += BtnInstall_Click;
        Controls.Add(btnInstall);
    }

    private void BtnInstall_Click(object sender, EventArgs e)
    {
        int port;
        if (!int.TryParse(_txtPort.Text.Trim(), out port) || port < 1 || port > 65535)
        {
            MessageBox.Show("Gecerli bir port numarasi girin (1-65535).", "Hata",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (string.IsNullOrEmpty(_txtKey.Text.Trim()))
        {
            MessageBox.Show("API anahtari bos olamaz.", "Hata",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        ResultPort = port;
        ResultKey = _txtKey.Text.Trim();
        ResultAutoStart = _chkAuto.Checked;
        Confirmed = true;
        Close();
    }
}

/* ================================================================
   TRAY APPLICATION
================================================================ */
class TrayApp : ApplicationContext
{
    private NotifyIcon _tray;
    private AgentConfig _config;
    private ApiServer _server;
    private System.Windows.Forms.Timer _metricTimer;
    private System.Windows.Forms.Timer _uiTimer;
    private string _appDir;

    public TrayApp(AgentConfig config, string appDir, bool isInstall)
    {
        _config = config;
        _appDir = appDir;

        // Init metrics
        Metrics.Init();
        Metrics.Collect();

        // Start API server
        _server = new ApiServer(config);
        _server.Start();

        // Metric collection timer (every 15 sec)
        _metricTimer = new System.Windows.Forms.Timer();
        _metricTimer.Interval = 15000;
        _metricTimer.Tick += (s, e) =>
        {
            ThreadPool.QueueUserWorkItem((_2) => { try { Metrics.Collect(); } catch { } });
        };
        _metricTimer.Start();

        // Setup tray
        _tray = new NotifyIcon();
        _tray.Icon = CreateAppIcon(Color.FromArgb(34, 139, 34));
        _tray.Text = string.Format("PusulaAgent - Port {0}", config.Port);
        _tray.Visible = true;

        // Context menu
        var menu = new ContextMenuStrip();
        var lblTitle = new ToolStripMenuItem(string.Format("PusulaAgent v2.0.0 — Port {0}", config.Port));
        lblTitle.Enabled = false;
        menu.Items.Add(lblTitle);
        menu.Items.Add(new ToolStripSeparator());

        var mnuCopyKey = new ToolStripMenuItem("API Anahtarini Kopyala");
        mnuCopyKey.Click += (s, e) =>
        {
            try { Clipboard.SetText(config.ApiKey); } catch { }
        };
        menu.Items.Add(mnuCopyKey);

        var mnuCopyIp = new ToolStripMenuItem("IP Adresini Kopyala");
        mnuCopyIp.Click += (s, e) =>
        {
            var report = Metrics.GetLast();
            string ip = "127.0.0.1";
            if (report != null && report.ContainsKey("ip")) ip = report["ip"].ToString();
            try { Clipboard.SetText(ip); } catch { }
        };
        menu.Items.Add(mnuCopyIp);

        menu.Items.Add(new ToolStripSeparator());

        var mnuSettings = new ToolStripMenuItem("Ayarlar...");
        mnuSettings.Click += (s, e) => ShowSettings();
        menu.Items.Add(mnuSettings);

        menu.Items.Add(new ToolStripSeparator());

        var mnuExit = new ToolStripMenuItem("Cikis");
        mnuExit.Click += (s, e) => DoExit();
        menu.Items.Add(mnuExit);

        _tray.ContextMenuStrip = menu;

        // UI update timer (update icon tooltip)
        _uiTimer = new System.Windows.Forms.Timer();
        _uiTimer.Interval = 5000;
        _uiTimer.Tick += (s, e) => UpdateTooltip();
        _uiTimer.Start();

        // Show balloon on start
        string msg = string.Format("Port {0} uzerinde dinleniyor.\nAPI Key: {1}",
            config.Port, config.ApiKey);
        _tray.ShowBalloonTip(5000, "PusulaAgent Calisiyor", msg, ToolTipIcon.Info);

        // If install mode, also do system setup
        if (isInstall) InstallSystem();
    }

    private void InstallSystem()
    {
        string exePath = Assembly.GetExecutingAssembly().Location;
        int port = _config.Port;

        // Firewall rule
        try
        {
            RunSilent("netsh", "advfirewall firewall delete rule name=PusulaAgent");
            RunSilent("netsh", string.Format(
                "advfirewall firewall add rule name=PusulaAgent dir=in action=allow protocol=TCP localport={0} profile=any",
                port));
        }
        catch { }

        // URL ACL
        try
        {
            RunSilent("netsh", string.Format("http delete urlacl url=http://+:{0}/", port));
            RunSilent("netsh", string.Format("http add urlacl url=http://+:{0}/ user=Everyone", port));
        }
        catch { }

        // Auto-start registry
        if (_config.AutoStart)
        {
            try
            {
                var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
                if (key != null)
                {
                    key.SetValue("PusulaAgent", "\"" + exePath + "\"");
                    key.Close();
                }
            }
            catch
            {
                // Fallback to HKCU if HKLM fails
                try
                {
                    var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
                    if (key != null)
                    {
                        key.SetValue("PusulaAgent", "\"" + exePath + "\"");
                        key.Close();
                    }
                }
                catch { }
            }
        }
    }

    public static void Uninstall()
    {
        try { RunSilent("netsh", "advfirewall firewall delete rule name=PusulaAgent"); } catch { }
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
            if (key != null) { key.DeleteValue("PusulaAgent", false); key.Close(); }
        }
        catch { }
        try
        {
            var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
            if (key != null) { key.DeleteValue("PusulaAgent", false); key.Close(); }
        }
        catch { }
        MessageBox.Show("PusulaAgent kaldirildi.", "PusulaAgent", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void ShowSettings()
    {
        var form = new SetupForm(_config.Port, _config.ApiKey, _config.AutoStart);
        form.ShowDialog();
        if (form.Confirmed)
        {
            bool portChanged = form.ResultPort != _config.Port;
            _config.Port = form.ResultPort;
            _config.ApiKey = form.ResultKey;
            _config.AutoStart = form.ResultAutoStart;
            _config.Save(_appDir);
            if (portChanged)
            {
                MessageBox.Show(
                    "Port degisikligi icin uygulamayi yeniden baslatin.",
                    "PusulaAgent", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }

    private void UpdateTooltip()
    {
        string lastQ = _server.LastHubQuery == DateTime.MinValue
            ? "Henuz sorgulanmadi"
            : string.Format("Son sorgu: {0}", _server.LastHubQuery.ToString("HH:mm:ss"));
        _tray.Text = string.Format("PusulaAgent - Port {0}\n{1}", _config.Port, lastQ);

        // Icon color: green if recently queried (<2 min), yellow otherwise
        bool recent = (DateTime.Now - _server.LastHubQuery).TotalMinutes < 2;
        _tray.Icon = CreateAppIcon(recent
            ? Color.FromArgb(34, 139, 34)
            : Color.FromArgb(200, 160, 0));
    }

    private void DoExit()
    {
        _metricTimer.Stop();
        _uiTimer.Stop();
        _server.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        Application.Exit();
    }

    public static Icon CreateAppIcon(Color bg)
    {
        var bmp = new Bitmap(16, 16);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(bg))
                g.FillEllipse(brush, 1, 1, 14, 14);
            using (var font = new Font("Arial", 8.5f, FontStyle.Bold))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                g.DrawString("P", font, Brushes.White, new RectangleF(0, 0, 16, 16), sf);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    private static void RunSilent(string exe, string args)
    {
        var psi = new ProcessStartInfo(exe, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        var p = Process.Start(psi);
        p.WaitForExit(10000);
    }
}

/* ================================================================
   SESSION INJECTOR — WTS API ile kullanıcı oturumuna process inject
================================================================ */
static class SessionInjector
{
    const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSEnumerateSessions(IntPtr hServer, uint Reserved, uint Version,
        out IntPtr ppSessionInfo, out uint pCount);

    [DllImport("wtsapi32.dll")]
    static extern void WTSFreeMemory(IntPtr pMemory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSQueryUserToken(uint SessionId, out IntPtr phToken);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessAsUser(IntPtr hToken, string lpApp, string lpCmd,
        IntPtr lpProcAttr, IntPtr lpThreadAttr, bool bInherit, uint dwFlags,
        IntPtr lpEnv, string lpDir, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);

    [DllImport("userenv.dll", SetLastError = true)]
    static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

    [DllImport("userenv.dll", SetLastError = true)]
    static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct WTS_SESSION_INFO { public int SessionID; public IntPtr pWinStationName; public int State; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFOEX
    {
        public int cb;
        public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    public static int Inject(string exePath, string base64Data)
    {
        int count = 0;
        IntPtr pSessions;
        uint sessionCount;
        if (!WTSEnumerateSessions(IntPtr.Zero, 0, 1, out pSessions, out sessionCount)) return 0;
        try
        {
            int sz = Marshal.SizeOf(typeof(WTS_SESSION_INFO));
            for (int i = 0; i < (int)sessionCount; i++)
            {
                var info = (WTS_SESSION_INFO)Marshal.PtrToStructure(
                    new IntPtr(pSessions.ToInt64() + i * sz), typeof(WTS_SESSION_INFO));
                if (info.State != 0) continue; // WTSActive only

                IntPtr hToken;
                if (!WTSQueryUserToken((uint)info.SessionID, out hToken)) continue;
                try
                {
                    IntPtr envBlock;
                    CreateEnvironmentBlock(out envBlock, hToken, false);
                    var si = new STARTUPINFOEX();
                    si.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                    si.lpDesktop = "winsta0\\default";
                    PROCESS_INFORMATION pi;
                    string cmd = "\"" + exePath + "\" \"" + base64Data + "\"";
                    bool ok = CreateProcessAsUser(hToken, null, cmd,
                        IntPtr.Zero, IntPtr.Zero, false,
                        CREATE_UNICODE_ENVIRONMENT, envBlock, null, ref si, out pi);
                    if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
                    if (ok)
                    {
                        if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
                        if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
                        count++;
                    }
                }
                finally { CloseHandle(hToken); }
            }
        }
        finally { WTSFreeMemory(pSessions); }
        return count;
    }
}

/* ================================================================
   WINDOWS SERVICE — --service modunda calisiyor (SYSTEM yetkisi)
================================================================ */
class AgentService : ServiceBase
{
    ApiServer _server;
    System.Threading.Timer _metricTimer;
    AgentConfig _config;

    public AgentService(AgentConfig config)
    {
        ServiceName = "PusulaAgent";
        CanStop = true;
        _config = config;
    }

    protected override void OnStart(string[] args)
    {
        Metrics.Init();
        Metrics.Collect();
        _server = new ApiServer(_config);
        _server.Start();
        _metricTimer = new System.Threading.Timer(
            _ => { try { Metrics.Collect(); } catch { } },
            null, 15000, 15000);
    }

    protected override void OnStop()
    {
        try { if (_metricTimer != null) _metricTimer.Dispose(); } catch { }
        try { if (_server != null) _server.Stop(); } catch { }
    }
}

/* ================================================================
   ENTRY POINT
================================================================ */
static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        string appDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        // Servis modunda çalıştır (SYSTEM yetkisi ile, tray yok)
        if (args.Any(a => a == "--service"))
        {
            var svcConfig = AgentConfig.Load(appDir) ?? new AgentConfig { Port = 8585, ApiKey = AgentConfig.GenerateApiKey() };
            Metrics.Init();
            ServiceBase.Run(new AgentService(svcConfig));
            return;
        }

        bool isInstall = args.Any(a => a == "--install");
        bool isUninstall = args.Any(a => a == "--uninstall");

        // Uninstall
        if (isUninstall)
        {
            TrayApp.Uninstall();
            return;
        }

        // Single instance check
        bool created;
        var mutex = new Mutex(true, "Global\\PusulaAgent_Mutex", out created);
        if (!created)
        {
            MessageBox.Show("PusulaAgent zaten calisiyor.", "PusulaAgent",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // Load or create config
        var config = AgentConfig.Load(appDir);

        if (config == null)
        {
            // First run — show setup
            var form = new SetupForm(8585, "", true);
            form.ShowDialog();
            if (!form.Confirmed)
            {
                GC.KeepAlive(mutex);
                return;
            }
            config = new AgentConfig
            {
                Port = form.ResultPort,
                ApiKey = form.ResultKey,
                AutoStart = form.ResultAutoStart
            };
            config.Save(appDir);
            isInstall = true; // trigger system setup
        }

        // Run tray app
        Application.Run(new TrayApp(config, appDir, isInstall));
        GC.KeepAlive(mutex);
    }
}

} // namespace PusulaAgent
