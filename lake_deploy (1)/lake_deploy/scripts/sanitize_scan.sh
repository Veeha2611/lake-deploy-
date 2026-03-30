#!/usr/bin/env bash
set -euo pipefail

# Sanitization scan: prevents external tool branding and non-product authoring references from landing in the repo.
# - Scans tracked files only.
# - Supports scanning the git index (staged snapshot) to avoid local dirty-tree false positives.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BANNED_TERMS_FILE="${BANNED_TERMS_FILE:-$ROOT_DIR/config/sanitization/banned_terms.txt}"
MODE="${1:-}"

patterns_file="$(mktemp)"
if [[ -f "$BANNED_TERMS_FILE" ]]; then
  grep -v -E '^[[:space:]]*(#|$)' "$BANNED_TERMS_FILE" >"$patterns_file"
else
  while IFS= read -r encoded; do
    [[ -z "$encoded" ]] && continue
    printf '%s' "$encoded" | base64 --decode >>"$patterns_file"
    printf '\n' >>"$patterns_file"
  done <<'EOF'
Y29kZXg=
Y2hhdGdwdA==
b3BlbmFp
Y29waWxvdA==
Y28tcGlsb3Q=
Z2VtaW5p
YmFyZA==
cGVycGxleGl0eQ==
YWkgYXNzaXN0ZWQ=
YWktYXNzaXN0ZWQ=
EOF
fi

scan_path="$ROOT_DIR"
cleanup_tmp="false"
tmp_dir=""

if [[ "$MODE" == "--staged" ]]; then
  tmp_dir="$(mktemp -d)"
  cleanup_tmp="true"
  scan_path="$tmp_dir"
  # Export the index snapshot to a temp dir so we scan what would be committed.
  git -C "$ROOT_DIR" checkout-index -a -f --prefix "$tmp_dir/" >/dev/null
fi

cleanup() {
  if [[ "$cleanup_tmp" == "true" && -n "$tmp_dir" ]]; then
    rm -rf "$tmp_dir"
  fi
  rm -f "$patterns_file"
}
trap cleanup EXIT

fail=0

while IFS= read -r relpath; do
  [[ -z "$relpath" ]] && continue

  # Don't scan the banned-terms list itself (it intentionally contains the terms).
  if [[ "$relpath" == "config/sanitization/banned_terms.txt" ]]; then
    continue
  fi

  # Don't scan this scanner script (it intentionally embeds the default term list).
  if [[ "$relpath" == "scripts/sanitize_scan.sh" ]]; then
    continue
  fi

  # Skip obvious binary/static assets.
  case "$relpath" in
    *.png|*.jpg|*.jpeg|*.gif|*.pdf|*.zip|*.gz|*.tgz|*.parquet|*.avro|*.jar|*.woff|*.woff2|*.ttf)
      continue
      ;;
  esac

  f="$scan_path/$relpath"
  [[ -f "$f" ]] || continue

  # Skip non-text files (best-effort).
  if ! grep -Iq . "$f" 2>/dev/null; then
    continue
  fi

  if grep -n -i -F -f "$patterns_file" "$f" >/dev/null 2>&1; then
    echo "BANNED TERMS FOUND: $relpath" >&2
    grep -n -i -F -f "$patterns_file" "$f" | head -n 50 >&2
    echo >&2
    fail=1
  fi
done < <(git -C "$ROOT_DIR" ls-files)

if [[ "$fail" -ne 0 ]]; then
  echo "Sanitization scan: FAIL" >&2
  exit 1
fi

echo "Sanitization scan: PASS"
