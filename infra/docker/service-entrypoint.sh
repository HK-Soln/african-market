#!/bin/sh
# Entrypoint of the NestJS images.
#   start             run the app (default)
#   migrate           apply this service's pending migrations, then exit (a one-off task in AWS)
#   migrate-and-start both, for docker compose on a developer machine
#   anything else     run it as a command, e.g. `sh`
set -e

migrate() {
  if [ ! -f dist/data-source.js ]; then
    echo "$APP has no database; nothing to migrate"
    return 0
  fi
  node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
}

case "${1:-start}" in
  start) exec node dist/main.js ;;
  migrate) migrate ;;
  migrate-and-start) migrate && exec node dist/main.js ;;
  *) exec "$@" ;;
esac
