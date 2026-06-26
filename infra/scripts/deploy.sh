#!/usr/bin/env bash
# FreshFold — deploy script for GCP VM (SRS 25)
# Pulls latest, rebuilds, runs migrations, restarts containers.
set -euo pipefail

cd /opt/freshfold || { echo "ERROR: /opt/freshfold not found"; exit 1; }

echo "==> Pulling latest code"
git pull origin main

echo "==> Building and restarting containers"
docker compose -f infra/docker/compose.yml up -d --build

echo "==> Running migrations"
docker compose -f infra/docker/compose.yml exec -T api pnpm prisma:migrate

echo "==> Health check"
sleep 5
if curl -sf http://localhost:3000/api/v1/auth/me > /dev/null 2>&1 || \
   curl -sf http://localhost:3000/api/v1/ > /dev/null 2>&1; then
  echo "==> Deploy successful — API is responding"
else
  echo "==> WARNING: API not responding — check logs: docker compose logs api"
  exit 1
fi