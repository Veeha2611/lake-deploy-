-- Curated crosswalks: Salesforce -> Intacct (hybrid = plat_id bridge + name+ZIP fallback)
CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_final
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_final/'
) AS
WITH hybrid AS (
  SELECT
    sf_account_id,
    sf_account_name,
    NULL AS sf_customer_id__c,
    intacct_customer_id,
    NULL AS intacct_customer_recordno,
    NULL AS intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_hybrid
), auth AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_auth
), addr_platt AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_addr_platt
), addr_intacct AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_addr_intacct
), name_zip AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_name_zip
  WHERE sf_account_id IS NOT NULL AND intacct_customer_id IS NOT NULL
), plat_guarantor AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_platt_guarantor
  WHERE sf_account_id IS NOT NULL AND intacct_customer_id IS NOT NULL
), addr_only_raw AS (
  SELECT
    sf_account_id,
    sf_account_name,
    sf_customer_id__c,
    intacct_customer_id,
    intacct_customer_recordno,
    intacct_customer_name,
    match_rule,
    match_confidence,
    created_at
  FROM curated_crosswalks.sf_account_to_intacct_customer_addr_only
  WHERE sf_account_id IS NOT NULL AND intacct_customer_id IS NOT NULL
), addr_only AS (
  SELECT ao.*
  FROM addr_only_raw ao
  LEFT JOIN hybrid h
    ON h.intacct_customer_id = ao.intacct_customer_id
   OR h.sf_account_id = ao.sf_account_id
  LEFT JOIN auth a
    ON a.intacct_customer_id = ao.intacct_customer_id
   OR a.sf_account_id = ao.sf_account_id
  LEFT JOIN addr_platt ap
    ON ap.intacct_customer_id = ao.intacct_customer_id
   OR ap.sf_account_id = ao.sf_account_id
  LEFT JOIN addr_intacct ai
    ON ai.intacct_customer_id = ao.intacct_customer_id
   OR ai.sf_account_id = ao.sf_account_id
  LEFT JOIN plat_guarantor pg
    ON pg.intacct_customer_id = ao.intacct_customer_id
   OR pg.sf_account_id = ao.sf_account_id
  WHERE h.intacct_customer_id IS NULL
    AND h.sf_account_id IS NULL
    AND a.intacct_customer_id IS NULL
    AND a.sf_account_id IS NULL
    AND ap.intacct_customer_id IS NULL
    AND ap.sf_account_id IS NULL
    AND ai.intacct_customer_id IS NULL
    AND ai.sf_account_id IS NULL
    AND pg.intacct_customer_id IS NULL
    AND pg.sf_account_id IS NULL
), residual AS (
  SELECT nz.*
  FROM name_zip nz
  LEFT JOIN hybrid h
    ON h.intacct_customer_id = nz.intacct_customer_id
   OR h.sf_account_id = nz.sf_account_id
  LEFT JOIN auth a
    ON a.intacct_customer_id = nz.intacct_customer_id
   OR a.sf_account_id = nz.sf_account_id
  LEFT JOIN addr_platt ap
    ON ap.intacct_customer_id = nz.intacct_customer_id
   OR ap.sf_account_id = nz.sf_account_id
  LEFT JOIN addr_intacct ai
    ON ai.intacct_customer_id = nz.intacct_customer_id
   OR ai.sf_account_id = nz.sf_account_id
  LEFT JOIN addr_only ao
    ON ao.intacct_customer_id = nz.intacct_customer_id
   OR ao.sf_account_id = nz.sf_account_id
  LEFT JOIN plat_guarantor pg
    ON pg.intacct_customer_id = nz.intacct_customer_id
   OR pg.sf_account_id = nz.sf_account_id
  WHERE h.intacct_customer_id IS NULL
    AND h.sf_account_id IS NULL
    AND a.intacct_customer_id IS NULL
    AND a.sf_account_id IS NULL
    AND ap.intacct_customer_id IS NULL
    AND ap.sf_account_id IS NULL
    AND ai.intacct_customer_id IS NULL
    AND ai.sf_account_id IS NULL
    AND ao.intacct_customer_id IS NULL
    AND ao.sf_account_id IS NULL
    AND pg.intacct_customer_id IS NULL
    AND pg.sf_account_id IS NULL
)
SELECT * FROM hybrid
UNION ALL
SELECT * FROM auth
UNION ALL
SELECT * FROM addr_platt
UNION ALL
SELECT * FROM addr_intacct
UNION ALL
SELECT * FROM plat_guarantor
UNION ALL
SELECT * FROM addr_only
UNION ALL
SELECT * FROM residual;
