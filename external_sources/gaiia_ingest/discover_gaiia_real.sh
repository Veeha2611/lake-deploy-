#!/bin/bash

set -e

# ============================================================
#  Gaiia REAL API Discovery Script
#  Uses tenant paths from your login URLs:
#     https://app.gaiia.com/lymefiber
#     https://app.gaiia.com/dvfiber
# ============================================================

# These must already be exported in your shell:
#   export GAIIA_LYMEFIBER_KEY="..."
#   export GAIIA_DVFIBER_KEY="..."

KEY_L="$GAIIA_LYMEFIBER_KEY"
KEY_D="$GAIIA_DVFIBER_KEY"

OUT="$HOME/gaiia_ingest/discovery_real"
mkdir -p "$OUT"

echo "=== Discovering REAL Gaiia API ==="
echo "Output folder: $OUT"
echo

TENANTS=("lymefiber" "dvfiber")
PATHS=(
  "api"
  "api/v1"
  "v1"
  "rest"
  "rest/v1"
  "graphql"
)

for tenant in "${TENANTS[@]}"; do
  for path in "${PATHS[@]}"; do

    # Build the URL
    URL="https://app.gaiia.com/${tenant}/${path}/customers"

    # Sanitize filename: replace / with _
    SAFE_PATH=$(echo "${path}" | tr '/' '_')
    OUTFILE="${OUT}/${tenant}_${SAFE_PATH}.json"

    echo "Testing: $URL"

    # Use the correct key per tenant
    if [ "$tenant" = "lymefiber" ]; then
      KEY="$KEY_L"
    else
      KEY="$KEY_D"
    fi

    # Perform request and save first 50 lines
    curl -s \
      -H "Authorization: Bearer $KEY" \
      "$URL" \
      | head -n 50 > "$OUTFILE"

  done
done

echo
echo "=== Discovery complete ==="
echo "Check results in: $OUT"
