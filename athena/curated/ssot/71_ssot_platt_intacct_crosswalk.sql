-- Build deterministic Platt ↔ Intacct crosswalk (1:1) from curated_map.map_account
CREATE DATABASE IF NOT EXISTS curated_crosswalks;

DROP TABLE IF EXISTS curated_crosswalks.platt_to_intacct_customer_1to1;

CREATE TABLE curated_crosswalks.platt_to_intacct_customer_1to1
WITH (
  external_location = 's3://gwi-raw-us-east-2-pc/raw/crosswalks/platt_to_intacct_customer_1to1/dt=2026-02-11/',
  format = 'PARQUET'
) AS
WITH latest AS (
  SELECT max(run_date) AS run_date
  FROM curated_map.map_account
),
base AS (
  SELECT DISTINCT
    platt_customer_id,
    intacct_customer_id,
    match_method
  FROM curated_map.map_account m
  JOIN latest l ON m.run_date = l.run_date
  WHERE platt_customer_id IS NOT NULL
    AND intacct_customer_id IS NOT NULL
),
platt_dups AS (
  SELECT platt_customer_id, COUNT(DISTINCT intacct_customer_id) AS int_ct
  FROM base
  GROUP BY 1
),
int_dups AS (
  SELECT intacct_customer_id, COUNT(DISTINCT platt_customer_id) AS platt_ct
  FROM base
  GROUP BY 1
)
SELECT
  b.platt_customer_id,
  b.intacct_customer_id,
  b.match_method,
  CASE b.match_method
    WHEN 'intacct_authorization_number' THEN 0.90
    WHEN 'intacct_name' THEN 0.60
    ELSE 0.60
  END AS match_confidence,
  CONCAT('map_account_', b.match_method, '_1to1') AS match_rule,
  l.run_date
FROM base b
JOIN platt_dups p ON b.platt_customer_id = p.platt_customer_id
JOIN int_dups i ON b.intacct_customer_id = i.intacct_customer_id
CROSS JOIN latest l
WHERE p.int_ct = 1
  AND i.platt_ct = 1;
