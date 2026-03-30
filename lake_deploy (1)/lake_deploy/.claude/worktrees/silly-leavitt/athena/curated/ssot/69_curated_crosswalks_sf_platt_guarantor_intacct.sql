-- Curated crosswalks: Salesforce -> Platt (guarantor) -> Intacct (deterministic 1:1)
CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_platt_guarantor
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_platt_guarantor/'
) AS
WITH sf AS (
  SELECT
    id AS sf_account_id,
    name AS sf_account_name,
    plat_guarantor_id__c
  FROM curated_core.salesforce_account_current
  WHERE plat_guarantor_id__c IS NOT NULL
    AND TRIM(plat_guarantor_id__c) <> ''
    AND TRIM(plat_guarantor_id__c) <> '0'
), platt AS (
  SELECT
    id AS platt_customer_id,
    guarantor
  FROM curated_core.platt_customer_current_ssot
  WHERE guarantor IS NOT NULL
    AND TRIM(guarantor) <> ''
    AND TRIM(guarantor) <> '0'
), platt_intacct AS (
  SELECT
    platt_customer_id,
    intacct_customer_id,
    match_rule AS platt_match_rule,
    match_confidence AS platt_match_confidence
  FROM curated_crosswalks.platt_to_intacct_customer_1to1
  WHERE platt_customer_id IS NOT NULL AND intacct_customer_id IS NOT NULL
), base AS (
  SELECT
    sf.sf_account_id,
    sf.sf_account_name,
    sf.plat_guarantor_id__c,
    p.platt_customer_id,
    pi.intacct_customer_id,
    pi.platt_match_rule,
    pi.platt_match_confidence
  FROM sf
  JOIN platt p
    ON sf.plat_guarantor_id__c = p.guarantor
  JOIN platt_intacct pi
    ON pi.platt_customer_id = p.platt_customer_id
), sf_dups AS (
  SELECT sf_account_id, COUNT(DISTINCT intacct_customer_id) AS ct
  FROM base
  GROUP BY 1
), ic_dups AS (
  SELECT intacct_customer_id, COUNT(DISTINCT sf_account_id) AS ct
  FROM base
  GROUP BY 1
), filtered AS (
  SELECT b.*
  FROM base b
  JOIN sf_dups s ON b.sf_account_id = s.sf_account_id AND s.ct = 1
  JOIN ic_dups i ON b.intacct_customer_id = i.intacct_customer_id AND i.ct = 1
)
SELECT
  sf_account_id,
  sf_account_name,
  CAST(NULL AS varchar) AS sf_customer_id__c,
  intacct_customer_id,
  CAST(NULL AS varchar) AS intacct_customer_recordno,
  CAST(NULL AS varchar) AS intacct_customer_name,
  CONCAT('sf_plat_guarantor_id__c_to_platt_guarantor_to_intacct:', platt_match_rule) AS match_rule,
  platt_match_confidence AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;
