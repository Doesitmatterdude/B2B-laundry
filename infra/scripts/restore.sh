#!/usr/bin/env bash
# FreshFold — PostgreSQL restore script (SRS 19.3)
# Usage: ./restore.sh <backup_file.sql.gz>
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup_file.sql.gz>}"
DB_URL="${DATABASE_URL:?DATABASE_URL not set}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "==> WARNING: This will DROP and recreate the database."
echo "==> Target: $DB_URL"
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "==> Restoring from $BACKUP_FILE ..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL" 2>&1 | tail -5
echo "==> Restore complete. Run: pnpm prisma:generate && pnpm prisma:seed"