#!/bin/sh
# Encrypt local Postgres dumps + branding, upload to S3-compatible storage (Cloudflare R2).
# Skips cleanly when R2 is not configured. Never prints secret values.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
BACKUPS_DIR="${BACKUPS_DIR:-/backups}"
BRANDING_DIR="${BRANDING_DIR:-/data/branding}"
STAGE_DIR="${STAGE_DIR:-/tmp/recruitai-offsite}"
ALERT_TO="${BACKUP_ALERT_TO:-}"

need_r2() {
  [ -n "${R2_ENDPOINT:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${AGE_RECIPIENT:-}" ]
}

alert_fail() {
  MSG="$1"
  echo "[offsite] FAIL: ${MSG}" >&2
  if [ -n "${RESEND_API_KEY:-}" ] && [ -n "$ALERT_TO" ]; then
    BODY=$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
      "${RESEND_FROM:-RecruitAI <onboarding@resend.dev>}" \
      "$ALERT_TO" \
      "[RecruitAI] Backup offsite FAILED" \
      "$MSG")
    curl -fsS -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$BODY" >/dev/null 2>&1 || true
  fi
}

if ! need_r2; then
  echo "[offsite] R2 not configured (R2_ENDPOINT/R2_BUCKET/AWS_*/AGE_RECIPIENT) — skip"
  exit 0
fi

command -v age >/dev/null || { alert_fail "age binary missing"; exit 1; }
command -v aws >/dev/null || { alert_fail "aws cli missing"; exit 1; }

mkdir -p "$STAGE_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="${STAGE_DIR}/recruitai-${STAMP}.tar"
ENC="${ARCHIVE}.gz.age"

echo "[offsite] packing dumps + branding"
tar -cf "$ARCHIVE" -C "$BACKUPS_DIR" . 2>/dev/null || tar -cf "$ARCHIVE" --files-from /dev/null
if [ -d "$BRANDING_DIR" ]; then
  tar -rf "$ARCHIVE" -C "$(dirname "$BRANDING_DIR")" "$(basename "$BRANDING_DIR")" || true
fi
gzip -f "$ARCHIVE"
ARCHIVE_GZ="${ARCHIVE}.gz"

echo "[offsite] encrypting with age"
age -r "$AGE_RECIPIENT" -o "$ENC" "$ARCHIVE_GZ"
rm -f "$ARCHIVE_GZ"

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
KEY="recruitai/$(date -u +%Y/%m)/recruitai-${STAMP}.tar.gz.age"
echo "[offsite] uploading s3://${R2_BUCKET}/${KEY}"
if ! aws s3 cp "$ENC" "s3://${R2_BUCKET}/${KEY}" --endpoint-url "$R2_ENDPOINT"; then
  alert_fail "upload failed for ${KEY}"
  rm -f "$ENC"
  exit 1
fi
rm -f "$ENC"
echo "[offsite] ok ${KEY}"

# Best-effort remote retention via list + delete older keys.
CUTOFF_EPOCH=$(date -u -d "-${OFFSITE_KEEP_DAYS} days" +%s 2>/dev/null || date -u -v-"${OFFSITE_KEEP_DAYS}"d +%s 2>/dev/null || echo "")
if [ -n "$CUTOFF_EPOCH" ]; then
  echo "[offsite] retention keep ${OFFSITE_KEEP_DAYS}d"
  aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "recruitai/" --endpoint-url "$R2_ENDPOINT" \
    --query 'Contents[].[Key,LastModified]' --output text 2>/dev/null \
    | while read -r key modified; do
        [ -z "$key" ] || [ "$key" = "None" ] && continue
        MOD_EPOCH=$(date -u -d "$modified" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%S" "${modified%%.*}" +%s 2>/dev/null || echo "")
        if [ -n "$MOD_EPOCH" ] && [ "$MOD_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
          aws s3 rm "s3://${R2_BUCKET}/${key}" --endpoint-url "$R2_ENDPOINT" || true
        fi
      done
fi

find "$BACKUPS_DIR" -name 'recruitai-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
echo "[offsite] done"
