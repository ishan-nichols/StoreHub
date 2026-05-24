#!/usr/bin/env bash
# build-native.sh — Build web app and sync to iOS + Android in one step.
# Run from the storehub package root: bash scripts/build-native.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

echo "==> [1/3] Building web app..."
pnpm run build

echo "==> [2/3] Syncing to iOS and Android..."
npx cap sync

echo "==> [3/3] Done. Open native IDEs with:"
echo "    npx cap open ios     (requires Xcode on macOS)"
echo "    npx cap open android (requires Android Studio)"
