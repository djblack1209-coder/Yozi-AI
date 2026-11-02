#!/usr/bin/env bash
set -euo pipefail

# Match a credential prefix, not the suffix of a word such as a task-… path.
PATTERN='(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AKID[0-9A-Za-z]{16,}|AIza[0-9A-Za-z_-]{30,}|hf_[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|laf_[A-Za-z0-9]{20,}|BSAT[0-9A-Za-z_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
AUDIT_FILE=$(mktemp "${TMPDIR:-/tmp}/yozi-ai-secret-audit.XXXXXX")
SCAN_LIST=$(mktemp "${TMPDIR:-/tmp}/yozi-ai-secret-scan-list.XXXXXX")
MAX_SCAN_BYTES="${SECRET_AUDIT_MAX_SCAN_BYTES:-2097152}"
trap 'rm -f "$AUDIT_FILE" "$SCAN_LIST"' EXIT

skipped_count=0
while IFS= read -r -d '' tracked_file; do
  if [[ ! -f "$tracked_file" ]]; then
    continue
  fi

  file_size=$(wc -c <"$tracked_file" | tr -d '[:space:]')
  if [[ "$file_size" =~ ^[0-9]+$ ]] && (( file_size > MAX_SCAN_BYTES )); then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  if [[ -s "$tracked_file" ]] && ! LC_ALL=C grep -Iq . "$tracked_file"; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  printf '%s\0' "$tracked_file" >>"$SCAN_LIST"
done < <(git ls-files -z)

grep_status=1
if [[ -s "$SCAN_LIST" ]]; then
  while IFS= read -r -d '' scan_file; do
    set +e
    LC_ALL=C grep -nE -H "$PATTERN" "$scan_file" >>"$AUDIT_FILE"
    file_grep_status=$?
    set -e

    if [[ "$file_grep_status" -eq 0 ]]; then
      grep_status=0
    elif [[ "$file_grep_status" -ne 1 ]]; then
      echo "[secret-audit] grep failed for ${scan_file} with exit code ${file_grep_status}" >&2
      exit "$file_grep_status"
    fi
  done <"$SCAN_LIST"
fi

if [[ "$grep_status" -eq 0 ]]; then
  if [[ "$skipped_count" -gt 0 ]]; then
    echo "[secret-audit] skipped ${skipped_count} tracked files over ${MAX_SCAN_BYTES} bytes or detected as binary"
  fi
  echo "[secret-audit] potential secrets found in tracked files"
  sed -E \
    -e 's/sk-[A-Za-z0-9_-]{8,}/sk-***REDACTED***/g' \
    -e 's/github_pat_[A-Za-z0-9_]{8,}/github_pat_***REDACTED***/g' \
    -e 's/gh[pousr]_[A-Za-z0-9_]{8,}/gh*_***REDACTED***/g' \
    -e 's/AKIA[0-9A-Z]{8,}/AKIA***REDACTED***/g' \
    -e 's/AKID[0-9A-Za-z]{8,}/AKID***REDACTED***/g' \
    -e 's/AIza[0-9A-Za-z_-]{8,}/AIza***REDACTED***/g' \
    -e 's/hf_[A-Za-z0-9]{8,}/hf_***REDACTED***/g' \
    -e 's/xox[baprs]-[0-9A-Za-z-]{8,}/xox*-***REDACTED***/g' \
    -e 's/laf_[A-Za-z0-9]{8,}/laf_***REDACTED***/g' \
    -e 's/BSAT[0-9A-Za-z_\-]{8,}/BSAT***REDACTED***/g' \
    "$AUDIT_FILE"
  exit 1
fi

if [[ "$grep_status" -ne 1 ]]; then
  echo "[secret-audit] git grep failed with exit code ${grep_status}" >&2
  exit "$grep_status"
fi

if [[ "$skipped_count" -gt 0 ]]; then
  echo "[secret-audit] skipped ${skipped_count} tracked files over ${MAX_SCAN_BYTES} bytes or detected as binary"
fi
echo "[secret-audit] no tracked secret patterns found"
