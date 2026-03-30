#!/bin/bash

set -e

KEY="$GAIIA_LYMEFIBER_KEY"
OUT="$HOME/gaiia_ingest/discovery_baseurl"
mkdir -p "$OUT"

echo "=== Gaiia Base URL Discovery ==="

CANDIDATES=(
  "https://api.gaiia.io/v1"
  "https://api.us.gaiia.io/v1"
  "https://api.ca.gaiia.io/v1"
  "https://api.na.gaiia.io/v1"
  "https://api.prod.gaiia.io/v1"
  "https://api.production.gaiia.io/v1"
  "https://api.app.gaiia.io/v1"
  "https://console.gaiia.io/api/v1"
  "https://gaiia.io/api/v1"
  "https://app.gaiia.io/api/v1"
  "https://api.gaiia.app/v1"
  "https://gaiia.app/api/v1"
  "https://lymefiber.gaiia.app/api/v1"
  "https://dvfiber.gaiia.app/api/v1"
  "https://lymefiber.gaiia.io/api/v1"
  "https://dvfiber.gaiia.io/api/v1"
  "https://api.gaiia.io/graphql"
  "https://app.gaiia.io/graphql"
)

for base in "${CANDIDATES[@]}"; do
  echo "Testing: $base/customers"
  curl -s -H "Authorization: Bearer $KEY" "$base/customers" | jq . > "$OUT/$(echo $base | sed 's/[^a-zA-Z0-9]/_/g').json"
done

echo "=== Base URL discovery complete ==="
echo "Check: $OUT"
