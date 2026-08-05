#!/usr/bin/env bash
# Provisions Ollama for the ADHDisplay AI assistant's local/offline
# provider (see src/features/admin/settings/AssistantProviderSection.tsx's
# "Local" option and server/assistant/ollamaClient.ts). Idempotent — safe to
# re-run any time, e.g. after changing which model tags are configured on
# the Integrations page's Ollama card.
#
# Usage: bash scripts/setup-ollama.sh
# Called as one step of installer/linux/install.sh, but also independently
# runnable on its own (e.g. to just re-pull the default models again).
set -euo pipefail

VISION_MODEL="${OLLAMA_VISION_MODEL:-qwen2.5vl:3b}"
THINKING_MODEL="${OLLAMA_THINKING_MODEL:-qwen2.5:3b-instruct}"

if command -v ollama >/dev/null 2>&1; then
  echo "Ollama is already installed, skipping install step."
else
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Recommended service overrides for a shared, Pi-class box: bind to
# localhost only (Node and Ollama run on the same machine, no reason to
# expose this on the LAN), keep at most one model resident at once, and
# serialize requests — matches ASSISTANT_MODEL_CAPABILITIES.local's own
# maxParallelChunkCalls: 1 in server/assistant/steps.ts.
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files ollama.service >/dev/null 2>&1; then
  echo "Applying recommended Ollama service settings..."
  sudo mkdir -p /etc/systemd/system/ollama.service.d
  sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_NUM_PARALLEL=1
EOF
  sudo systemctl daemon-reload
  sudo systemctl restart ollama
  sudo systemctl enable ollama >/dev/null 2>&1 || true
else
  echo "No systemd ollama.service found — skipping service override (Ollama may be running some other way, e.g. inside a container)."
fi

echo "Waiting for Ollama to come up..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Pulling the default vision model ($VISION_MODEL)..."
ollama pull "$VISION_MODEL"

if [ "$THINKING_MODEL" != "$VISION_MODEL" ]; then
  echo "Pulling the default thinking model ($THINKING_MODEL)..."
  ollama pull "$THINKING_MODEL"
else
  echo "Thinking model is the same tag as vision ($THINKING_MODEL) — already pulled above."
fi

echo ""
echo "Ollama is set up. Installed models:"
curl -fsS http://localhost:11434/api/tags | node -e "process.stdin.on('data', d => JSON.parse(d).models.forEach(m => console.log(' -', m.name)))" 2>/dev/null || ollama list

echo ""
echo "Next: in the app, go to Integrations -> Ollama, confirm the host/models, click 'Test connection', then switch Settings -> Advanced -> AI assistant model to Local."
