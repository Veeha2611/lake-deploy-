-- SSOT scaffold for Gaiia customers (raw JSON payloads)
-- NOTE: record_json is empty when auth fails; exceptions capture those rows.
CREATE OR REPLACE VIEW curated_core.gaiia_customers_curated_raw AS
SELECT
  record_id,
  record_json,
  error_json,
  missing_inputs_count,
  run_date,
  CAST(NULL AS date) AS business_date,
  CAST(NULL AS date) AS updated_at
FROM curated_core.gaiia_customers;

CREATE OR REPLACE VIEW curated_recon.gaiia_customers_exceptions AS
SELECT
  CASE
    WHEN error_json IS NOT NULL AND error_json <> '' THEN 'auth_or_query_error'
    WHEN missing_inputs_count > 0 THEN 'missing_inputs'
    WHEN record_json IS NULL OR record_json = '' THEN 'empty_record_json'
    ELSE 'other'
  END AS reason_code,
  *
FROM curated_core.gaiia_customers_curated_raw
WHERE error_json IS NOT NULL AND error_json <> ''
   OR missing_inputs_count > 0
   OR record_json IS NULL OR record_json = '';

CREATE OR REPLACE VIEW curated_core.gaiia_customers_current AS
SELECT *
FROM curated_core.gaiia_customers_curated_raw
WHERE record_json IS NOT NULL AND record_json <> ''
  AND (error_json IS NULL OR error_json = '')
  AND (missing_inputs_count IS NULL OR missing_inputs_count = 0);
