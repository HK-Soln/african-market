#!/usr/bin/env bash
# Starts the Phase 0-1 stack in the codespace and seeds it with made-up shops (decision T-39).
#   bash tools/test-env/up.sh            build, start, wait, seed
#   bash tools/test-env/up.sh --no-seed  build and start only
set -euo pipefail
cd "$(dirname "$0")/../.."

# Only what Phase 1 uses: later phases' services are left out to save build time and memory.
APPS=(gateway identity shops catalog discovery media web seller admin)

# One image at a time: built together, the installs and Next.js builds use more than the
# codespace's 16 GB and it stops answering. They share the dependency layer, so later ones are quick.
for app in "${APPS[@]}"; do
  echo "Building $app"
  docker compose --profile apps build "$app"
done

echo "Starting: ${APPS[*]}"
docker compose --profile apps up -d --wait "${APPS[@]}"

if [[ "${1:-}" != "--no-seed" ]]; then
  node tools/test-env/seed.mjs
fi

cat <<'EOF'

Ready. On your own machine, open the apps on localhost with:
  gh codespace ports forward 3000:3000 3001:3001 3002:3002 4000:4000 9000:9000 8025:8025
then http://localhost:3000 (web), :3001 (seller), :3002 (admin), :8025 (Mailpit).
EOF
