#!/bin/sh
# Daily dumps + one restore self-test per container start (isolated temp DB on same private Postgres).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOST="${POSTGRES_HOST:-db}"
DB="${POSTGRES_DB:-recruitai}"
USER="${POSTGRES_USER:-recruitai}"
RESTORE_DB="${RESTORE_TEST_DB:-recruitai_restore_check}"

echo "[backup] starting loop (keep ${KEEP_DAYS} days)"

dump_once() {
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  OUT="/backups/recruitai-${STAMP}.sql.gz"
  echo "[backup] dumping to ${OUT}"
  if pg_dump -h "$HOST" -U "$USER" -d "$DB" --no-owner --no-acl | gzip -c >"$OUT"; then
    echo "[backup] ok $(wc -c <"$OUT") bytes"
    echo "$OUT"
  else
    echo "[backup] FAILED" >&2
    rm -f "$OUT"
    return 1
  fi
}

restore_self_test() {
  LATEST=$(ls -1t /backups/recruitai-*.sql.gz 2>/dev/null | head -1 || true)
  if [ -z "$LATEST" ]; then
    echo "[restore-test] no dump found"
    return 1
  fi
  BYTES=$(wc -c <"$LATEST")
  if [ "$BYTES" -lt 1000 ]; then
    echo "[restore-test] dump too small (${BYTES} bytes) — skip"
    return 1
  fi
  echo "[restore-test] using ${LATEST} (${BYTES} bytes)"
  psql -h "$HOST" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" >/dev/null
  psql -h "$HOST" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${RESTORE_DB} OWNER ${USER};" >/dev/null
  if ! gunzip -c "$LATEST" | psql -h "$HOST" -U "$USER" -d "$RESTORE_DB" -v ON_ERROR_STOP=1 >/dev/null; then
    echo "[restore-test] FAILED restore" >&2
    psql -h "$HOST" -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" >/dev/null || true
    return 1
  fi
  COUNTS=$(psql -h "$HOST" -U "$USER" -d "$RESTORE_DB" -Atc \
    "select 'agencies='||(select count(*) from agencies)||
            ' recruiters='||(select count(*) from recruiters)||
            ' jobs='||(select count(*) from jobs)||
            ' sessions='||(select count(*) from sessions)||
            ' transcripts='||(select count(*) from transcripts)||
            ' reports='||(select count(*) from reports);")
  echo "[restore-test] OK ${COUNTS}"
  psql -h "$HOST" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" >/dev/null
  echo "[restore-test] temp database dropped"
}

# Immediate dump + restore verification (proves backups are restorable).
DUMP_PATH=$(dump_once) || true
restore_self_test || true
find /backups -name 'recruitai-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

while true; do
  sleep 86400
  dump_once || true
  find /backups -name 'recruitai-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
done
