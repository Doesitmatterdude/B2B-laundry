#!/usr/bin/env bash
# FreshFold — PostgreSQL backup script (SRS 19.3)
# Run via cron: */15 * * * * /opt/freshfold/infra/scripts/backup.sh
set -euo pipefail

BACKUP_DIR="/opt/freshfold/backups"
RETENTION_DAYS=7
DB_URL="${DATABASE_URL:?DATABASE_URL not set}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/freshfold_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up to ${BACKUP_FILE}"
pg_dump "$DB_URL" --no-owner --no-privileges | gzip > "$BACKUP_FILE"
echo "==> Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

# Prune old backups
echo "==> Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "freshfold_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "==> Done. Remaining backups: $(ls -1 "$BACKUP_DIR" | wc -l)"