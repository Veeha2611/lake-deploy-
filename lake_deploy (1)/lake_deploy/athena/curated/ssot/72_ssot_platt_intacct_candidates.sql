-- Candidate crosswalks for review only (do not auto-apply to SSOT)
CREATE DATABASE IF NOT EXISTS curated_crosswalks;

DROP TABLE IF EXISTS curated_crosswalks.platt_to_intacct_name_zip_1to1_candidate;

CREATE TABLE curated_crosswalks.platt_to_intacct_name_zip_1to1_candidate
WITH (
  external_location = 's3://gwi-raw-us-east-2-pc/raw/crosswalks/platt_to_intacct_name_zip_1to1_candidate/dt=2026-02-11/',
  format = 'PARQUET'
) AS
WITH platt AS (
  SELECT
    id AS platt_customer_id,
    UPPER(REGEXP_REPLACE(name, '[^A-Z0-9]', '')) AS name_key,
    SUBSTR(TRIM(zip), 1, 5) AS zip5
  FROM curated_core.platt_customer_current_ssot
  WHERE name IS NOT NULL AND TRIM(name) <> ''
    AND zip IS NOT NULL AND TRIM(zip) <> ''
),
intacct AS (
  SELECT
    customerid AS intacct_customer_id,
    UPPER(REGEXP_REPLACE(name, '[^A-Z0-9]', '')) AS name_key,
    SUBSTR(TRIM("displaycontact.mailaddress.zip"), 1, 5) AS zip5
  FROM gwi_raw_intacct.customers
  WHERE name IS NOT NULL AND TRIM(name) <> ''
    AND "displaycontact.mailaddress.zip" IS NOT NULL AND TRIM("displaycontact.mailaddress.zip") <> ''
),
pairs AS (
  SELECT p.platt_customer_id, i.intacct_customer_id, p.name_key, p.zip5
  FROM platt p
  JOIN intacct i
    ON p.name_key = i.name_key AND p.zip5 = i.zip5
),
platt_dups AS (
  SELECT platt_customer_id, COUNT(DISTINCT intacct_customer_id) AS int_ct
  FROM pairs
  GROUP BY 1
),
int_dups AS (
  SELECT intacct_customer_id, COUNT(DISTINCT platt_customer_id) AS platt_ct
  FROM pairs
  GROUP BY 1
)
SELECT DISTINCT
  p.platt_customer_id,
  p.intacct_customer_id,
  'name_zip' AS match_method,
  0.50 AS match_confidence,
  'candidate_name_zip_1to1' AS match_rule
FROM pairs p
JOIN platt_dups pd ON p.platt_customer_id = pd.platt_customer_id
JOIN int_dups id ON p.intacct_customer_id = id.intacct_customer_id
WHERE pd.int_ct = 1 AND id.platt_ct = 1;

DROP TABLE IF EXISTS curated_crosswalks.platt_to_intacct_email_zip_1to1_candidate;

CREATE TABLE curated_crosswalks.platt_to_intacct_email_zip_1to1_candidate
WITH (
  external_location = 's3://gwi-raw-us-east-2-pc/raw/crosswalks/platt_to_intacct_email_zip_1to1_candidate/dt=2026-02-11/',
  format = 'PARQUET'
) AS
WITH platt AS (
  SELECT
    id AS platt_customer_id,
    LOWER(TRIM(email)) AS email_key,
    SUBSTR(TRIM(zip), 1, 5) AS zip5
  FROM curated_core.platt_customer_current_ssot
  WHERE email IS NOT NULL AND TRIM(email) <> ''
    AND zip IS NOT NULL AND TRIM(zip) <> ''
),
intacct AS (
  SELECT
    customerid AS intacct_customer_id,
    LOWER(TRIM("displaycontact.email1")) AS email_key,
    SUBSTR(TRIM("displaycontact.mailaddress.zip"), 1, 5) AS zip5
  FROM gwi_raw_intacct.customers
  WHERE "displaycontact.email1" IS NOT NULL AND TRIM("displaycontact.email1") <> ''
    AND "displaycontact.mailaddress.zip" IS NOT NULL AND TRIM("displaycontact.mailaddress.zip") <> ''
),
pairs AS (
  SELECT p.platt_customer_id, i.intacct_customer_id, p.email_key, p.zip5
  FROM platt p
  JOIN intacct i
    ON p.email_key = i.email_key AND p.zip5 = i.zip5
),
platt_dups AS (
  SELECT platt_customer_id, COUNT(DISTINCT intacct_customer_id) AS int_ct
  FROM pairs
  GROUP BY 1
),
int_dups AS (
  SELECT intacct_customer_id, COUNT(DISTINCT platt_customer_id) AS platt_ct
  FROM pairs
  GROUP BY 1
)
SELECT DISTINCT
  p.platt_customer_id,
  p.intacct_customer_id,
  'email_zip' AS match_method,
  0.70 AS match_confidence,
  'candidate_email_zip_1to1' AS match_rule
FROM pairs p
JOIN platt_dups pd ON p.platt_customer_id = pd.platt_customer_id
JOIN int_dups id ON p.intacct_customer_id = id.intacct_customer_id
WHERE pd.int_ct = 1 AND id.platt_ct = 1;
