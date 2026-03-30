#!/bin/bash

set -e

# ==== REQUIRED: paste your real keys here ====
GAIIA_LYMEFIBER_KEY="$GAIIA_LYMEFIBER_KEY"
GAIIA_DVFIBER_KEY="$GAIIA_DVFIBER_KEY"

# ==== REQUIRED: paste your real base URL here ====
# Example placeholder:
BASE_URL="https://api.gaiia.io/v1"

OUTDIR="$HOME/gaiia_ingest/discovery"
mkdir -p "$OUTDIR"

echo "=== Gaiia API Discovery ==="
echo "Base URL: $BASE_URL"
echo "Output folder: $OUTDIR"
echo

# Function to test an endpoint
test_endpoint() {
  local name="$1"
  local url="$2"
  local key="$3"

  echo "Testing endpoint: $name"
  echo "URL: $url"

  curl --silent \
    -H "Authorization: Bearer $key" \
    "$url" \
    | jq . > "${OUTDIR}/${name}.json" || true

  echo "Saved: ${OUTDIR}/${name}.json"
  echo
}

# ==== COMMON GAIIA ENDPOINTS TO PROBE ====
ENDPOINTS=(
  "customers"
  "plans"
  "subscriptions"
  "invoices"
  "payments"
  "addresses"
  "services"
  "tickets"
  "accounts"
  "users"
  "organizations"
  "products"
  "inventory"
  "network"
  "usage"
  "events"
  "webhooks"
)

# ==== RUN DISCOVERY FOR BOTH TENANTS ====
for ep in "${ENDPOINTS[@]}"; do
  test_endpoint "lymefiber_${ep}" "${BASE_URL}/${ep}" "$GAIIA_LYMEFIBER_KEY"
  test_endpoint "dvfiber_${ep}" "${BASE_URL}/${ep}" "$GAIIA_DVFIBER_KEY"
done

echo "=== Discovery complete ==="
echo "Inspect JSON files in: $OUTDIR"
