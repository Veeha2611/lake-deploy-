#!/usr/bin/env bash
set -euo pipefail

# Sync canonical repo-level configs into the MAC AI Console runtime package.
# This is a developer convenience script; it does not run automatically.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SRC_QUERY_ENGINE="$ROOT_DIR/config/query_engine"
SRC_AI="$ROOT_DIR/config/ai"

DEST_META="$ROOT_DIR/apps/mac-app-v2/lambda/query-broker/metadata"

mkdir -p "$DEST_META"

cp -f "$SRC_QUERY_ENGINE/query_plan_schema.json" "$DEST_META/query_plan_schema.json"
cp -f "$SRC_QUERY_ENGINE/allowed_sources.json" "$DEST_META/allowed_sources.json"
cp -f "$SRC_QUERY_ENGINE/join_map.json" "$DEST_META/join_map.json"
cp -f "$SRC_QUERY_ENGINE/action_intent_schema.json" "$DEST_META/action_intent_schema.json"
cp -f "$SRC_QUERY_ENGINE/report_spec_schema.json" "$DEST_META/report_spec_schema.json"
cp -f "$SRC_QUERY_ENGINE/metric_definitions.json" "$DEST_META/metric_definitions.json"

cp -f "$SRC_AI/planner_system_instructions.txt" "$DEST_META/planner_system_instructions.txt"

echo "Synced metadata to: $DEST_META"
