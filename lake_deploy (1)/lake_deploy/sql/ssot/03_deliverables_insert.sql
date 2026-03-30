-- Load deliverables daily from config + ssot summary
INSERT INTO curated_ssot.deliverables
SELECT
  c.deliverable_id,
  c.title,
  c.workstream,
  c.module,
  c.status,
  c.owner_email,
  NULLIF(c.due_date, '') AS due_date,
  c.priority,
  s.guard_ok AS ssot_guard_ok,
  CONCAT('s3://gwi-raw-us-east-2-pc/orchestration/', s.system, '_daily/run_date=', s.run_date, '/manifest.json') AS manifest_s3_uri,
  CONCAT(
    'ssot_count_qid=', COALESCE(s.ssot_count_qid, ''),
    ';ssot_max_business_date_qid=', COALESCE(s.ssot_max_business_date_qid, ''),
    ';exception_count_qid=', COALESCE(s.exception_count_qid, ''),
    ';exception_max_future_date_qid=', COALESCE(s.exception_max_future_date_qid, '')
  ) AS proof_qids,
  s.exception_count,
  CAST(current_timestamp AS varchar) AS last_updated_ts,
  s.run_date AS dt
FROM raw_static.deliverables_config c
LEFT JOIN curated_recon.ssot_daily_summary s
  ON s.entity = CASE
      WHEN c.deliverable_id = 'intacct_gl_entries' THEN 'gl_entries'
      WHEN c.deliverable_id = 'salesforce_account' THEN 'account'
      ELSE c.deliverable_id
    END
WHERE s.run_date = '<RUN_DATE>';
