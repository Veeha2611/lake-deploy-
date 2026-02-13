-- Curated crosswalks: Salesforce -> Platt -> Intacct (deterministic, 1:1 per Intacct)
CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_hybrid
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_hybrid/'
) AS
WITH sf AS (
  SELECT
    id AS sf_account_id,
    name AS sf_account_name,
    plat_id__c,
    CAST(lastmodifieddate AS timestamp) AS lastmodifieddate,
    CAST(createddate AS timestamp) AS createddate
  FROM curated_core.salesforce_account_current
  WHERE plat_id__c IS NOT NULL AND TRIM(plat_id__c) <> ''
    -- Restrict to Plat version 6 IDs to avoid migration duplicates (source: manual SF export list).
    AND plat_id__c IN (
      SELECT plat_id__c
      FROM raw_manual.sf_plat_version6_ids
      WHERE plat_id__c IS NOT NULL
        AND TRIM(plat_id__c) <> ''
        AND plat_id__c <> 'plat_id__c'
    )
), platt AS (
  SELECT id AS platt_customer_id
  FROM curated_core.platt_customer_current_ssot
  WHERE id IS NOT NULL
), platt_intacct AS (
  SELECT
    platt_customer_id,
    intacct_customer_id,
    'platt_intacct_1to1' AS platt_match_rule,
    0.95 AS platt_match_confidence,
    1 AS priority
  FROM curated_crosswalks.platt_to_intacct_customer_1to1
  WHERE platt_customer_id IS NOT NULL AND intacct_customer_id IS NOT NULL
  UNION ALL
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule AS platt_match_rule,
    match_confidence AS platt_match_confidence,
    2 AS priority
  FROM curated_crosswalks.platt_to_intacct_email_zip_1to1_candidate
  WHERE platt_customer_id IS NOT NULL AND intacct_customer_id IS NOT NULL
  UNION ALL
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule AS platt_match_rule,
    match_confidence AS platt_match_confidence,
    3 AS priority
  FROM curated_crosswalks.platt_to_intacct_name_zip_1to1_candidate
  WHERE platt_customer_id IS NOT NULL AND intacct_customer_id IS NOT NULL
), platt_intacct_dedup AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY platt_customer_id, intacct_customer_id
      ORDER BY priority ASC
    ) AS rn
  FROM platt_intacct
), sf_platt_intacct AS (
  SELECT
    sf.sf_account_id,
    sf.sf_account_name,
    sf.plat_id__c AS sf_plat_id__c,
    pid.intacct_customer_id,
    pid.platt_match_rule,
    pid.platt_match_confidence,
    sf.lastmodifieddate,
    sf.createddate
  FROM sf
  JOIN platt p
    ON p.platt_customer_id = sf.plat_id__c
  JOIN platt_intacct_dedup pid
    ON pid.platt_customer_id = sf.plat_id__c
   AND pid.rn = 1
), dedup AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY intacct_customer_id
      ORDER BY lastmodifieddate DESC NULLS LAST, createddate DESC NULLS LAST, sf_account_id
    ) AS rn
  FROM sf_platt_intacct
)
SELECT
  sf_account_id,
  sf_account_name,
  sf_plat_id__c,
  intacct_customer_id,
  CONCAT('sf_plat_id__c_to_platt_to_intacct:', platt_match_rule) AS match_rule,
  platt_match_confidence AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM dedup
WHERE rn = 1;
