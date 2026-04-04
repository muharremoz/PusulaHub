/* ================================================================
   PusulaNotify.cs — Bildirim Popup
   PusulaAgent servisi tarafından kullanıcı oturumuna inject edilir.

   Derleme: csc /nologo /target:winexe /optimize+ /out:PusulaNotify.exe
            /r:System.Windows.Forms.dll,System.Drawing.dll,System.Net.dll
            PusulaNotify.cs

   Kullanım: PusulaNotify.exe <base64Data>
   base64Data (UTF-8 JSON): { msgId, hubUrl, title, body, type, sentAt, from }
================================================================ */

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[assembly: AssemblyTitle("PusulaNotify")]
[assembly: AssemblyVersion("1.0.0.0")]

static class PusulaNotifyProgram
{
    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length < 1) return;
        string json;
        try { json = Encoding.UTF8.GetString(Convert.FromBase64String(args[0])); }
        catch { return; }

        string msgId  = Extract(json, "msgId")  ?? "";
        string hubUrl = Extract(json, "hubUrl") ?? "";
        string title  = Extract(json, "title")  ?? "(Başlıksız)";
        string body   = Extract(json, "body")   ?? "";
        string type   = Extract(json, "type")   ?? "info";
        string sentAt = Extract(json, "sentAt") ?? "";
        string from   = Extract(json, "from")   ?? "Pusula Yazılım";

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NotifyForm(msgId, hubUrl, title, body, type, sentAt, from));
    }

    static string Extract(string json, string key)
    {
        var m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        if (!m.Success) return null;
        return m.Groups[1].Value
            .Replace("\\n", "\n").Replace("\\r", "\r").Replace("\\t", "\t")
            .Replace("\\\"", "\"").Replace("\\\\", "\\");
    }
}

class NotifyForm : Form
{
    readonly string _msgId, _hubUrl;

    // type index: 0=info, 1=warning, 2=urgent
    static int TypeIdx(string t)
    {
        if (t == "warning") return 1;
        if (t == "urgent")  return 2;
        return 0;
    }

    static readonly Color[] ColHeader = { Color.FromArgb(239,246,255), Color.FromArgb(255,251,235), Color.FromArgb(254,242,242) };
    static readonly Color[] ColIcon   = { Color.FromArgb(219,234,254), Color.FromArgb(254,243,199), Color.FromArgb(254,226,226) };
    static readonly Color[] ColBadge  = { Color.FromArgb(191,219,254), Color.FromArgb(253,230,138), Color.FromArgb(254,202,202) };
    static readonly Color[] ColFg     = { Color.FromArgb(29,78,216),   Color.FromArgb(146,64,14),   Color.FromArgb(153,27,27)   };
    static readonly Color[] ColBtn    = { Color.FromArgb(37,99,235),   Color.FromArgb(217,119,6),   Color.FromArgb(220,38,38)   };
    static readonly string[] BadgeTxt = { "BİLGİ", "UYARI", "ACİL" };
    static readonly string[] Glyph    = { "i", "!", "!" };

    public NotifyForm(string msgId, string hubUrl, string title, string body, string type, string sentAt, string from)
    {
        _msgId  = msgId;
        _hubUrl = hubUrl;
        int ti  = TypeIdx(type);

        FormBorderStyle = FormBorderStyle.None;
        BackColor       = Color.White;
        Width           = 480;
        TopMost         = true;
        ShowInTaskbar   = true;
        StartPosition   = FormStartPosition.Manual;
        var wa = Screen.PrimaryScreen.WorkingArea;
        Left = wa.Right - Width - 20;

        int y = 0;

        // ── Header ──────────────────────────────────────────────
        var pHeader = MakePanel(0, y, 480, 72, ColHeader[ti]);
        // icon circle (drawn via Paint)
        var pIcon = new Panel { Left = 16, Top = 18, Width = 36, Height = 36, BackColor = ColIcon[ti] };
        pIcon.Paint += (s, e) =>
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var br = new SolidBrush(ColFg[ti]))
            using (var font = new Font("Segoe UI", 13f, FontStyle.Bold))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                e.Graphics.DrawString(Glyph[ti], font, br, new RectangleF(0, 0, 36, 36), sf);
        };
        pHeader.Controls.Add(pIcon);

        // badge
        var pBadge = new Panel { Left = 64, Top = 14, Width = 52, Height = 18, BackColor = ColBadge[ti] };
        pBadge.Paint += (s, e) =>
        {
            using (var br = new SolidBrush(ColFg[ti]))
            using (var font = new Font("Segoe UI", 7f, FontStyle.Bold))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                e.Graphics.DrawString(BadgeTxt[ti], font, br, new RectangleF(0, 0, 52, 18), sf);
        };
        pHeader.Controls.Add(pBadge);

        // title
        pHeader.Controls.Add(MakeLabel(title, new Font("Segoe UI", 12f, FontStyle.Bold),
            Color.FromArgb(17, 17, 17), ColHeader[ti], 64, 36, 400, 24));

        y += 72;

        // ── User info ────────────────────────────────────────────
        var pUser = MakePanel(0, y, 480, 48, Color.FromArgb(250, 250, 250));
        pUser.Paint += (s, e) =>
        {
            using (var p = new Pen(Color.FromArgb(240, 240, 240)))
            {
                e.Graphics.DrawLine(p, 0, 0, 480, 0);
                e.Graphics.DrawLine(p, 0, 47, 480, 47);
            }
        };
        string uname = Environment.UserName;
        // avatar circle
        var pAv = new Panel { Left = 16, Top = 10, Width = 28, Height = 28, BackColor = Color.FromArgb(229, 231, 235) };
        pAv.Paint += (s, e) =>
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var br = new SolidBrush(Color.FromArgb(55, 65, 81)))
            using (var font = new Font("Segoe UI", 10f, FontStyle.Bold))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                e.Graphics.DrawString(uname.Length > 0 ? uname[0].ToString().ToUpper() : "?",
                    font, br, new RectangleF(0, 0, 28, 28), sf);
        };
        pUser.Controls.Add(pAv);
        pUser.Controls.Add(MakeLabel("Sayın " + uname, new Font("Segoe UI", 9.5f, FontStyle.Bold),
            Color.FromArgb(17, 17, 17), Color.Transparent, 54, 8, 280, 16));

        string timeStr;
        DateTime dt;
        if (!string.IsNullOrEmpty(sentAt) &&
            DateTime.TryParse(sentAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out dt))
            timeStr = dt.ToLocalTime().ToString("HH:mm");
        else
            timeStr = DateTime.Now.ToString("HH:mm");

        var lblTime = MakeLabel(timeStr, new Font("Segoe UI", 8.5f),
            Color.FromArgb(156, 163, 175), Color.Transparent, 350, 16, 110, 16);
        lblTime.TextAlign = ContentAlignment.MiddleRight;
        pUser.Controls.Add(lblTime);

        y += 48;

        // ── Body ─────────────────────────────────────────────────
        var bodyFont = new Font("Segoe UI", 10f);
        var measured = TextRenderer.MeasureText(body, bodyFont, new Size(440, 0), TextFormatFlags.WordBreak);
        int bodyH = Math.Max(64, measured.Height + 32);
        var pBody = MakePanel(0, y, 480, bodyH, Color.White);
        var lblBody = new Label
        {
            Text = body,
            Font = bodyFont,
            ForeColor = Color.FromArgb(55, 65, 81),
            BackColor = Color.Transparent,
            Left = 20, Top = 16,
            Width = 440, Height = bodyH - 32,
            AutoSize = false,
        };
        pBody.Controls.Add(lblBody);
        y += bodyH;

        // ── Footer ───────────────────────────────────────────────
        var pFoot = MakePanel(0, y, 480, 52, Color.FromArgb(250, 250, 250));
        pFoot.Paint += (s, e) =>
        {
            using (var p = new Pen(Color.FromArgb(240, 240, 240)))
                e.Graphics.DrawLine(p, 0, 0, 480, 0);
        };
        pFoot.Controls.Add(MakeLabel(from, new Font("Segoe UI", 8.5f, FontStyle.Bold),
            Color.FromArgb(107, 114, 128), Color.Transparent, 16, 16, 180, 20));

        var btn = new Button
        {
            Text = "Okudum, Anladım",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.White,
            BackColor = ColBtn[ti],
            FlatStyle = FlatStyle.Flat,
            Left = 284, Top = 10, Width = 180, Height = 32,
            Cursor = Cursors.Hand,
        };
        btn.FlatAppearance.BorderSize = 0;
        btn.Click += (s, e) => AckAndClose();
        pFoot.Controls.Add(btn);

        y += 52;
        Height = y;
        Top = wa.Bottom - Height - 20;

        // Rounded corners
        var gp = new GraphicsPath();
        int r = 12;
        gp.AddArc(0, 0, r*2, r*2, 180, 90);
        gp.AddArc(Width-r*2, 0, r*2, r*2, 270, 90);
        gp.AddArc(Width-r*2, Height-r*2, r*2, r*2, 0, 90);
        gp.AddArc(0, Height-r*2, r*2, r*2, 90, 90);
        gp.CloseAllFigures();
        Region = new Region(gp);

        // Auto-close 5 min
        var t = new System.Windows.Forms.Timer { Interval = 300000 };
        t.Tick += (s, e) => { t.Stop(); Close(); };
        t.Start();
    }

    void AckAndClose()
    {
        if (!string.IsNullOrEmpty(_msgId) && !string.IsNullOrEmpty(_hubUrl))
        {
            try
            {
                string json = "{\"msgId\":\"" + _msgId.Replace("\"","\\\"") +
                              "\",\"username\":\"" + Environment.UserName.Replace("\"","\\\"") + "\"}";
                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    wc.UploadString(_hubUrl.TrimEnd('/') + "/api/agent/message-ack", "POST", json);
                }
            }
            catch { }
        }
        Close();
    }

    Panel MakePanel(int x, int y, int w, int h, Color bg)
    {
        var p = new Panel { Left = x, Top = y, Width = w, Height = h, BackColor = bg };
        Controls.Add(p);
        return p;
    }

    Label MakeLabel(string text, Font font, Color fg, Color bg, int x, int y, int w, int h)
    {
        return new Label
        {
            Text = text, Font = font, ForeColor = fg, BackColor = bg,
            Left = x, Top = y, Width = w, Height = h, AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
        };
    }
}
