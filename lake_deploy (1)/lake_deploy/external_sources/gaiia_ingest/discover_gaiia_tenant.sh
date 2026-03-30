#!/bin/bash

set -e

KEY="$GAIIA_LYMEFIBER_KEY"
BASE="https://api.gaiia.io/v1/customers"
OUT="$HOME/gaiia_ingest/discovery_tenant"
mkdir -p "$OUT"

echo "=== Testing tenant scoping methods ==="

# 1. No headers (baseline)
curl -s -H "Authorization: Bearer $KEY" "$BASE" | jq . > "$OUT/no_header.json"

# 2. Common tenant headers
for h in X-Tenant-ID X-Organization-ID X-Company-ID X-Project-ID X-Account-ID; do
  echo "Testing header: $h"
  curl -s -H "Authorization: Bearer $KEY" -H "$h: lymefiber" "$BASE" | jq . > "$OUT/header_${h}.json"
done

# 3. Query parameters
for q in tenant organization company project account; do
  echo "Testing query param: $q"
  curl -s -H "Authorization: Bearer $KEY" "$BASE?$q=lymefiber" | jq . > "$OUT/query_${q}.json"
done

# 4. Path prefixes
for p in tenants organizations companies projects accounts; do
  echo "Testing path prefix: $p"
  curl -s -H "Authorization: Bearer $KEY" "https://api.gaiia.io/v1/$p/lymefiber/customers" | jq . > "$OUT/path_${p}.json"
done

echo "=== Tenant discovery complete ==="
echo "Check: $OUT"
