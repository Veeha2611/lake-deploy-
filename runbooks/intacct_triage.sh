#!/usr/bin/env bash
# intacct_triage.sh (macOS/zsh friendly)
# - continues on failures (no set -e)
# - masks secrets
# - writes everything under ~/intacct_triage/<YYYY-MM-DD>/

set -u
export LC_ALL=C

DATE_STR="$(date +%F)"
ROOT="$HOME/intacct_triage/${DATE_STR}"
mkdir -p "$ROOT"/{env,aws,intacct,glentry,cron,logs}

LOG="$ROOT/logs/triage_run.log"
STEPLOG="$ROOT/logs/steps.log"

log() { printf "%s %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >/dev/null; }
step() { printf "%s | %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$STEPLOG"; }

run_step() {
  local name="$1"; shift
  local out="$1"; shift
  log "==> STEP: $name"
  step "START $name"
  # run command, capture output, continue regardless
  ( "$@" ) >"$out" 2>&1
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    step "OK    $name"
    log "    OK: $name"
  else
    step "FAIL  $name rc=$rc"
    log "    FAIL: $name (rc=$rc) - see $out"
  fi
  return 0
}

write_env_snapshot_safe() {
  {
    echo "DATE_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "SHELL=${SHELL:-}"
    echo "ZSH_VERSION=${ZSH_VERSION:-}"
    echo "PWD=$(pwd)"
    echo "WHOAMI=$(whoami)"
    echo "HOSTNAME=$(hostname)"
    echo "PYTHON=$(command -v python3 || true)"
    echo "PYTHON_VERSION=$(python3 -V 2>/dev/null || true)"
    echo "VIRTUAL_ENV=${VIRTUAL_ENV:-}"
    echo "AWS_PROFILE=${AWS_PROFILE:-}"
    echo "AWS_REGION=${AWS_REGION:-}"
    echo "INTACCT_ENDPOINT_URL=${INTACCT_ENDPOINT_URL:-}"
    echo "INTACCT_SENDER_ID=${INTACCT_SENDER_ID:-}"
    echo "INTACCT_COMPANY_ID=${INTACCT_COMPANY_ID:-}"
    echo "INTACCT_WS_USER_ID=${INTACCT_WS_USER_ID:-}"
    [[ -n "${INTACCT_SENDER_REDACTED ]] && echo "INTACCT_SENDER_REDACTED || echo "INTACCT_SENDER_REDACTED
    [[ -n "${INTACCT_WS_USER_REDACTED ]] && echo "INTACCT_WS_USER_REDACTED || echo "INTACCT_WS_USER_REDACTED
  } | sed 's/[[:cntrl:]]//g'
}

check_intacct_env_presence() {
  local missing=0
  for v in INTACCT_ENDPOINT_URL INTACCT_SENDER_ID INTACCT_COMPANY_ID INTACCT_WS_USER_ID; do
    if [[ -z "${!v:-}" ]]; then
      echo "MISSING: $v"
      missing=$((missing+1))
    else
      echo "PRESENT: $v"
    fi
  done
  if [[ -n "${INTACCT_SENDER_REDACTED ]]; then echo "PRESENT: INTACCT_SENDER_PASSWORD (masked)"; else echo "MISSING: INTACCT_SENDER_PASSWORD"; missing=$((missing+1)); fi
  if [[ -n "${INTACCT_WS_USER_REDACTED ]]; then echo "PRESENT: INTACCT_WS_USER_PASSWORD (masked)"; else echo "MISSING: INTACCT_WS_USER_PASSWORD"; missing=$((missing+1)); fi
  echo "missing_count=$missing"
  return 0
}

capture_cron_evidence() {
  echo "# crontab -l"
  crontab -l 2>&1 || true
  echo
  echo "# macOS logs (best effort)"
  for f in /var/log/system.log /var/log/cron /var/log/cron.log; do
    if [[ -f "$f" ]]; then
      echo "## tail -n 200 $f"
      tail -n 200 "$f" 2>/dev/null || true
      echo
    fi
  done
  echo "# launchctl list (filtered)"
  launchctl list 2>/dev/null | egrep -i 'cron|intacct|ingest|s3' || true
  return 0
}

log "Triage bundle: $ROOT"
log "Writing log: $LOG"

# STEP 1: env snapshot safe
run_step "env_snapshot_safe" "$ROOT/env/env_snapshot_safe.txt" bash -lc 'true' || true
write_env_snapshot_safe > "$ROOT/env/env_snapshot_safe.txt" 2>&1 || true
step "DONE  env_snapshot_safe"

# STEP 2: AWS identity
run_step "aws_sts_get_caller_identity" "$ROOT/aws/aws_sts_get_caller_identity.json" aws sts get-caller-identity || true

# STEP 3: Intacct env presence
check_intacct_env_presence > "$ROOT/intacct/intacct_env_presence.txt" 2>&1 || true
step "DONE  intacct_env_presence"

# STEP 4: Intacct client import/init smoke (adjust module name if needed)
python3 - <<'PY' > "$ROOT/intacct/intacct_client_init_smoke.txt" 2>&1 || true
import sys
try:
    from intacct_client import IntacctClient
    c = IntacctClient()
    print("INIT_OK", type(c).__name__)
except Exception as e:
    print("SMOKE_FAIL", repr(e))
    sys.exit(0)
PY
step "DONE  intacct_client_init_smoke"

# STEP 5: GLENTRY debug (pagesize=10 timeout=180)
REPO_DIR="${TRIAGE_REPO_DIR:-$(pwd)}"
mkdir -p "$ROOT/glentry/glentry_debug_run"
(
  cd "$REPO_DIR" || exit 0
  if [[ -f "./glentry_debug.py" ]]; then
    python3 ./glentry_debug.py --start-date 2025-12-22 --pagesize 10 --timeout 180 --sleep 0.5 --out-dir "$ROOT/glentry/glentry_debug_run" \
      >"$ROOT/glentry/glentry_debug_stdout.txt" 2>"$ROOT/glentry/glentry_debug_stderr.txt" || true
  else
    echo "glentry_debug.py not found in $REPO_DIR" >"$ROOT/glentry/glentry_debug_stdout.txt"
  fi
) || true
step "DONE  glentry_debug_py"

# STEP 6: GLENTRY ingest attempt for run-date
RUN_DATE="${TRIAGE_RUN_DATE:-$DATE_STR}"
(
  cd "$REPO_DIR" || exit 0
  if [[ -f "./intacct_to_s3_glentry.py" ]]; then
    python3 ./intacct_to_s3_glentry.py --run-date "$RUN_DATE" \
      >"$ROOT/glentry/glentry_ingest_stdout.txt" 2>"$ROOT/glentry/glentry_ingest_stderr.txt" || true
  else
    echo "intacct_to_s3_glentry.py not found in $REPO_DIR" >"$ROOT/glentry/glentry_ingest_stdout.txt"
  fi
) || true
step "DONE  glentry_ingest_attempt"

# STEP 7: cron evidence
capture_cron_evidence > "$ROOT/cron/cron_evidence.txt" 2>&1 || true
step "DONE  cron_evidence"

log "Triage complete. Bundle: $ROOT"
echo "$ROOT"
