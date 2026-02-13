#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: platt_vpn_preflight.sh [--open]"
  echo "Checks connectivity to Platt DB host/port (VPN required)."
  echo "Options:"
  echo "  --open   Open FortiClient if connectivity fails."
  exit 0
fi

OPEN_FORTI=0
if [[ "${1:-}" == "--open" ]]; then
  OPEN_FORTI=1
fi

REGION="${AWS_REGION:-us-east-2}"
SECRET_NAME="${PLATT_SECRET_NAME:-platt/credentials}"

secret_host=""
secret_port=""

if [[ -z "${PLATT_DB_HOST:-}" || -z "${PLATT_DB_PORT:-}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    secret_json=$(aws secretsmanager get-secret-value \
      --secret-id "$SECRET_NAME" \
      --region "$REGION" \
      --query SecretString \
      --output text 2>/dev/null || true)
    if [[ -n "$secret_json" && "$secret_json" != "None" ]]; then
      read -r secret_host secret_port < <(python3 - <<'PY' <<<"$secret_json"
import json
import sys

raw = sys.stdin.read().strip()
try:
    data = json.loads(raw) if raw else {}
except Exception:
    data = {}

def pick(keys):
    for key in keys:
        val = data.get(key)
        if val:
            return str(val)
    return ""

host = pick(["PLATT_DB_HOST", "host", "PLATT_HOST"])
port = pick(["PLATT_DB_PORT", "port"])
print(f"{host}\t{port}")
PY
      )
    fi
  fi
fi

HOST="${PLATT_DB_HOST:-${secret_host:-}}"
PORT="${PLATT_DB_PORT:-${secret_port:-1433}}"

if [[ -z "$HOST" ]]; then
  echo "PLATT_DB_HOST not set and no host found in $SECRET_NAME." >&2
  exit 2
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Invalid port: $PORT" >&2
  exit 2
fi

echo "Checking Platt DB connectivity to ${HOST}:${PORT}..."

check_ok=0
if command -v nc >/dev/null 2>&1; then
  if nc -vz -w 3 "$HOST" "$PORT" >/dev/null 2>&1; then
    check_ok=1
  fi
else
  if python3 - <<'PY' "$HOST" "$PORT" >/dev/null 2>&1; then
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
try:
    sock = socket.create_connection((host, port), timeout=3)
    sock.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
  then
    check_ok=1
  fi
fi

if [[ "$check_ok" -eq 1 ]]; then
  echo "VPN connectivity: OK"
  exit 0
fi

echo "VPN connectivity: FAILED"
if [[ "$OPEN_FORTI" -eq 1 ]]; then
  if command -v open >/dev/null 2>&1; then
    open -a "FortiClient" >/dev/null 2>&1 || true
    echo "Opened FortiClient. Complete VPN login/MFA, then re-run this check."
  fi
else
  echo "Open FortiClient, complete VPN login/MFA, then re-run this check."
fi
exit 1
