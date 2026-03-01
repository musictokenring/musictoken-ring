#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILES=(
  "index.html"
  "styles/main.css"
  "game-engine.js"
  "SAFE_ROLLOUT_CHECKLIST.md"
  "backend/prize-service.js"
  "config/config.js"
)

echo "[guard] Checking conflict markers in critical files..."
if rg -n '^(<<<<<<<|=======|>>>>>>>)' "${FILES[@]}" >/dev/null 2>&1; then
  echo "[guard][error] Conflict markers detected in critical files." >&2
  rg -n '^(<<<<<<<|=======|>>>>>>>)' "${FILES[@]}" || true
  exit 1
fi

echo "[guard] Conflict-marker check: OK"

echo "[guard] Running project checks..."
npm run check

echo "[guard] All checks passed. Safe to push."
