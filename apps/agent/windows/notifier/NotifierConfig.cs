using System;
using System.IO;
using System.Text.Json;

namespace PusulaNotifier
{
    public class NotifierConfig
    {
        public string HubUrl   { get; set; } = "http://localhost:3000";
        public string AgentId  { get; set; } = "";
        public string Token    { get; set; } = "";
        public int    Interval { get; set; } = 30;   // saniye

        // Agent'ın config.json dosyası ile aynı dizinde aranır
        private static string AgentConfigPath =>
            Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "..", "config.json"          // notifier\ → windows\
            );

        private static string NotifierConfigPath =>
            Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "notifier-config.json"
            );

        public static NotifierConfig Load()
        {
            var cfg = new NotifierConfig();

            // Önce agent config.json'dan hub_url, agent_id, token oku
            var agentPath = Path.GetFullPath(AgentConfigPath);
            if (File.Exists(agentPath))
            {
                try
                {
                    var doc = JsonDocument.Parse(File.ReadAllText(agentPath));
                    var root = doc.RootElement;
                    if (root.TryGetProperty("hub_url",  out var hu))  cfg.HubUrl  = hu.GetString() ?? cfg.HubUrl;
                    if (root.TryGetProperty("agent_id", out var ai))  cfg.AgentId = ai.GetString() ?? "";
                    if (root.TryGetProperty("token",    out var t))   cfg.Token   = t.GetString()  ?? "";
                    if (root.TryGetProperty("interval", out var inv)) cfg.Interval = inv.GetInt32();
                }
                catch { }
            }

            // notifier-config.json'dan üzerine yaz (varsa)
            if (File.Exists(NotifierConfigPath))
            {
                try
                {
                    var doc = JsonDocument.Parse(File.ReadAllText(NotifierConfigPath));
                    var root = doc.RootElement;
                    if (root.TryGetProperty("hub_url",  out var hu))  cfg.HubUrl  = hu.GetString() ?? cfg.HubUrl;
                    if (root.TryGetProperty("agent_id", out var ai))  cfg.AgentId = ai.GetString() ?? cfg.AgentId;
                    if (root.TryGetProperty("token",    out var t))   cfg.Token   = t.GetString()  ?? cfg.Token;
                    if (root.TryGetProperty("interval", out var inv)) cfg.Interval = inv.GetInt32();
                }
                catch { }
            }

            return cfg;
        }

        public void Save()
        {
            var json = JsonSerializer.Serialize(new
            {
                hub_url  = HubUrl,
                agent_id = AgentId,
                token    = Token,
                interval = Interval,
            }, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(NotifierConfigPath, json);
        }
    }

    public class NotificationData
    {
        public string Id      { get; set; } = "";
        public string Title   { get; set; } = "";
        public string Body    { get; set; } = "";
        public string Type    { get; set; } = "info";   // info | warning | urgent
        public string From    { get; set; } = "PusulaHub";
        public string SentAt  { get; set; } = "";
    }
}
