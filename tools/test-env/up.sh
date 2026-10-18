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

echo "Starting: ${APPS[*]} and mailpit"
docker compose --profile apps up -d --wait "${APPS[@]}" mailpit

if [[ "${1:-}" != "--no-seed" ]]; then
  node tools/test-env/seed.mjs
fi

cat <<'EOF'

Ready. On your own machine, forward each port with its own command (several in one command
fails with "400: Bad Request"), e.g. in separate terminals:
  gh codespace ports forward -c <name> 3000:3000
  ... and the same for 3001, 3002, 4000, 9000 and 8025
then http://localhost:3000 (web), :3001 (seller), :3002 (admin), :8025 (Mailpit).
EOF
