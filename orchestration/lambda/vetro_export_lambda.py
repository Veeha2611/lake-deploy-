import json
import logging
import os
import random
import time
import zipfile
from datetime import datetime, timezone, timedelta
from io import BytesIO
import socket
from urllib.parse import urlparse

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables (passed from CloudFormation)
PLAN_IDS = os.getenv('PlanIds') or os.getenv('PLAN_IDS', '')
STATE_BUCKET = os.getenv('StateBucket') or os.getenv('STATE_BUCKET')
STATE_KEY = os.getenv('StateKey') or os.getenv('STATE_KEY')
EXPORT_BUCKET = os.getenv('ExportBucket') or os.getenv('EXPORT_BUCKET')
EXPORT_PREFIX = os.getenv('ExportPrefix') or os.getenv('EXPORT_PREFIX', 'raw/vetro')
VETRO_TOKEN_SECRET = os.getenv('VetroTokenSecret') or os.getenv('VETRO_TOKEN_SECRET')
API_BASE_URL = os.getenv('VetroApiUrl') or os.getenv('VETRO_API_URL', 'https://api.vetro.io/v3/export/plan')
MIN_ZIP_BYTES = int(os.getenv('MinZipBytes') or os.getenv('MIN_ZIP_BYTES', '10240'))
MAX_RETRIES = int(os.getenv('MaxRetries') or os.getenv('MAX_RETRIES', '6'))
BACKOFF_BASE_SECONDS = float(os.getenv('BackoffBaseSeconds') or os.getenv('BACKOFF_BASE_SECONDS', '2.0'))
BACKOFF_MAX_SECONDS = float(os.getenv('BackoffMaxSeconds') or os.getenv('BACKOFF_MAX_SECONDS', '60.0'))
REQUEST_SPACING_SECONDS = float(os.getenv('RequestSpacingSeconds') or os.getenv('REQUEST_SPACING_SECONDS', '1.0'))
MAX_BACKOFF_WAIT_SECONDS = float(os.getenv('MaxBackoffWaitSeconds') or os.getenv('MAX_BACKOFF_WAIT_SECONDS', '30.0'))
PROOF_MODE = (os.getenv('ProofMode') or os.getenv('PROOF_MODE', 'false')).lower() == 'true'
PROOF_PLAN_ID = os.getenv('ProofPlanId') or os.getenv('PROOF_PLAN_ID')


class RateLimitExceeded(RuntimeError):
    def __init__(self, wait_seconds: float):
        super().__init__(f"retry_after_too_long:{int(wait_seconds)}")
        self.wait_seconds = float(wait_seconds)

s3 = boto3.client('s3')
secrets_client = boto3.client('secretsmanager')


def fetch_token(secret_name: str) -> str:
    try:
        data = secrets_client.get_secret_value(SecretId=secret_name)
        secret = data.get('SecretString')
        if not secret:
            raise ValueError('Secrets Manager returned empty string for token.')
        try:
            parsed = json.loads(secret)
            if isinstance(parsed, dict):
                token_val = parsed.get('token', secret)
                return str(token_val).strip()
        except json.JSONDecodeError:
            pass
        return str(secret).strip()
    except ClientError as exc:
        logger.error('Secrets Manager access failed: %s', exc)
        raise


def read_plan_index() -> int:
    try:
        response = s3.get_object(Bucket=STATE_BUCKET, Key=STATE_KEY)
        raw = response['Body'].read().decode('utf-8').strip()
        try:
            return int(raw)
        except ValueError:
            payload = json.loads(raw)
            return int(payload.get('plan_index', 0))
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'NoSuchKey':
            return 0
        logger.error('Unable to read state pointer: %s', exc)
        raise


def read_state(plan_count: int) -> dict:
    default_state = {
        'plan_index': 0,
        'next_index': 0,
        'last_attempt_ts': None,
        'last_attempt_plan_id': None,
        'last_attempt_bytes': None,
        'last_success_ts': None,
        'last_success_plan_id': None,
        'last_success_bytes': None,
        'last_error': None,
        'next_allowed_ts': None,
        'rate_limited': False,
    }
    try:
        response = s3.get_object(Bucket=STATE_BUCKET, Key=STATE_KEY)
        raw = response['Body'].read().decode('utf-8').strip()
        try:
            # Backwards compatibility: state was a plain integer.
            default_state['plan_index'] = int(raw)
            default_state['next_index'] = int(raw) % max(plan_count, 1)
            return default_state
        except ValueError:
            payload = json.loads(raw)
            default_state.update(payload)
            default_state['plan_index'] = int(default_state.get('plan_index', 0))
            default_state['next_index'] = int(default_state.get('next_index', default_state['plan_index']) % max(plan_count, 1))
            return default_state
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'NoSuchKey':
            return default_state
        logger.error('Unable to read state: %s', exc)
        raise


def write_state(state: dict) -> None:
    s3.put_object(
        Bucket=STATE_BUCKET,
        Key=STATE_KEY,
        Body=json.dumps(state, indent=2).encode('utf-8'),
        ContentType='application/json',
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except ValueError:
        return None


def _sleep_with_jitter(seconds: float) -> None:
    if seconds <= 0:
        return
    jitter = random.uniform(0, min(1.0, seconds * 0.25))
    time.sleep(seconds + jitter)


def _retry_after_seconds(response: requests.Response) -> float:
    header = response.headers.get('Retry-After')
    if not header:
        return 0.0
    try:
        return float(header)
    except ValueError:
        return 0.0


def request_with_backoff(method: str, url: str, *, headers=None, json_body=None, timeout=30) -> requests.Response:
    headers = headers or {}
    attempt = 0
    while True:
        response = requests.request(method, url, headers=headers, json=json_body, timeout=timeout)
        if response.status_code != 429:
            return response
        attempt += 1
        if attempt > MAX_RETRIES:
            response.raise_for_status()
        retry_after = _retry_after_seconds(response)
        backoff = min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
        wait_for = max(retry_after, backoff)
        if wait_for > MAX_BACKOFF_WAIT_SECONDS:
            raise RateLimitExceeded(wait_for)
        logger.warning('Received 429 for %s %s; waiting %.1fs before retry %s/%s', method, url, wait_for, attempt, MAX_RETRIES)
        _sleep_with_jitter(wait_for)


def validate_export(payload: bytes) -> tuple[bool, str]:
    if len(payload) < MIN_ZIP_BYTES:
        return False, f'zip_too_small:{len(payload)}'
    if not payload.startswith(b'PK'):
        return False, 'not_zip_magic'
    try:
        with zipfile.ZipFile(BytesIO(payload)) as zf:
            names = zf.namelist()
            json_members = [n for n in names if n.lower().endswith('.json')]
            if not json_members:
                return False, 'zip_missing_json'
    except zipfile.BadZipFile:
        return False, 'zip_invalid'
    return True, 'ok'


def request_export(plan_id: str, token: str) -> requests.Response:
    headers = {'Token': token}
    url = f"{API_BASE_URL}/{plan_id}"
    response = request_with_backoff('GET', url, headers=headers, timeout=60)
    response.raise_for_status()
    return response


def download_payload(plan_id: str, token: str) -> bytes:
    response = request_export(plan_id, token)
    # If the export endpoint returns JSON with a download URL, follow it.
    content_type = (response.headers.get('Content-Type') or '').lower()
    if 'application/json' in content_type:
        payload = response.json()
        download_url = payload.get('url') or payload.get('download_url') or payload.get('signed_url')
        if not download_url:
            raise RuntimeError('Export response JSON did not include a download URL.')
        response = request_with_backoff('GET', download_url, timeout=120)
        response.raise_for_status()
        return response.content
    return response.content


def export_plan(plan_id: str, token: str) -> dict:
    dt = datetime.now(timezone.utc).date().isoformat()
    _sleep_with_jitter(REQUEST_SPACING_SECONDS)
    raw_payload = download_payload(plan_id, token)
    is_valid, reason = validate_export(raw_payload)
    result = {
        'plan_id': plan_id,
        'dt': dt,
        'bytes': len(raw_payload),
        'valid': is_valid,
        'validation_reason': reason,
        's3_key': None,
    }
    if not is_valid:
        return result
    key = f"{EXPORT_PREFIX}/plan_id={plan_id}/dt={dt}/export_{dt}.zip"
    s3.put_object(Bucket=EXPORT_BUCKET, Key=key, Body=raw_payload, ContentType='application/zip')
    result['s3_key'] = key
    logger.info('Exported plan %s to s3://%s/%s (%s bytes)', plan_id, EXPORT_BUCKET, key, len(raw_payload))
    return result


def write_manifest(dt: str, state: dict, ingest_ok: bool) -> None:
    diagnostic = state.get('diagnostic', {})
    manifest = {
        'system': 'vetro',
        'run_date': dt,
        'vetro': {
            'ingest': {
                'ok': ingest_ok,
                'last_success_ts': state.get('last_success_ts'),
                'last_attempt_ts': state.get('last_attempt_ts'),
                'last_success_plan_id': state.get('last_success_plan_id'),
                'last_attempt_plan_id': state.get('last_attempt_plan_id'),
                'last_success_bytes': state.get('last_success_bytes'),
                'last_attempt_bytes': state.get('last_attempt_bytes'),
                'last_error': state.get('last_error'),
                'rate_limited': bool(state.get('rate_limited')),
                'next_allowed_ts': state.get('next_allowed_ts'),
            }
        },
        'diagnostic': diagnostic,
        'generated_at': _now_iso(),
    }
    key = f'orchestration/vetro_daily/run_date={dt}/manifest.json'
    s3.put_object(Bucket=EXPORT_BUCKET, Key=key, Body=json.dumps(manifest, indent=2).encode('utf-8'), ContentType='application/json')


def run_network_diagnostic() -> dict:
    host = urlparse(API_BASE_URL).hostname or API_BASE_URL
    result = {'host': host, 'dns': {'ok': False, 'answers': []}, 'http': {'ok': False, 'status_code': None}}
    try:
        infos = socket.getaddrinfo(host, 443)
        addrs = sorted({info[4][0] for info in infos})
        result['dns'] = {'ok': True, 'answers': addrs}
    except OSError as exc:
        result['dns'] = {'ok': False, 'error': type(exc).__name__}
        return result
    try:
        resp = request_with_backoff('HEAD', f'https://{host}', timeout=20)
        result['http'] = {'ok': resp.ok, 'status_code': resp.status_code}
    except requests.RequestException as exc:
        result['http'] = {'ok': False, 'error': type(exc).__name__}
    return result


def lambda_handler(event, context):
    if not PLAN_IDS:
        raise ValueError('PlanIds environment variable is required.')

    plan_list = [pid.strip() for pid in PLAN_IDS.split(',') if pid.strip()]
    if not plan_list:
        raise ValueError('PlanIds must contain at least one plan identifier.')

    state = read_state(len(plan_list))
    plan_index = int(state.get('plan_index', 0)) % len(plan_list)
    plan_id = PROOF_PLAN_ID or plan_list[plan_index]
    token = fetch_token(VETRO_TOKEN_SECRET)
    dt = datetime.now(timezone.utc).date().isoformat()
    state['diagnostic'] = run_network_diagnostic()

    ingest_ok = False
    now_dt = datetime.now(timezone.utc)
    next_allowed = _parse_iso(state.get('next_allowed_ts'))
    if next_allowed and now_dt < next_allowed:
        state['rate_limited'] = True
        state['last_error'] = 'rate_limited_wait'
        write_state(state)
        write_manifest(dt, state, ingest_ok=False)
        logger.info('Rate limited until %s; skipping attempt.', state.get('next_allowed_ts'))
        return {'status': 'rate_limited', 'next_allowed_ts': state.get('next_allowed_ts')}
    try:
        state['rate_limited'] = False
        state['next_allowed_ts'] = None
        state['last_attempt_ts'] = _now_iso()
        state['last_attempt_plan_id'] = plan_id
        result = export_plan(plan_id, token)
        state['last_attempt_bytes'] = result.get('bytes')
        if result.get('valid'):
            state['last_success_ts'] = state['last_attempt_ts']
            state['last_success_plan_id'] = plan_id
            state['last_success_bytes'] = result.get('bytes')
            state['last_error'] = None
            ingest_ok = True
        else:
            state['last_error'] = result.get('validation_reason')
    except RateLimitExceeded as exc:
        # Honor Retry-After by persisting the next allowed timestamp and exiting cleanly.
        wait_seconds = max(0.0, exc.wait_seconds)
        next_allowed_ts = (datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)).isoformat()
        state['rate_limited'] = True
        state['next_allowed_ts'] = next_allowed_ts
        state['last_error'] = 'rate_limited'
        logger.warning('Rate limited. Next allowed attempt at %s', next_allowed_ts)
    except Exception as exc:
        logger.error('Export failed for plan %s: %s', plan_id, exc)
        state['last_error'] = f'exception:{type(exc).__name__}'
        raise
    finally:
        if PROOF_MODE:
            next_index = plan_index
        else:
            next_index = (plan_index + 1) % len(plan_list)
        state['plan_index'] = next_index
        state['next_index'] = next_index
        write_state(state)
        write_manifest(dt, state, ingest_ok)
        logger.info('State pointer advanced to %s (ingest_ok=%s, proof_mode=%s)', next_index, ingest_ok, PROOF_MODE)

# Lambda entry point (required for some bundlers)
def handler(event, context):
    return lambda_handler(event, context)
