-- Curated crosswalks: Salesforce -> Intacct via authorization_number__c (deterministic 1:1)
CREATE TABLE curated_crosswalks.sf_account_to_intacct_customer_auth
WITH (
  format = 'PARQUET',
  external_location = 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer_auth/'
) AS
WITH base AS (
  SELECT
    sf.id AS sf_account_id,
    sf.name AS sf_account_name,
    sf.authorization_number__c AS sf_authorization_number__c,
    ic.customerid AS intacct_customer_id,
    CAST(ic.recordno AS varchar) AS intacct_customer_recordno,
    ic.name AS intacct_customer_name
  FROM curated_core.salesforce_account_current sf
  JOIN gwi_raw_intacct.customers ic
    ON sf.authorization_number__c = CAST(ic.recordno AS varchar)
  WHERE sf.authorization_number__c IS NOT NULL
    AND TRIM(sf.authorization_number__c) <> ''
    AND ic.recordno IS NOT NULL
    AND ic.customerid IS NOT NULL
), sf_dups AS (
  SELECT sf_account_id, COUNT(*) AS ct
  FROM base
  GROUP BY 1
), ic_dups AS (
  SELECT intacct_customer_id, COUNT(*) AS ct
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
  intacct_customer_recordno,
  intacct_customer_name,
  'sf_authorization_number__c_to_intacct_recordno' AS match_rule,
  0.90 AS match_confidence,
  CAST(current_timestamp AS timestamp) AS created_at
FROM filtered;
