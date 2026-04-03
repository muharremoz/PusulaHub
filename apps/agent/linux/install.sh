#!/bin/bash
# PusulaAgent - Linux Kurulum Scripti
# Çalıştır: sudo bash install.sh

set -e

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SCRIPT="$AGENT_DIR/pusul-agent.py"
SERVICE_NAME="pusul-agent"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
CONFIG_FILE="$AGENT_DIR/config.json"

echo "╔══════════════════════════════════════════╗"
echo "║     PusulaAgent Linux Kurulum            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Python 3 kontrolü
if ! command -v python3 &>/dev/null; then
    echo "HATA: python3 bulunamadı. Kurun: apt install python3"
    exit 1
fi

# Config oluştur
if [ ! -f "$CONFIG_FILE" ]; then
    read -p "PusulaHub adresi (örn: http://192.168.1.100:3000): " HUB_URL
    read -p "Agent secret: " SECRET
    cat > "$CONFIG_FILE" <<EOF
{
  "hub_url": "$HUB_URL",
  "secret": "$SECRET",
  "interval": 30,
  "local_port": 8585,
  "agent_id": null,
  "token": null
}
EOF
    echo "✓ Config oluşturuldu"
fi

# Script çalıştırılabilir yap
chmod +x "$AGENT_SCRIPT"

# Firewall — port aç (ufw veya firewalld)
PORT=$(python3 -c "import json;print(json.load(open('$CONFIG_FILE'))['local_port'])")
if command -v ufw &>/dev/null; then
    ufw allow $PORT/tcp comment "PusulaAgent" 2>/dev/null || true
    echo "✓ ufw kuralı eklendi (port $PORT)"
elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port=$PORT/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo "✓ firewalld kuralı eklendi (port $PORT)"
fi

# systemd servis dosyası oluştur
PYTHON_BIN=$(which python3)
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=PusulaAgent - PusulaHub Linux Agent
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$AGENT_DIR
ExecStart=$PYTHON_BIN $AGENT_SCRIPT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pusul-agent

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Systemd servis dosyası oluşturuldu"

# Servisi etkinleştir ve başlat
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo "✓ Servis başlatıldı"
echo ""
echo "Kurulum tamamlandı!"
echo "Yerel arayüz  : http://localhost:$PORT"
echo "Durum kontrol : systemctl status $SERVICE_NAME"
echo "Loglar        : journalctl -u $SERVICE_NAME -f"
