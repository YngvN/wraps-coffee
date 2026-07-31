#!/usr/bin/env bash
# Linux/Raspberry Pi counterpart to installer/wraps-coffee.iss (the Windows
# Inno Setup installer) — installs Node.js, Ollama + the assistant's two
# default local models (via scripts/setup-ollama.sh), builds the app, opens
# the same firewall ports the Windows installer opens, and registers a
# systemd service so it survives a reboot, the same way the Windows
# installer's "autostart" task + start-wraps-coffee.bat watchdog do.
#
# Run this from the root of an already-cloned copy of this repo:
#   git clone <this repo's URL> wraps-coffee && cd wraps-coffee
#   bash installer/linux/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

if [ ! -f package.json ] || [ ! -f server/index.ts ]; then
  echo "This doesn't look like a Wraps & Coffee checkout (expected package.json and server/index.ts next to installer/linux/) — aborting." >&2
  exit 1
fi

echo "== Wraps & Coffee installer (Linux) =="
echo "Installing into: $REPO_DIR"
echo ""

# 1. Node.js -----------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  echo "Node.js already installed ($(node --version)), skipping."
else
  echo "Installing Node.js LTS (via NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 2. Ollama + the two default local models -----------------------------------
echo ""
echo "Setting up Ollama..."
bash "$REPO_DIR/scripts/setup-ollama.sh"

# 3. App dependencies + build --------------------------------------------------
echo ""
echo "Installing dependencies (this can take several minutes)..."
npm install

echo "Building the app..."
npm run build

# 4. Firewall ports (same ports the Windows installer opens: 4000/4173 TCP for
#    the server/preview, 5353 UDP for mDNS) -----------------------------------
if command -v ufw >/dev/null 2>&1; then
  echo ""
  echo "Opening firewall ports (ufw)..."
  sudo ufw allow 4000/tcp >/dev/null
  sudo ufw allow 4173/tcp >/dev/null
  sudo ufw allow 5353/udp >/dev/null
else
  echo "ufw not found — skipping firewall step (open TCP 4000/4173 and UDP 5353 manually if this machine has a firewall enabled)."
fi

# 5. systemd autostart service, same role as the Windows installer's
#    "WrapsCoffeeLauncher" logon task + start-wraps-coffee.bat watchdog -------
if command -v systemctl >/dev/null 2>&1; then
  echo ""
  echo "Registering the autostart service..."
  RUN_USER="${SUDO_USER:-$USER}"
  sudo tee /etc/systemd/system/wraps-coffee.service >/dev/null <<EOF
[Unit]
Description=Wraps & Coffee (admin dashboard + kiosk server)
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
ExecStart=/usr/bin/npm run preview:kiosk
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable wraps-coffee.service
  sudo systemctl restart wraps-coffee.service
else
  echo "systemctl not found — skipping autostart service (start the app manually with 'npm run preview:kiosk')."
fi

# 6. Print the LAN URL / QR code, same as start-wraps-coffee.bat does ---------
echo ""
echo "Waiting for the server to come up..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:4000/server-info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

LAN_IP="$(curl -fsS http://localhost:4000/server-info 2>/dev/null | node -e "process.stdin.on('data', d => { try { console.log(JSON.parse(d).lanIp ?? '') } catch { console.log('') } })" || echo "")"

echo ""
echo "Wraps & Coffee is running:"
echo "  On this machine: http://localhost:4173/admin/login"
if [ -n "$LAN_IP" ]; then
  echo "  On other devices: http://$LAN_IP:4173/admin/login"
  echo ""
  node "$REPO_DIR/installer/print-qr.cjs" "http://$LAN_IP:4173/admin/login" || true
else
  echo "  (couldn't detect a LAN IP — this machine may be offline)"
fi
echo ""
echo "Next: in the app, go to Integrations -> Ollama, confirm the host/models, click 'Test connection', then switch Settings -> Advanced -> AI assistant model to Local."
