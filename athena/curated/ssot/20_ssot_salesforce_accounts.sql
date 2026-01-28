-- SSOT for Salesforce Accounts
CREATE OR REPLACE VIEW curated_core.salesforce_account_curated_raw AS
SELECT
  id,
  name,
  lastmodifieddate,
  systemmodstamp,
  ownerid,
  createddate,
  plat_id__c,
  customer_id__c,
  authorization_number__c,
  primary_system_id__c,
  system_id_name__c,
  active__c,
  current_mrr__c,
  vertical__c,
  type,
  billingstreet,
  billingcity,
  billingstate,
  billingpostalcode,
  run_date,
  business_date,
  updated_at
FROM curated_core.salesforce_account_current;

CREATE OR REPLACE VIEW curated_recon.salesforce_account_exceptions AS
SELECT
  'future_dated_business_date' AS reason_code,
  *
FROM curated_core.salesforce_account_curated_raw
WHERE business_date IS NOT NULL
  AND business_date > current_date + INTERVAL '1' day;

CREATE OR REPLACE VIEW curated_core.salesforce_account_current_ssot AS
SELECT *
FROM curated_core.salesforce_account_curated_raw
WHERE business_date IS NULL OR business_date <= current_date + INTERVAL '1' day;
