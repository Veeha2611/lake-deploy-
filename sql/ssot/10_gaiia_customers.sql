-- Gaiia customers curated raw/current/exceptions (JSON-first; typed fields can be added later).
CREATE EXTERNAL TABLE IF NOT EXISTS curated_core.gaiia_customers_curated_raw (
  dt string,
  customer_id string,
  record_json string,
  error_json string,
  ingested_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_core/gaiia_customers_curated_raw/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.gaiia_customers_exceptions (
  dt string,
  customer_id string,
  error_reason string,
  error_json string,
  record_json string,
  ingested_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/gaiia_customers_exceptions/';

CREATE OR REPLACE VIEW curated_core.gaiia_customers_current AS
WITH base AS (
  SELECT
    dt,
    COALESCE(
      customer_id,
      json_extract_scalar(record_json, '$.id'),
      json_extract_scalar(record_json, '$.customer_id')
    ) AS customer_id,
    record_json,
    error_json,
    ingested_at,
    TRY(from_iso8601_timestamp(json_extract_scalar(record_json, '$.updated_at'))) AS updated_at,
    TRY(from_iso8601_timestamp(json_extract_scalar(record_json, '$.created_at'))) AS created_at
  FROM curated_core.gaiia_customers_curated_raw
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id
      ORDER BY COALESCE(updated_at, created_at, ingested_at) DESC, dt DESC
    ) AS rn
  FROM base
  WHERE customer_id IS NOT NULL
    AND record_json IS NOT NULL
    AND error_json IS NULL
)
SELECT
  dt,
  customer_id,
  record_json,
  ingested_at,
  CAST(COALESCE(updated_at, created_at, ingested_at) AS timestamp) AS updated_at
FROM ranked
WHERE rn = 1;

-- Daily loads (parameterize run_date in orchestration):
-- INSERT INTO curated_core.gaiia_customers_curated_raw
-- SELECT
--   dt,
--   COALESCE(
--     json_extract_scalar(record_json, '$.id'),
--     json_extract_scalar(record_json, '$.customer_id')
--   ) AS customer_id,
--   record_json,
--   error_json,
--   current_timestamp AS ingested_at
-- FROM raw_gaiia.customers
-- WHERE dt = '<YYYY-MM-DD>';
--
-- INSERT INTO curated_recon.gaiia_customers_exceptions
-- SELECT
--   dt,
--   COALESCE(
--     json_extract_scalar(record_json, '$.id'),
--     json_extract_scalar(record_json, '$.customer_id')
--   ) AS customer_id,
--   CASE
--     WHEN record_json IS NULL OR record_json = '' THEN 'empty_record_json'
--     WHEN error_json IS NOT NULL THEN 'error_json_present'
--     ELSE 'missing_customer_id'
--   END AS error_reason,
--   error_json,
--   record_json,
--   current_timestamp AS ingested_at
-- FROM raw_gaiia.customers
-- WHERE dt = '<YYYY-MM-DD>'
--   AND (
--     error_json IS NOT NULL OR
--     record_json IS NULL OR record_json = '' OR
--     COALESCE(
--       json_extract_scalar(record_json, '$.id'),
--       json_extract_scalar(record_json, '$.customer_id')
--     ) IS NULL
--   );
