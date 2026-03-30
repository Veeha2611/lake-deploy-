#!/bin/bash

PLAN_ID=2757
OUTFILE="$HOME/vetro_ingest/raw/plan_${PLAN_ID}.json"
REDACTED

echo "Fetching features for plan $PLAN_ID..."

curl --silent \
  --header "REDACTED \
  "https://api.vetro.io/v3/features/query?plan_ids[]=${PLAN_ID}&limit=50000&offset=0" \
  > "$OUTFILE"

echo "Saved to $OUTFILE"
