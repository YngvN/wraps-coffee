#!/usr/bin/env bash
# Counterpart to installer/linux/install.sh — stops and disables the
# autostart service it registered, removes the firewall rules it opened, and
# (only with --purge) removes the build artifacts and data it generated.
#
# Run from the root of the checkout install.sh was run from:
#   bash installer/linux/uninstall.sh [--purge]
#
# Without --purge, this only undoes the *system-level* changes install.sh
# made (systemd service, firewall rules) and leaves the checkout itself
# alone — unlike the Windows installer's C:\WrapsCoffee, a Linux install
# lives directly in the user's own git checkout, so deleting node_modules/
# dist/data/uploads is a separate, more destructive step gated behind an
# explicit flag rather than being unconditional.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

PURGE=false
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    *)
      echo "Unknown argument: $arg (only --purge is supported)" >&2
      exit 1
      ;;
  esac
done

echo "== Wraps & Coffee uninstaller (Linux) =="
echo "Target: $REPO_DIR"
echo ""

# 1. Stop + disable the autostart service ------------------------------------
# systemctl stop sends SIGTERM, which server/index.ts now handles as a clean
# shutdown (closes the HTTP/WebSocket server, stops the pollers and the mDNS
# advertisement) rather than a hard kill.
if command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/wraps-coffee.service ]; then
  echo "Stopping and disabling the wraps-coffee service..."
  sudo systemctl stop wraps-coffee.service 2>/dev/null || true
  sudo systemctl disable wraps-coffee.service 2>/dev/null || true
  sudo rm -f /etc/systemd/system/wraps-coffee.service
  sudo systemctl daemon-reload
else
  echo "No wraps-coffee systemd service found — skipping."
fi

# 2. Fallback: kill anything left running manually (outside the service) -----
# Plain SIGTERM (no -9/-KILL), same graceful-shutdown reasoning as above.
pkill -f "tsx server/index.ts" 2>/dev/null || true
pkill -f "vite preview" 2>/dev/null || true

# 3. Firewall rules install.sh opened ------------------------------------------
if command -v ufw >/dev/null 2>&1; then
  echo ""
  echo "Removing firewall rules (ufw)..."
  sudo ufw delete allow 4000/tcp >/dev/null 2>&1 || true
  sudo ufw delete allow 4173/tcp >/dev/null 2>&1 || true
  sudo ufw delete allow 5353/udp >/dev/null 2>&1 || true
fi

# 4. Optional: remove build artifacts + data (see the module comment above) --
if [ "$PURGE" = true ]; then
  echo ""
  echo "Removing node_modules, dist, logs, server/data, and server/uploads..."
  rm -rf "$REPO_DIR/node_modules" "$REPO_DIR/dist" "$REPO_DIR/logs" "$REPO_DIR/server/data" "$REPO_DIR/server/uploads"
else
  echo ""
  echo "Leaving node_modules, dist, logs, server/data, and server/uploads in place — re-run with --purge to remove them too."
fi

# Node.js and Ollama themselves are deliberately left installed — same
# posture as the Windows uninstaller, they're shared system tools this app
# doesn't own.
echo ""
echo "Done. The service is stopped and won't start again on reboot."
