#!/usr/bin/env bash
# deploy.sh — Pull latest code, rebuild, migrate, and restart services.
# Runs on the production Linux server (cloud deploy).
# Called by GitHub Actions via SSH, or manually: bash scripts/deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "[deploy] Pulling latest code..."
git pull --ff-only

echo "[deploy] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[deploy] Building API server..."
pnpm --filter @workspace/api-server run build

echo "[deploy] Building frontend..."
pnpm --filter @workspace/storehub run build

echo "[deploy] Running database migrations..."
pnpm --filter @workspace/db run push

echo "[deploy] Restarting services..."
pm2 restart ecosystem.config.cjs --env production

echo "[deploy] Done. Checking status..."
pm2 list
