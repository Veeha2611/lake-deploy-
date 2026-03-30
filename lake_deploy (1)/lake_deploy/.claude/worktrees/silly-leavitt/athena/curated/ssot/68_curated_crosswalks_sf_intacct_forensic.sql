-- Curated crosswalks: Salesforce -> Intacct (forensic deterministic fallbacks)
-- 1) Name + ZIP (+ city/state when available)
-- 2) Address-only (street + ZIP + city + state)

CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_name_zip
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_name_zip/'
) AS
WITH sf AS (
  SELECT
    id AS sf_account_id,
    name AS sf_account_name,
    billingcity,
    billingstate,
    billingpostalcode
  FROM curated_core.salesforce_account_current
  WHERE name IS NOT NULL AND TRIM(name) <> ''
    AND billingpostalcode IS NOT NULL AND TRIM(billingpostalcode) <> ''
), sf_keys AS (
  SELECT
    sf_account_id,
    sf_account_name,
    UPPER(REGEXP_REPLACE(sf_account_name, '[^A-Z0-9]', '')) AS name_key,
    SUBSTR(TRIM(billingpostalcode), 1, 5) AS zip5,
    NULLIF(UPPER(REGEXP_REPLACE(billingcity, '[^A-Z0-9]', '')), '') AS city_key,
    NULLIF(UPPER(REGEXP_REPLACE(billingstate, '[^A-Z0-9]', '')), '') AS state_key
  FROM sf
), ic AS (
  SELECT
    customerid AS intacct_customer_id,
    CAST(recordno AS varchar) AS intacct_customer_recordno,
    name AS intacct_customer_name,
    "displaycontact.mailaddress.city" AS city,
    "displaycontact.mailaddress.state" AS state,
    "displaycontact.mailaddress.zip" AS zip
  FROM gwi_raw_intacct.customers
  WHERE name IS NOT NULL AND TRIM(name) <> ''
    AND "displaycontact.mailaddress.zip" IS NOT NULL
    AND TRIM("displaycontact.mailaddress.zip") <> ''
), ic_keys AS (
  SELECT
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    UPPER(REGEXP_REPLACE(intacct_customer_name, '[^A-Z0-9]', '')) AS name_key,
    SUBSTR(TRIM(zip), 1, 5) AS zip5,
    NULLIF(UPPER(REGEXP_REPLACE(city, '[^A-Z0-9]', '')), '') AS city_key,
    NULLIF(UPPER(REGEXP_REPLACE(state, '[^A-Z0-9]', '')), '') AS state_key
  FROM ic
), pairs AS (
  SELECT
    sf.sf_account_id,
    sf.sf_account_name,
    ic.intacct_customer_id,
    ic.intacct_customer_recordno,
    ic.intacct_customer_name
  FROM sf_keys sf
  JOIN ic_keys ic
    ON sf.name_key = ic.name_key
   AND sf.zip5 = ic.zip5
   AND (sf.state_key = ic.state_key OR sf.state_key IS NULL OR ic.state_key IS NULL)
   AND (sf.city_key = ic.city_key OR sf.city_key IS NULL OR ic.city_key IS NULL)
), sf_dups AS (
  SELECT sf_account_id, COUNT(*) AS ct
  FROM pairs
  GROUP BY 1
), ic_dups AS (
  SELECT intacct_customer_id, COUNT(*) AS ct
  FROM pairs
  GROUP BY 1
), filtered AS (
  SELECT p.*
  FROM pairs p
  JOIN sf_dups s ON p.sf_account_id = s.sf_account_id AND s.ct = 1
  JOIN ic_dups i ON p.intacct_customer_id = i.intacct_customer_id AND i.ct = 1
)
SELECT
  sf_account_id,
  sf_account_name,
  CAST(NULL AS varchar) AS sf_customer_id__c,
  intacct_customer_id,
  intacct_customer_recordno,
  intacct_customer_name,
  'sf_name_zip_to_intacct' AS match_rule,
  0.70 AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;

CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_addr_only
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_addr_only/'
) AS
WITH sf AS (
  SELECT
    id AS sf_account_id,
    name AS sf_account_name,
    billingstreet,
    billingcity,
    billingstate,
    billingpostalcode
  FROM curated_core.salesforce_account_current
  WHERE billingstreet IS NOT NULL AND TRIM(billingstreet) <> ''
    AND billingpostalcode IS NOT NULL AND TRIM(billingpostalcode) <> ''
), sf_keys AS (
  SELECT
    sf_account_id,
    sf_account_name,
    UPPER(REGEXP_REPLACE(billingstreet, '[^A-Z0-9]', '')) AS street_key,
    UPPER(REGEXP_REPLACE(billingcity, '[^A-Z0-9]', '')) AS city_key,
    UPPER(REGEXP_REPLACE(billingstate, '[^A-Z0-9]', '')) AS state_key,
    SUBSTR(TRIM(billingpostalcode), 1, 5) AS zip5
  FROM sf
), ic AS (
  SELECT
    customerid AS intacct_customer_id,
    CAST(recordno AS varchar) AS intacct_customer_recordno,
    name AS intacct_customer_name,
    "displaycontact.mailaddress.address1" AS addr1,
    "displaycontact.mailaddress.address2" AS addr2,
    "displaycontact.mailaddress.city" AS city,
    "displaycontact.mailaddress.state" AS state,
    "displaycontact.mailaddress.zip" AS zip
  FROM gwi_raw_intacct.customers
  WHERE "displaycontact.mailaddress.address1" IS NOT NULL
    AND TRIM("displaycontact.mailaddress.address1") <> ''
    AND "displaycontact.mailaddress.zip" IS NOT NULL
    AND TRIM("displaycontact.mailaddress.zip") <> ''
), ic_keys AS (
  SELECT
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    UPPER(REGEXP_REPLACE(CONCAT(COALESCE(addr1, ''), ' ', COALESCE(addr2, '')), '[^A-Z0-9]', '')) AS street_key,
    UPPER(REGEXP_REPLACE(city, '[^A-Z0-9]', '')) AS city_key,
    UPPER(REGEXP_REPLACE(state, '[^A-Z0-9]', '')) AS state_key,
    SUBSTR(TRIM(zip), 1, 5) AS zip5
  FROM ic
), pairs AS (
  SELECT
    sf.sf_account_id,
    sf.sf_account_name,
    ic.intacct_customer_id,
    ic.intacct_customer_recordno,
    ic.intacct_customer_name
  FROM sf_keys sf
  JOIN ic_keys ic
    ON sf.street_key = ic.street_key
   AND sf.zip5 = ic.zip5
   AND sf.city_key = ic.city_key
   AND sf.state_key = ic.state_key
), sf_dups AS (
  SELECT sf_account_id, COUNT(*) AS ct
  FROM pairs
  GROUP BY 1
), ic_dups AS (
  SELECT intacct_customer_id, COUNT(*) AS ct
  FROM pairs
  GROUP BY 1
), filtered AS (
  SELECT p.*
  FROM pairs p
  JOIN sf_dups s ON p.sf_account_id = s.sf_account_id AND s.ct = 1
  JOIN ic_dups i ON p.intacct_customer_id = i.intacct_customer_id AND i.ct = 1
)
SELECT
  sf_account_id,
  sf_account_name,
  CAST(NULL AS varchar) AS sf_customer_id__c,
  intacct_customer_id,
  intacct_customer_recordno,
  intacct_customer_name,
  'sf_addr_only_to_intacct' AS match_rule,
  0.65 AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;
