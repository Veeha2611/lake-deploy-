-- Vetro plan exports curated raw/current/exceptions from raw_vetro.raw_vetro_files.
CREATE EXTERNAL TABLE IF NOT EXISTS curated_core.vetro_plan_exports_curated_raw (
  dt string,
  plan_id string,
  record_json string,
  ingested_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_core/vetro_plan_exports_curated_raw/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.vetro_plan_exports_exceptions (
  dt string,
  plan_id string,
  error_reason string,
  raw_line string,
  ingested_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/vetro_plan_exports_exceptions/';

CREATE OR REPLACE VIEW curated_core.vetro_plan_exports_current AS
WITH base AS (
  SELECT
    dt,
    plan_id,
    record_json,
    ingested_at
  FROM curated_core.vetro_plan_exports_curated_raw
  WHERE plan_id IS NOT NULL
    AND record_json IS NOT NULL
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY plan_id
      ORDER BY dt DESC, ingested_at DESC
    ) AS rn
  FROM base
)
SELECT
  dt,
  plan_id,
  record_json,
  ingested_at
FROM ranked
WHERE rn = 1;

-- Daily loads (parameterize run_date in orchestration):
-- INSERT INTO curated_core.vetro_plan_exports_curated_raw
-- SELECT
--   dt,
--   plan_id,
--   CAST(json_parse(raw_line) AS varchar) AS record_json,
--   current_timestamp AS ingested_at
-- FROM raw_vetro.raw_vetro_files
-- WHERE dt = '<YYYY-MM-DD>'
--   AND raw_line IS NOT NULL
--   AND TRY(json_parse(raw_line)) IS NOT NULL;
--
-- INSERT INTO curated_recon.vetro_plan_exports_exceptions
-- SELECT
--   dt,
--   plan_id,
--   CASE
--     WHEN raw_line IS NULL OR raw_line = '' THEN 'empty_raw_line'
--     WHEN TRY(json_parse(raw_line)) IS NULL THEN 'invalid_json'
--     ELSE 'missing_plan_id'
--   END AS error_reason,
--   raw_line,
--   current_timestamp AS ingested_at
-- FROM raw_vetro.raw_vetro_files
-- WHERE dt = '<YYYY-MM-DD>'
--   AND (
--     raw_line IS NULL OR raw_line = '' OR
--     TRY(json_parse(raw_line)) IS NULL OR
--     plan_id IS NULL
--   );
