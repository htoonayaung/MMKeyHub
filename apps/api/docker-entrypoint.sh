#!/bin/sh
set -e

export PATH="/app/apps/api/node_modules/.bin:/app/node_modules/.bin:$PATH"
export NODE_PATH="/app/apps/api/node_modules:/app/node_modules"

if [ -n "$(find /app/prisma/migrations -mindepth 1 -maxdepth 1 -type d 2>/dev/null)" ]; then
  echo "[MMKeyHub API] Running Prisma migrations..."
  prisma migrate deploy --schema=/app/prisma/schema.prisma
else
  echo "[MMKeyHub API] No migration directories found; syncing schema via prisma db push..."
  prisma db push --schema=/app/prisma/schema.prisma --skip-generate
fi

if [ "${RUN_SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[MMKeyHub API] Seeding initial database records..."
  tsx /app/prisma/seed.ts
fi

echo "[MMKeyHub API] Starting API & Telegram Bot server..."
exec node /app/apps/api/dist/index.js
