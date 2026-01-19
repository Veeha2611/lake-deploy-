# Intacct Ingest Handoff

## Where to look
- **Ingest script**: `lake_deploy/intacct_ingest.sh` (production credentials, NDJSON extraction, heartbeat uploads).  
- **Runbook history**: `lake_deploy/intacct_runbook.md` and `lake_deploy/codex_data_lake_history.md` for recent operational notes, and `lake_deploy/latest_chat_history_01192026.md` for the CODEX workflow/handshake checklist.  
- **Logs & outputs**: `~/intacct_ingest/logs/` holds `ingest_<timestamp>.log`; check `~/intacct_ingest/<YYYY-MM-DD>/data_quality_summary.txt` for GL entry summaries and heartbeat status.  
- **S3 targets**: data lands under `s3://gwi-raw-us-east-2-pc/raw/intacct/` with XML/NDJSON prefixes plus `heartbeat/` for success/failure markers.

## How to run the ingest
1. Ensure AWS/GitHub handshake is already completed per `latest_chat_history_01192026.md` (Gate 0 commands prove access).  
2. Source the shared env: `source ~/intacct_env.sh` (the script already does this).  
3. Run the script manually:  
   ```bash
   cd ~
   ~/intacct_ingest.sh
   ```  
   This will log to `~/intacct_ingest/logs/` and upload XML/NDJSON into the S3 prefixes above.  
4. After completion, inspect the log plus `~/intacct_ingest/<run_date>/heartbeat.txt` and `data_quality_summary.txt` for counts and GL entry dates to confirm the new ingestion window.  
5. If the ingest fails, the script writes `failure.txt` locally and pushes it to `s3://gwi-raw-us-east-2-pc/raw/intacct/heartbeat/failure_<timestamp>.txt` for troubleshooting.

## Next references
- Update the runbook files if any ingestion behavior changes.  
- Share any new GL JSON table names or Athena checks in the `latest_chat_history_01192026.md` section so another CODEX session can pick up exactly where you left off.
