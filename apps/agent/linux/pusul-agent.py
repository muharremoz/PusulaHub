#!/usr/bin/env python3
"""
PusulaAgent - Linux Agent for PusulaHub
Sunucu metriklerini toplar, PusulaHub'a gönderir ve yerel web arayüzü sunar.

Çalıştır  : python3 pusul-agent.py
Versiyon  : 1.0.0
Python    : 3.6+  (ekstra paket gerekmez)
"""

import json, os, sys, time, threading, socket, subprocess
import urllib.request, urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from collections import deque
import uuid, platform

VERSION     = "1.0.0"
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "config.json")

DEFAULT_CONFIG = {
    "hub_url":    "http://192.168.1.100:3000",
    "secret":     "pusulahub-secret",
    "interval":   30,
    "local_port": 8585,
    "agent_id":   None,
    "token":      None,
}

# ══════════════════════════════════════════════
#   PAYLAŞIMLI STATE
# ══════════════════════════════════════════════
state = {
    "config":        DEFAULT_CONFIG.copy(),
    "metrics":       None,
    "roles":         [],
    "hub_connected": False,
    "last_push":     "",
    "uptime_sec":    0,
    "activity_log":  deque(maxlen=20),
    "trigger_push":  threading.Event(),
}
state_lock = threading.Lock()

# ══════════════════════════════════════════════
#   YAPILANDIRMA
# ══════════════════════════════════════════════
def load_config():
    cfg = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
            cfg.update({k: v for k, v in saved.items() if k in cfg})
        except Exception:
            pass
    return cfg

def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)

# ══════════════════════════════════════════════
#   METRİK TOPLAMA
# ══════════════════════════════════════════════
def get_cpu_percent():
    """İki ölçüm arası farktan CPU % hesapla"""
    def read():
        with open("/proc/stat") as f:
            line = f.readline()
        vals = list(map(int, line.split()[1:]))
        idle = vals[3]
        total = sum(vals)
        return idle, total

    i1, t1 = read()
    time.sleep(0.3)
    i2, t2 = read()
    dt = t2 - t1
    di = i2 - i1
    return round((1 - di / dt) * 100, 1) if dt > 0 else 0.0

def get_ram():
    data = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":")
            data[k.strip()] = int(v.split()[0])  # kB
    total_mb = data.get("MemTotal", 0) // 1024
    free_mb  = (data.get("MemAvailable", data.get("MemFree", 0))) // 1024
    used_mb  = total_mb - free_mb
    return {"totalMB": total_mb, "usedMB": used_mb, "freeMB": free_mb}

def get_disks():
    disks = []
    try:
        out = subprocess.check_output(["df", "-B1", "--output=source,size,used,avail,pcent,target"],
                                       text=True, stderr=subprocess.DEVNULL)
        for line in out.strip().splitlines()[1:]:
            parts = line.split()
            if len(parts) < 6:
                continue
            mount = parts[5]
            # Sadece gerçek mount noktaları
            if not any(mount.startswith(p) for p in ["/", "/home", "/var", "/data", "/srv"]):
                continue
            if any(x in parts[0] for x in ["tmpfs", "udev", "devtmpfs"]):
                continue
            total_gb = round(int(parts[1]) / 1e9, 1)
            used_gb  = round(int(parts[2]) / 1e9, 1)
            free_gb  = round(int(parts[3]) / 1e9, 1)
            pct_str  = parts[4].replace("%", "")
            disks.append({
                "drive":   mount,
                "totalGB": total_gb,
                "usedGB":  used_gb,
                "freeGB":  free_gb,
                "percent": int(pct_str),
            })
    except Exception:
        pass
    return disks[:5]

def get_uptime_seconds():
    with open("/proc/uptime") as f:
        return int(float(f.read().split()[0]))

def get_network_adapters():
    adapters = []
    try:
        out = subprocess.check_output(["ip", "-4", "addr", "show"], text=True, stderr=subprocess.DEVNULL)
        current = None
        for line in out.splitlines():
            if line[0].isdigit():
                parts = line.split(":")
                current = parts[1].strip()
            elif "inet " in line and current and current != "lo":
                ip = line.strip().split()[1].split("/")[0]
                adapters.append({
                    "name":   current,
                    "ipv4":   ip,
                    "sentMB": 0,
                    "recvMB": 0,
                })
    except Exception:
        pass
    return adapters

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_sessions():
    sessions = []
    try:
        out = subprocess.check_output(["who", "-u"], text=True, stderr=subprocess.DEVNULL)
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) < 2:
                continue
            sessions.append({
                "username":    parts[0],
                "clientIp":    parts[-1].strip("()") if parts[-1].startswith("(") else "",
                "logonTime":   " ".join(parts[2:4]) if len(parts) >= 4 else "",
                "sessionType": "SSH" if "pts" in (parts[1] if len(parts) > 1 else "") else "Console",
                "state":       "Active",
            })
    except Exception:
        pass
    return sessions

def get_recent_logs():
    events = []
    try:
        out = subprocess.check_output(
            ["journalctl", "-n", "30", "--output=short-iso", "-p", "0..4",
             "--no-pager", "--since", "1 hour ago"],
            text=True, stderr=subprocess.DEVNULL
        )
        for line in out.strip().splitlines():
            parts = line.split(" ", 3)
            if len(parts) < 4:
                continue
            events.append({
                "timestamp": parts[0],
                "level":     "error",
                "source":    parts[2].rstrip(":"),
                "message":   parts[3][:150],
            })
    except Exception:
        pass
    return {"events": events}

def detect_roles():
    roles = []
    # systemctl servis kontrolü
    services = {
        "nginx":       "Nginx",
        "apache2":     "Apache",
        "mysql":       "MySQL",
        "mariadb":     "MySQL",
        "postgresql":  "PostgreSQL",
        "docker":      "Docker",
        "sshd":        "SSH Server",
        "named":       "DNS",
        "postfix":     "Mail",
    }
    try:
        out = subprocess.check_output(
            ["systemctl", "is-active", *services.keys()],
            text=True, stderr=subprocess.DEVNULL
        )
        lines = out.strip().splitlines()
        for i, (svc, label) in enumerate(services.items()):
            if i < len(lines) and lines[i].strip() == "active":
                roles.append(label)
    except Exception:
        pass
    return roles

def collect_metrics():
    return {
        "cpu":             get_cpu_percent(),
        "ram":             get_ram(),
        "disks":           get_disks(),
        "uptimeSeconds":   get_uptime_seconds(),
        "networkAdapters": get_network_adapters(),
    }

# ══════════════════════════════════════════════
#   HUB İLETİŞİM
# ══════════════════════════════════════════════
def hub_post(url, payload, timeout=10):
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(url, data=data,
                                   headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def register_with_hub(cfg):
    try:
        resp = hub_post(f"{cfg['hub_url']}/api/agent/register", {
            "hostname":  socket.gethostname(),
            "ip":        get_local_ip(),
            "os":        "linux",
            "version":   VERSION,
            "secret":    cfg["secret"],
            "localPort": cfg["local_port"],
        })
        cfg["agent_id"] = resp["agentId"]
        cfg["token"]    = resp["token"]
        save_config(cfg)
        print(f"[PusulaAgent] Kayıt başarılı. ID: {resp['agentId']}")
        return True
    except Exception as e:
        print(f"[PusulaAgent] Kayıt başarısız: {e}")
        return False

def send_report(cfg, report):
    try:
        resp = hub_post(f"{cfg['hub_url']}/api/agent/report", report, timeout=15)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"ok": False, "reregister": True}
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def poll_messages(cfg):
    if not cfg.get("token") or not cfg.get("agent_id"):
        return
    try:
        url = (f"{cfg['hub_url']}/api/agent/messages"
               f"?agentId={cfg['agent_id']}&token={cfg['token']}")
        req  = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())

        if data.get("reregister"):
            cfg["token"]    = None
            cfg["agent_id"] = None
            register_with_hub(cfg)
            return

        for exec_req in data.get("execs") or []:
            threading.Thread(
                target=invoke_exec, args=(cfg, exec_req), daemon=True
            ).start()

    except Exception:
        pass  # poll hatası kritik değil

def invoke_exec(cfg, exec_req):
    exec_id  = exec_req.get("execId", "")
    command  = exec_req.get("command", "")
    timeout  = int(exec_req.get("timeout") or 30)

    start = time.time()
    stdout_val = ""
    stderr_val = ""
    exit_code  = -1

    try:
        proc = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=timeout
        )
        stdout_val = proc.stdout
        stderr_val = proc.stderr
        exit_code  = proc.returncode
    except subprocess.TimeoutExpired:
        stderr_val = f"Komut zaman aşımına uğradı ({timeout} sn)"
        exit_code  = -2
    except Exception as e:
        stderr_val = str(e)
        exit_code  = -1

    duration_ms = round((time.time() - start) * 1000)

    try:
        hub_post(f"{cfg['hub_url']}/api/agent/exec-result", {
            "execId":   exec_id,
            "agentId":  cfg["agent_id"],
            "token":    cfg["token"],
            "stdout":   stdout_val,
            "stderr":   stderr_val,
            "exitCode": exit_code,
            "duration": duration_ms,
        }, timeout=10)
        now_str = datetime.now().strftime("%H:%M:%S")
        print(f"[{now_str}] ⚡ Exec tamamlandı: {exec_id} (exit:{exit_code})")
    except Exception as e:
        print(f"[PusulaAgent] Exec sonucu gönderilemedi: {e}")

# ══════════════════════════════════════════════
#   YEREL WEB ARAYÜZÜ
# ══════════════════════════════════════════════
HTML_PAGE = r"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PusulaAgent</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f2f0;color:#111;font-size:13px}
  .header{background:#fff;border-bottom:1px solid #e5e5e5;padding:14px 24px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .logo{width:28px;height:28px;background:#111;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px}
  .title{font-size:15px;font-weight:700}
  .hostname{font-size:12px;color:#666}
  .dot{width:8px;height:8px;border-radius:50%;background:#10b981;margin-left:auto;flex-shrink:0}
  .dot.off{background:#ef4444}
  .dot.conn{animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .container{max-width:960px;margin:0 auto;padding:20px 16px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .card{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.07);overflow:hidden;margin-bottom:12px}
  .card-head{background:#f9f8f7;border-bottom:1px solid #eee;padding:8px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;display:flex;align-items:center;gap:8px}
  .card-head span{flex:1}
  .card-body{padding:14px}
  .metric-val{font-size:28px;font-weight:700}
  .metric-sub{font-size:11px;color:#888;margin-top:2px}
  .bar-wrap{background:#f0f0f0;border-radius:4px;height:6px;margin-top:8px;overflow:hidden}
  .bar{height:100%;border-radius:4px;transition:width .4s}
  .bar.ok{background:#10b981}.bar.warn{background:#f59e0b}.bar.danger{background:#ef4444}
  .badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;border:1px solid}
  .badge.green{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
  .badge.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}
  .status-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:12px}
  .status-row:last-child{border-bottom:none}
  .status-row .label{color:#888;width:110px;flex-shrink:0}
  .status-row .val{font-weight:500;flex:1}
  form label{display:block;font-size:11px;font-weight:600;color:#555;margin-bottom:4px;margin-top:12px}
  form label:first-child{margin-top:0}
  form input{width:100%;height:34px;border:1px solid #d1d5db;border-radius:5px;padding:0 10px;font-size:12px;outline:none;transition:border .15s}
  form input:focus{border-color:#6366f1}
  form input[type=number]{width:80px}
  .btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:5px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .15s}
  .btn-primary{background:#111;color:#fff}.btn-primary:hover{opacity:.85}
  .btn-outline{background:#fff;color:#374151;border:1px solid #d1d5db}.btn-outline:hover{background:#f9f8f7}
  .btn-row{display:flex;gap:8px;margin-top:14px}
  .log-item{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:11px}
  .log-item:last-child{border-bottom:none}
  .log-time{color:#888;font-family:monospace;flex-shrink:0}
  .log-ok{color:#10b981}.log-err{color:#ef4444}
  .roles-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:14px}
  .tag{font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:#f0f0f0;color:#444}
  #toast{position:fixed;bottom:20px;right:20px;background:#111;color:#fff;padding:10px 16px;border-radius:6px;font-size:12px;display:none;z-index:999}
</style>
</head>
<body>
<div class="header">
  <div class="logo">PA</div>
  <div>
    <div class="title">PusulaAgent</div>
    <div class="hostname" id="h-hostname">yükleniyor…</div>
  </div>
  <div id="h-dot" class="dot conn"></div>
</div>

<div class="container">
  <div class="card">
    <div class="card-head"><span>Bağlantı Durumu</span><span id="h-badge"></span></div>
    <div class="card-body">
      <div class="status-row"><div class="label">Hub Adresi</div><div class="val" id="s-hub"></div></div>
      <div class="status-row"><div class="label">Son Gönderim</div><div class="val" id="s-last"></div></div>
      <div class="status-row"><div class="label">Agent ID</div><div class="val" id="s-aid" style="font-family:monospace;font-size:11px;color:#888"></div></div>
      <div class="status-row"><div class="label">Çalışma Süresi</div><div class="val" id="s-up"></div></div>
    </div>
  </div>

  <div class="grid3">
    <div class="card"><div class="card-head"><span>CPU</span></div><div class="card-body">
      <div class="metric-val" id="m-cpu">—</div><div class="metric-sub">İşlemci</div>
      <div class="bar-wrap"><div class="bar ok" id="b-cpu" style="width:0%"></div></div>
    </div></div>
    <div class="card"><div class="card-head"><span>RAM</span></div><div class="card-body">
      <div class="metric-val" id="m-ram">—</div><div class="metric-sub" id="m-ram-s"></div>
      <div class="bar-wrap"><div class="bar ok" id="b-ram" style="width:0%"></div></div>
    </div></div>
    <div class="card"><div class="card-head"><span>Disk</span></div><div class="card-body">
      <div class="metric-val" id="m-disk">—</div><div class="metric-sub" id="m-disk-s"></div>
      <div class="bar-wrap"><div class="bar ok" id="b-disk" style="width:0%"></div></div>
    </div></div>
  </div>

  <div class="card">
    <div class="card-head"><span>Tespit Edilen Roller</span></div>
    <div class="roles-wrap" id="roles">—</div>
  </div>

  <div class="grid2">
    <div class="card"><div class="card-head"><span>Yapılandırma</span></div><div class="card-body">
      <form onsubmit="saveConfig(event)">
        <label>Hub Adresi</label><input type="url" id="cfg-hub" placeholder="http://192.168.1.100:3000" required>
        <label>Secret</label><input type="password" id="cfg-sec" placeholder="••••••••" required>
        <label>Aralık (sn)</label><input type="number" id="cfg-int" min="10" max="300" value="30">
        <div class="btn-row">
          <button class="btn btn-primary">Kaydet</button>
          <button type="button" class="btn btn-outline" onclick="pushNow()">Şimdi Gönder</button>
        </div>
      </form>
    </div></div>

    <div class="card"><div class="card-head"><span>Son Aktiviteler</span></div>
      <div class="card-body" id="log-list" style="padding:0 14px"></div>
    </div>
  </div>
</div>
<div id="toast"></div>

<script>
function fmtUp(s){const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d>0?d+'g '+h+'s':h>0?h+'s '+m+'d':m+'d'}
function barCls(v){return v>85?'bar danger':v>70?'bar warn':'bar ok'}
async function refresh(){
  try{
    const d=await(await fetch('/api/status')).json();
    document.getElementById('h-hostname').textContent=d.hostname+' · '+d.ip;
    const dot=document.getElementById('h-dot');
    dot.className='dot '+(d.hub_connected?'conn':'off');
    document.getElementById('s-hub').textContent=d.hub_url;
    document.getElementById('s-last').textContent=d.last_push||'—';
    document.getElementById('s-aid').textContent=d.agent_id||'Kayıtlı değil';
    document.getElementById('s-up').textContent=fmtUp(d.uptime_sec||0);
    const b=document.getElementById('h-badge');
    b.className='badge '+(d.hub_connected?'green':'red');
    b.textContent=d.hub_connected?'● Bağlı':'○ Bağlantı yok';
    const m=d.metrics||{};
    const cpu=m.cpu||0,ram=m.ram||{},disk=(m.disks||[])[0]||{};
    const rp=ram.totalMB>0?Math.round(ram.usedMB/ram.totalMB*100):0;
    document.getElementById('m-cpu').textContent=cpu+'%';
    let bc=document.getElementById('b-cpu');bc.style.width=cpu+'%';bc.className=barCls(cpu)+' bar';
    document.getElementById('m-ram').textContent=rp+'%';
    document.getElementById('m-ram-s').textContent=(ram.usedMB||0)+' MB / '+(ram.totalMB||0)+' MB';
    let br=document.getElementById('b-ram');br.style.width=rp+'%';br.className=barCls(rp)+' bar';
    if(disk.drive){
      document.getElementById('m-disk').textContent=disk.percent+'%';
      document.getElementById('m-disk-s').textContent=disk.drive+' · '+disk.usedGB+'GB/'+disk.totalGB+'GB';
      let bd=document.getElementById('b-disk');bd.style.width=disk.percent+'%';bd.className=barCls(disk.percent)+' bar';
    }
    document.getElementById('roles').innerHTML=(d.roles&&d.roles.length)?d.roles.map(r=>`<span class="tag">${r}</span>`).join(''):'<span style="color:#aaa;font-size:11px">Tespit edilmedi</span>';
    if(!document.getElementById('cfg-hub').value){document.getElementById('cfg-hub').value=d.hub_url||''}
    document.getElementById('cfg-int').value=d.interval||30;
    const logs=d.activity_log||[];
    document.getElementById('log-list').innerHTML=logs.slice(0,10).map(l=>`<div class="log-item"><span class="log-time">${l.time}</span><span class="${l.ok?'log-ok':'log-err'}">${l.ok?'✓':'✗'}</span><span style="color:#555">${l.msg}</span></div>`).join('')||'<div style="padding:8px 0;color:#aaa;font-size:11px">Henüz aktivite yok</div>';
  }catch(e){}
}
async function saveConfig(e){
  e.preventDefault();
  await fetch('/api/config',{method:'POST',body:JSON.stringify({hub_url:document.getElementById('cfg-hub').value,secret:document.getElementById('cfg-sec').value,interval:+document.getElementById('cfg-int').value}),headers:{'Content-Type':'application/json'}});
  toast('Kaydedildi');document.getElementById('cfg-sec').value='';
}
async function pushNow(){const r=await(await fetch('/api/push',{method:'POST'})).json();toast(r.ok?'Gönderildi':'Hata: '+r.error,!r.ok);refresh()}
function toast(m,e=false){const el=document.getElementById('toast');el.textContent=m;el.style.background=e?'#ef4444':'#111';el.style.display='block';setTimeout(()=>el.style.display='none',3000)}
refresh();setInterval(refresh,15000);
</script>
</body>
</html>"""

class AgentHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Sessiz mod

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html):
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            self._send_html(HTML_PAGE)
        elif self.path == "/api/status":
            with state_lock:
                cfg = state["config"]
                self._send_json({
                    "hostname":      socket.gethostname(),
                    "ip":            get_local_ip(),
                    "hub_url":       cfg.get("hub_url", ""),
                    "hub_connected": state["hub_connected"],
                    "last_push":     state["last_push"],
                    "agent_id":      cfg.get("agent_id", ""),
                    "interval":      cfg.get("interval", 30),
                    "uptime_sec":    state["uptime_sec"],
                    "metrics":       state["metrics"],
                    "roles":         state["roles"],
                    "activity_log":  list(state["activity_log"]),
                })
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/api/config":
            with state_lock:
                cfg = state["config"]
                if body.get("hub_url"):  cfg["hub_url"]  = body["hub_url"]
                if body.get("secret"):
                    cfg["secret"]   = body["secret"]
                    cfg["token"]    = None
                    cfg["agent_id"] = None
                if body.get("interval"): cfg["interval"] = int(body["interval"])
                save_config(cfg)
            self._send_json({"ok": True})

        elif self.path == "/api/push":
            state["trigger_push"].set()
            self._send_json({"ok": True})

        else:
            self.send_response(404)
            self.end_headers()

# ══════════════════════════════════════════════
#   ANA DÖNGÜ
# ══════════════════════════════════════════════
def main():
    cfg = load_config()
    with state_lock:
        state["config"] = cfg

    port = cfg["local_port"]

    print(f"""
╔══════════════════════════════════════════╗
║       PusulaAgent v{VERSION}               ║
║  Hub  : {cfg['hub_url']:<34}║
║  Port : {port:<34}║
╚══════════════════════════════════════════╝
""")
    print(f"[PusulaAgent] Yerel arayüz: http://localhost:{port}")

    # Web sunucusunu arka planda başlat
    server = HTTPServer(("0.0.0.0", port), AgentHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    # Rolleri tespit et
    roles = detect_roles()
    with state_lock:
        state["roles"] = roles

    # İlk kayıt
    if not cfg.get("token"):
        print("[PusulaAgent] Hub'a kayıt yapılıyor...")
        register_with_hub(cfg)

    print("[PusulaAgent] Döngü başladı. Ctrl+C ile durdur.")

    while True:
        try:
            # Metrikleri topla
            metrics = collect_metrics()
            with state_lock:
                state["metrics"]    = metrics
                state["uptime_sec"] = metrics["uptimeSeconds"]

            # Rapor oluştur
            report = {
                "agentId":   cfg.get("agent_id"),
                "token":     cfg.get("token"),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "metrics":   metrics,
                "sessions":  get_sessions(),
                "logs":      get_recent_logs(),
                "roles":     roles,
            }

            # Hub'a gönder
            if cfg.get("token"):
                result  = send_report(cfg, report)
                now_str = datetime.now().strftime("%H:%M:%S")
                log_entry = {
                    "time": now_str,
                    "ok":   result["ok"],
                    "msg":  "Veri gönderildi" if result["ok"] else result.get("error", "Hata"),
                }
                with state_lock:
                    state["activity_log"].appendleft(log_entry)
                    if result["ok"]:
                        state["hub_connected"] = True
                        state["last_push"]     = now_str
                    elif result.get("reregister"):
                        cfg["token"]    = None
                        cfg["agent_id"] = None
                        state["hub_connected"] = False
                    else:
                        state["hub_connected"] = False

                if result["ok"]:
                    print(f"[{now_str}] ✓ Gönderildi")
                    poll_messages(cfg)
                elif result.get("reregister"):
                    print("[PusulaAgent] Token geçersiz, yeniden kayıt...")
                    register_with_hub(cfg)
                else:
                    print(f"[{now_str}] ✗ {result.get('error','Hata')}")
            else:
                register_with_hub(cfg)

        except Exception as e:
            print(f"[PusulaAgent] Hata: {e}")

        # Interval veya manual push bekleme
        triggered = state["trigger_push"].wait(timeout=cfg.get("interval", 30))
        if triggered:
            state["trigger_push"].clear()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[PusulaAgent] Durduruluyor...")
        sys.exit(0)
