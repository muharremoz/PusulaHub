using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading;

namespace PusulaNotifier
{
    public class PollingService
    {
        private NotifierConfig _config;
        private readonly Action<NotificationData> _onMessage;
        private Timer? _timer;
        private readonly HttpClient _http;

        public PollingService(NotifierConfig config, Action<NotificationData> onMessage)
        {
            _config    = config;
            _onMessage = onMessage;
            _http      = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        }

        public void Start()
        {
            var intervalMs = Math.Max(10, _config.Interval) * 1000;
            _timer = new Timer(Poll, null, 2000, intervalMs);
        }

        public void Stop()
        {
            _timer?.Dispose();
        }

        public void Reload(NotifierConfig config)
        {
            _config = config;
            Stop();
            Start();
        }

        private async void Poll(object? _)
        {
            if (string.IsNullOrEmpty(_config.AgentId) || string.IsNullOrEmpty(_config.Token))
                return;

            try
            {
                var url = $"{_config.HubUrl.TrimEnd('/')}/api/agent/messages" +
                          $"?agentId={Uri.EscapeDataString(_config.AgentId)}" +
                          $"&token={Uri.EscapeDataString(_config.Token)}";

                var resp = await _http.GetAsync(url);

                if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    // Token geçersiz — agent yeniden kayıt yaptığında config günceller
                    _config = NotifierConfig.Load();
                    return;
                }

                if (!resp.IsSuccessStatusCode) return;

                var json = await resp.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("messages", out var msgs)) return;

                foreach (var msg in msgs.EnumerateArray())
                {
                    var data = new NotificationData
                    {
                        Id     = msg.TryGetProperty("id",     out var id)  ? id.GetString()    ?? "" : "",
                        Title  = msg.TryGetProperty("title",  out var ti)  ? ti.GetString()    ?? "" : "",
                        Body   = msg.TryGetProperty("body",   out var bo)  ? bo.GetString()    ?? "" : "",
                        Type   = msg.TryGetProperty("type",   out var ty)  ? ty.GetString()    ?? "info" : "info",
                        From   = msg.TryGetProperty("from",   out var fr)  ? fr.GetString()    ?? "" : "",
                        SentAt = msg.TryGetProperty("sentAt", out var sa)  ? sa.GetString()    ?? "" : "",
                    };

                    if (!string.IsNullOrEmpty(data.Title))
                        _onMessage(data);
                }
            }
            catch { /* Ağ hatası — sessizce geç */ }
        }
    }
}
