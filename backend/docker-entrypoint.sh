#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node dist/db/migrate.js
fi

exec "$@"
