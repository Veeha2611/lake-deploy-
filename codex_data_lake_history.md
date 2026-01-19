# CODEX Data Lake History

## 1 Current state
- **Intacct ingest script**: `~/intacct_ingest.sh` sources `~/.bash_profile`, `~/.zshrc`, and `~/intacct_env.sh`, authenticates via `getAPISession`, and pulls VENDOR, CUSTOMER, APBILL, APPYMT, GLENTRY via the generic `pull_object` helper plus GLACCOUNT via a custom two‑step read-by-query/read pattern.  
- **S3 layout**: `s3://gwi-raw-us-east-2-pc/raw/intacct/<object>/<YYYY-MM-DD>/` with `<object>.xml` and NDJSON `<object>.json`. Heartbeats land under `raw/intacct/heartbeat/`.  
- **Glue/Athena database**: `gwi_raw_intacct`. Live curated views like `gl_accounts_flat` are built on top of raw `_json_<hash>` tables. Most `.xml` tables should be deleted to force Glue to crawl the NDJSON exports.

## 2 Recent updates
- `intacct_ingest.sh` now points to production credentials (`WS_USER_ID_PROD` etc.), logs the company ID/endpoint in use, and documents the lookback window (`GL_ENTRIES_LOOKBACK_DAYS` and the computed filter date) plus per-run `data_quality_summary.txt`.  
- Each run now records counts and max ENTRY/BATCH dates via `summarize_gl_entries` to aid auditing.  
- The runbook (`intacct_runbook.md`) acts as a local mirror for Notion updates, with nano instructions for appending timestamped entries.

## 3 Key recommendations
1. **Drop stale GL accounts metadata**:
   - `DROP TABLE gwi_raw_intacct.gl_accounts_keys_xml;`
   - Drop any remaining `_xml` or hashed `_json` versions before crawling again.
2. **Run the Intacct raw Glue crawler** on `s3://gwi-raw-us-east-2-pc/raw/intacct/` targeting `gwi_raw_intacct`.
3. **Validate the new NDJSON table**:
   - `SHOW TABLES IN gwi_raw_intacct;` look for the new `gl_accounts_json_<hash>`.
   - `SELECT "$path" FROM gwi_raw_intacct.gl_accounts_json_<hash> LIMIT 20;` should return `.json` paths.
   - `SELECT COUNT(*) FROM ...;` to sanity-check row counts (should match expected GL account volumes).
4. **Rewire curated views** (e.g., `gl_accounts_flat`) to the new `*_json_<hash>` table by:
   - Capturing the existing view definition (`SHOW CREATE TABLE ...`).
   - Dropping and recreating the view pointing at the newly hashed table.
5. **General pattern for other objects** (vendors, customers, AP bills/payments, GL entries):
   - Confirm NDJSON ingestion in S3.
   - Drop stale `_json*`/`_xml*` tables and rerun the crawler so Athena picks up the `.json` format.
   - Update the respective `_flat` views to point at the new tables once validated.

## 4 Suggested next actions for GitHub deployment
- Convert the docx runbook notes to this Markdown file so the history is documented in git.  
- Commit both `codex_data_lake_history.md` and `intacct_runbook.md` so the team can reference them when working in GitHub.  
- Share the new `gl_accounts_json_<hash>` table name once the crawler finishes and update `gl_accounts_flat` via `SHOW CREATE TABLE` output if necessary.

## 5 Outstanding validation
- Run `~/intacct_ingest.sh` using the production credentials and watch `~/intacct_ingest/logs/ingest_<timestamp>.log` for the heartbeat file and data quality lines.  
- After ingest completes, rerun the Glue crawler, capture the new `gl_accounts_json_<hash>` table, and confirm Athena queries (path + count) succeed.  
- If Athena still reports `HIVE_UNSUPPORTED_FORMAT`, drop the XML tables listed above before rerunning the crawler.

If you send me the crawler output or Athena query results, I can help you rewrite the view definitions or troubleshoot any remaining connectivity issues.
