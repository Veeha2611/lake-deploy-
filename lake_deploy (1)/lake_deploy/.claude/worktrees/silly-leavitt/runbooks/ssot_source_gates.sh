#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
OUT="${OUT:-/Users/patch/lake_deploy/ssot_audit/source_gates_$(date +%F).log}"

# Freshness gating:
# - Uses mac_native_audit/recon_config.json staleness_sla_hours when present (defaults to 48h).
# - Enforced by default to prevent "static snapshot" false positives.
SLA_HOURS="${SSOT_STALENESS_SLA_HOURS:-}"
ENFORCE_STALENESS="${SSOT_ENFORCE_STALENESS:-1}"
if [ -z "$SLA_HOURS" ]; then
  SLA_HOURS="$(python3 - <<'PY' 2>/dev/null || echo 48
import json
from pathlib import Path
p = Path('/Users/patch/lake_deploy/mac_native_audit/recon_config.json')
try:
    data = json.loads(p.read_text(encoding='utf-8'))
    sla = data.get('staleness_sla_hours', 48)
    sla = int(sla) if sla else 48
    print(sla)
except Exception:
    print(48)
PY
  )"
fi

fail() {
  echo "FAIL: $*" | tee -a "$OUT" >&2
  exit 2
}

age_hours_ymd() {
  local dt="$1"
  python3 - <<'PY' "$dt"
from datetime import datetime, timezone
import sys
dt = sys.argv[1]
d = datetime.strptime(dt, "%Y-%m-%d").replace(tzinfo=timezone.utc)
now = datetime.now(timezone.utc)
print(int((now - d).total_seconds() // 3600))
PY
}

check_freshness() {
  local label="$1" dt="$2" required="${3:-1}"
  local age
  age="$(age_hours_ymd "$dt" 2>/dev/null || echo 999999)"
  if [ "$age" -gt "$SLA_HOURS" ]; then
    if [ "$required" -eq 1 ] && [ "$ENFORCE_STALENESS" -eq 1 ]; then
      fail "${label} stale dt=${dt} age_hours=${age} > sla_hours=${SLA_HOURS}"
    fi
    echo "WARN: ${label} stale dt=${dt} age_hours=${age} > sla_hours=${SLA_HOURS}" | tee -a "$OUT"
  fi
}

latest_tenant_prefixes() {
  local prefix="$1"
  aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk '$0 ~ /^tenant=/ {print $0}'
}

latest_plan_prefixes() {
  local prefix="$1"
  aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk '$0 ~ /^plan_id=/ {print $0}'
}

latest_dt_prefix() {
  local prefix="$1"
  aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk '$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ {print $0}' \
    | sort \
    | tail -n 1
}

latest_dt_from_dt_prefix() {
  local prefix="$1"
  aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk -F= '$1=="dt" {print $2}' \
    | awk '$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ {print $0}' \
    | sort \
    | tail -n 1
}

latest_ymd_prefix() {
  local prefix="$1"
  local year month day
  year=$(aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' | sed 's:/$::' \
    | awk '$0 ~ /^[0-9]{4}$/ {print $0}' | sort | tail -n 1)
  [ -z "$year" ] && return 0
  month=$(aws s3 ls "${S3_BUCKET}/${prefix}${year}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' | sed 's:/$::' \
    | awk '$0 ~ /^[0-9]{2}$/ {print $0}' | sort | tail -n 1)
  [ -z "$month" ] && return 0
  day=$(aws s3 ls "${S3_BUCKET}/${prefix}${year}/${month}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' | sed 's:/$::' \
    | awk '$0 ~ /^[0-9]{2}$/ {print $0}' | sort | tail -n 1)
  [ -z "$day" ] && return 0
  echo "${year}-${month}-${day}"
}

latest_ymd_size() {
  local prefix="$1" dt="$2"
  local year month day
  year=${dt%%-*}
  month=${dt#*-}; month=${month%%-*}
  day=${dt##*-}
  aws s3 ls "${S3_BUCKET}/${prefix}${year}/${month}/${day}/" --region "$AWS_REGION" \
    | awk 'BEGIN{sum=0} {sum+=$3} END{print sum+0}'
}

check_appflow_prefix() {
  local label="$1" prefix="$2"
  local dt
  dt=$(latest_ymd_prefix "$prefix" 2>/dev/null || true)
  if [ -z "$dt" ]; then
    fail "${label} missing date partitions at ${prefix}"
  fi
  local size
  size=$(latest_ymd_size "$prefix" "$dt")
  if [ "$size" -le 0 ]; then
    fail "${label} latest dt ${dt} at ${prefix} is zero bytes"
  fi
  check_freshness "$label" "$dt" 1
  echo "OK: ${label} latest_dt=${dt} bytes=${size}" | tee -a "$OUT"
}

latest_dt_size() {
  local prefix="$1" dt="$2"
  aws s3 ls "${S3_BUCKET}/${prefix}${dt}/" --region "$AWS_REGION" \
    | awk 'BEGIN{sum=0} {sum+=$3} END{print sum+0}'
}

check_object() {
  local label="$1" key="$2"
  local size
  size=$(aws s3 ls "${S3_BUCKET}/${key}" --region "$AWS_REGION" | awk '{print $3}' | tail -n 1)
  if [ -z "$size" ] || [ "$size" -le 0 ]; then
    fail "${label} missing or zero bytes at ${key}"
  fi
  echo "OK: ${label} bytes=${size}" | tee -a "$OUT"
}

check_prefix() {
  local label="$1" prefix="$2"
  local dt
  dt=$(latest_dt_prefix "$prefix")
  if [ -z "$dt" ]; then
    fail "${label} missing or no dt partitions at ${prefix}"
  fi
  local size
  size=$(latest_dt_size "$prefix" "$dt")
  if [ "$size" -le 0 ]; then
    fail "${label} latest dt ${dt} at ${prefix} is zero bytes"
  fi
  check_freshness "$label" "$dt" 1
  echo "OK: ${label} latest_dt=${dt} bytes=${size}" | tee -a "$OUT"
}

check_dt_prefix() {
  local label="$1" prefix="$2"
  local required="${3:-1}"
  local dt
  dt=$(latest_dt_from_dt_prefix "$prefix" 2>/dev/null || true)
  if [ -z "$dt" ]; then
    if [ "$required" -eq 1 ]; then
      fail "${label} missing dt partitions at ${prefix}"
    fi
    echo "WARN: ${label} missing dt partitions at ${prefix} (optional)" | tee -a "$OUT"
    return 0
  fi
  local size
  size=$(latest_dt_size "${prefix}dt=" "$dt")
  if [ "$size" -le 0 ]; then
    if [ "$required" -eq 1 ]; then
      fail "${label} latest dt ${dt} at ${prefix}dt= is zero bytes"
    fi
    echo "WARN: ${label} latest dt ${dt} at ${prefix}dt= is zero bytes (optional)" | tee -a "$OUT"
    return 0
  fi
  check_freshness "$label" "$dt" "$required"
  echo "OK: ${label} latest_dt=${dt} bytes=${size}" | tee -a "$OUT"
}

check_tenant_partitions() {
  local label="$1" prefix="$2"
  local required="${3:-1}"
  local tenants
  tenants=$(latest_tenant_prefixes "$prefix")
  if [ -z "$tenants" ]; then
    fail "${label} missing tenant partitions at ${prefix}"
  fi
  while read -r tenant; do
    [ -z "$tenant" ] && continue
    local tenant_prefix="${prefix}${tenant}/"
    local dt
    dt=$(latest_dt_from_dt_prefix "${tenant_prefix}" 2>/dev/null || true)
    if [ -z "$dt" ]; then
      fail "${label} missing dt partitions at ${tenant_prefix}"
    fi
    local size
    size=$(latest_dt_size "${tenant_prefix}dt=" "$dt")
    if [ "$size" -le 0 ]; then
      fail "${label} tenant ${tenant} latest dt ${dt} at ${tenant_prefix}dt= is zero bytes"
    fi
    check_freshness "${label} tenant=${tenant}" "$dt" "$required"
    echo "OK: ${label} tenant=${tenant} latest_dt=${dt} bytes=${size}" | tee -a "$OUT"
  done <<< "$tenants"
}

check_plan_partitions() {
  local label="$1" prefix="$2"
  local required="${3:-0}"
  local sample_n="${SSOT_PLAN_PARTITION_SAMPLE_N:-10}"
  local plans
  plans=$(latest_plan_prefixes "$prefix")
  if [ -z "$plans" ]; then
    fail "${label} missing plan_id partitions at ${prefix}"
  fi

  # Some sources (e.g. Vetro) can have hundreds/thousands of plan_id partitions.
  # When the check is optional (required=0), do not iterate every partition:
  # it is slow and noisy, and freshness is better validated via the SSOT audits.
  if [ "$required" -eq 0 ]; then
    local total
    total="$(printf '%s\n' "$plans" | wc -l | tr -d ' ')"
    if [ "$total" -gt "$sample_n" ]; then
      echo "INFO: ${label} optional; sampling ${sample_n}/${total} plan_id partitions (set SSOT_PLAN_PARTITION_SAMPLE_N to adjust)" | tee -a "$OUT"
      plans="$(printf '%s\n' "$plans" | head -n "$sample_n")"
    fi
  fi

  while read -r plan; do
    [ -z "$plan" ] && continue
    local plan_prefix="${prefix}${plan}/"
    local dt
    dt=$(latest_dt_from_dt_prefix "${plan_prefix}" 2>/dev/null || true)
    if [ -z "$dt" ]; then
      fail "${label} missing dt partitions at ${plan_prefix}"
    fi
    local size
    size=$(latest_dt_size "${plan_prefix}dt=" "$dt")
    if [ "$size" -le 0 ]; then
      fail "${label} plan ${plan} latest dt ${dt} at ${plan_prefix}dt= is zero bytes"
    fi
    check_freshness "${label} plan=${plan}" "$dt" "$required"
    echo "OK: ${label} plan=${plan} latest_dt=${dt} bytes=${size}" | tee -a "$OUT"
  done <<< "$plans"
}

printf 'SSOT source gates start: %s\n' "$(date -u +%FT%TZ)" | tee "$OUT"

# Gaiia
check_tenant_partitions "gaiia graphql accounts" "raw/gaiia/graphql/accounts/" 1
check_tenant_partitions "gaiia graphql billingSubscriptions" "raw/gaiia/graphql/billingSubscriptions/" 1
check_tenant_partitions "gaiia graphql products" "raw/gaiia/graphql/products/" 1

# Salesforce (AppFlow canonical)
check_appflow_prefix "salesforce appflow account" "raw/salesforce_prod_appflow/account/salesforce-prod-account-to-s3/"
check_appflow_prefix "salesforce appflow contract" "raw/salesforce_prod_appflow/contract/salesforce-prod-contract-to-s3/"
check_appflow_prefix "salesforce appflow opportunity" "raw/salesforce_prod_appflow/opportunity/salesforce-prod-opportunity-to-s3/"

# Platt
check_dt_prefix "platt billing" "raw/platt/billing/" 1
# services_fiber is not SSOT-critical for revenue; keep as optional signal to avoid blocking on legacy extracts.
check_dt_prefix "platt services_fiber" "raw/platt/services_fiber/" 0

# Vetro
check_plan_partitions "vetro plans" "raw/vetro/" 0
check_dt_prefix "vetro manual plan exports" "raw/vetro_plans/manual_exports/" 0
check_dt_prefix "vetro layers" "raw/vetro_layers/" 0
check_object "vetro plan index" "vetro_export_state/plan_index.json"
check_object "vetro backfill queue" "vetro_export_state/backfill_queue.json"

printf 'SSOT source gates PASS\n' | tee -a "$OUT"
