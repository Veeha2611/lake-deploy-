#!/bin/bash

# === Gaiia GraphQL Test Script ===

API_URL="https://bwo96zifx9.execute-api.us-east-1.amazonaws.com/production/api"

# Export these before running:
# export GAIIA_JWT="..."
# export GAIIA_TENANT="..."

curl -s "$API_URL" \
  -H "Authorization: $GAIIA_JWT" \
  -H "x-tenant-id: $GAIIA_TENANT" \
  -H "Content-Type: application/json" \
  --data '{"query":"query { __typename }"}' \
  | jq .
