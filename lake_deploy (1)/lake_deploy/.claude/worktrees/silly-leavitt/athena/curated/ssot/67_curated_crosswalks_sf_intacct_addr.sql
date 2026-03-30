-- Curated crosswalks: Salesforce -> Intacct via address (deterministic 1:1)
-- Path A: SF billing address -> Platt customer address -> Intacct (via platt_intacct_dedup)
-- Path B: SF billing address -> Intacct customer mail address

CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_addr_platt
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_addr_platt/'
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
    UPPER(REGEXP_REPLACE(sf_account_name, '[^A-Z0-9]', '')) AS name_key,
    UPPER(REGEXP_REPLACE(billingstreet, '[^A-Z0-9]', '')) AS street_key,
    UPPER(REGEXP_REPLACE(billingcity, '[^A-Z0-9]', '')) AS city_key,
    UPPER(REGEXP_REPLACE(billingstate, '[^A-Z0-9]', '')) AS state_key,
    SUBSTR(TRIM(billingpostalcode), 1, 5) AS zip5
  FROM sf
), platt AS (
  SELECT
    id AS platt_customer_id,
    name AS platt_customer_name,
    addr1,
    addr2,
    city,
    state,
    zip
  FROM raw_platt.customer
  WHERE addr1 IS NOT NULL AND TRIM(addr1) <> ''
    AND zip IS NOT NULL AND TRIM(zip) <> ''
), platt_keys AS (
  SELECT
    platt_customer_id,
    platt_customer_name,
    UPPER(REGEXP_REPLACE(platt_customer_name, '[^A-Z0-9]', '')) AS name_key,
    UPPER(REGEXP_REPLACE(CONCAT(COALESCE(addr1, ''), ' ', COALESCE(addr2, '')), '[^A-Z0-9]', '')) AS street_key,
    UPPER(REGEXP_REPLACE(city, '[^A-Z0-9]', '')) AS city_key,
    UPPER(REGEXP_REPLACE(state, '[^A-Z0-9]', '')) AS state_key,
    SUBSTR(TRIM(zip), 1, 5) AS zip5
  FROM platt
), platt_intacct AS (
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule AS platt_match_rule,
    match_confidence AS platt_match_confidence,
    1 AS priority
  FROM curated_crosswalks.platt_to_intacct_customer_1to1
  UNION ALL
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule,
    match_confidence,
    2 AS priority
  FROM curated_crosswalks.platt_to_intacct_email_zip_1to1_candidate
  UNION ALL
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule,
    match_confidence,
    3 AS priority
  FROM curated_crosswalks.platt_to_intacct_name_zip_1to1_candidate
), platt_intacct_dedup AS (
  SELECT
    *,
    row_number() OVER (PARTITION BY platt_customer_id, intacct_customer_id ORDER BY priority ASC) AS rn
  FROM platt_intacct
), pairs AS (
  SELECT
    sf.sf_account_id,
    sf.sf_account_name,
    p.platt_customer_id,
    pid.intacct_customer_id
  FROM sf_keys sf
  JOIN platt_keys p
    ON sf.name_key = p.name_key
   AND sf.street_key = p.street_key
   AND sf.zip5 = p.zip5
   AND sf.city_key = p.city_key
   AND sf.state_key = p.state_key
  JOIN platt_intacct_dedup pid
    ON pid.platt_customer_id = p.platt_customer_id
   AND pid.rn = 1
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
  CAST(NULL AS varchar) AS intacct_customer_recordno,
  CAST(NULL AS varchar) AS intacct_customer_name,
  'sf_addr_to_platt_addr_to_intacct' AS match_rule,
  0.85 AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;

CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_addr_intacct
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_addr_intacct/'
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
    UPPER(REGEXP_REPLACE(sf_account_name, '[^A-Z0-9]', '')) AS name_key,
    UPPER(REGEXP_REPLACE(billingstreet, '[^A-Z0-9]', '')) AS street_key,
    UPPER(REGEXP_REPLACE(billingcity, '[^A-Z0-9]', '')) AS city_key,
    UPPER(REGEXP_REPLACE(billingstate, '[^A-Z0-9]', '')) AS state_key,
    SUBSTR(TRIM(billingpostalcode), 1, 5) AS zip5
  FROM sf
), ic AS (
  SELECT
    customerid AS intacct_customer_id,
    recordno AS intacct_customer_recordno,
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
    UPPER(REGEXP_REPLACE(intacct_customer_name, '[^A-Z0-9]', '')) AS name_key,
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
    CAST(ic.intacct_customer_recordno AS varchar) AS intacct_customer_recordno,
    ic.intacct_customer_name
  FROM sf_keys sf
  JOIN ic_keys ic
    ON sf.name_key = ic.name_key
   AND sf.street_key = ic.street_key
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
  'sf_addr_to_intacct_mailaddr' AS match_rule,
  0.80 AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;
