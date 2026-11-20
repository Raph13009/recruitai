#!/bin/sh
# Daily encrypted-ready dumps of RecruitAI Postgres (plain SQL.gz).
# Off-server copy is a separate operator step (see deploy/docs/BACKUP_ROLLBACK.md).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOST="${POSTGRES_HOST:-db}"
DB="${POSTGRES_DB:-recruitai}"
USER="${POSTGRES_USER:-recruitai}"

echo "[backup] starting loop (keep ${KEEP_DAYS} days)"

while true; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  OUT="/backups/recruitai-${STAMP}.sql.gz"
  echo "[backup] dumping to ${OUT}"
  if pg_dump -h "$HOST" -U "$USER" -d "$DB" --no-owner --no-acl | gzip -c >"$OUT"; then
    echo "[backup] ok $(wc -c <"$OUT") bytes"
  else
    echo "[backup] FAILED" >&2
    rm -f "$OUT"
  fi
  find /backups -name 'recruitai-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
  # Sleep ~24h (interruptible by container restart).
  sleep 86400
done
