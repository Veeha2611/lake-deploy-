-- SSOT for Salesforce Accounts (raw -> curated -> current -> ssot)

-- Raw curated view (normalizes dates from ISO 8601 with +0000 suffix).
-- Use latest AppFlow partition only to avoid stale or mixed snapshots.
CREATE OR REPLACE VIEW curated_core.salesforce_account_curated_raw AS
WITH latest_partition AS (
  SELECT max(concat(year, '-', month, '-', day)) AS max_ymd
  FROM raw_salesforce_prod_appflow.account
), direct_latest AS (
  SELECT max(run_date) AS max_run_date
  FROM raw_salesforce_direct.account_guarantor
)
SELECT
  a.id,
  a.name,
  a.lastmodifieddate,
  a.systemmodstamp,
  a.ownerid,
  a.createddate,
  a.plat_id__c,
  direct.plat_guarantor_id__c,
  a.customer_id__c,
  a.authorization_number__c,
  a.primary_system_id__c,
  a.system_id_name__c,
  a.active__c,
  a.current_mrr__c,
  a.vertical__c,
  a.type,
  a.billingstreet,
  a.billingcity,
  a.billingstate,
  a.billingpostalcode,
  CAST(
    COALESCE(
      TRY(CAST(date_parse(concat(a.year, '-', a.month, '-', a.day), '%Y-%m-%d') AS date)),
      current_date
    ) AS varchar
  ) AS run_date,
  CAST(
    COALESCE(
      TRY(CAST(a.createddate AS date)),
      TRY(CAST(from_iso8601_timestamp(regexp_replace(CAST(a.createddate AS varchar), '([+-]\\d{2})(\\d{2})$', '$1:$2')) AS date)),
      TRY(CAST(date_parse(CAST(a.createddate AS varchar), '%m/%d/%Y') AS date)),
      TRY(CAST(date_parse(CAST(a.createddate AS varchar), '%Y-%m-%d') AS date))
    ) AS date
  ) AS business_date,
  CAST(
    COALESCE(
      TRY(CAST(a.systemmodstamp AS date)),
      TRY(CAST(from_iso8601_timestamp(regexp_replace(CAST(a.systemmodstamp AS varchar), '([+-]\\d{2})(\\d{2})$', '$1:$2')) AS date)),
      TRY(CAST(date_parse(CAST(a.systemmodstamp AS varchar), '%m/%d/%Y') AS date)),
      TRY(CAST(date_parse(CAST(a.systemmodstamp AS varchar), '%Y-%m-%d') AS date))
    ) AS date
  ) AS updated_at
FROM raw_salesforce_prod_appflow.account a
LEFT JOIN raw_salesforce_direct.account_guarantor direct
  ON direct.id = a.id
 AND direct.run_date = (SELECT max_run_date FROM direct_latest)
WHERE concat(a.year, '-', a.month, '-', a.day) = (SELECT max_ymd FROM latest_partition);

-- Latest current snapshot (dedupe on id).
CREATE OR REPLACE VIEW curated_core.salesforce_account_current AS
WITH ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY id
      ORDER BY updated_at DESC NULLS LAST, run_date DESC
    ) AS _rn
  FROM curated_core.salesforce_account_curated_raw
)
SELECT *
FROM ranked
WHERE _rn = 1
  AND id IS NOT NULL
  AND (business_date IS NULL OR business_date <= date_add('day', 1, CAST(run_date AS date)));

-- Exceptions: future-dated business_date.
CREATE OR REPLACE VIEW curated_recon.salesforce_account_exceptions AS
SELECT
  'future_dated_business_date' AS reason_code,
  *
FROM curated_core.salesforce_account_curated_raw
WHERE business_date IS NOT NULL
  AND business_date > current_date + INTERVAL '1' day;

-- SSOT view.
CREATE OR REPLACE VIEW curated_core.salesforce_account_current_ssot AS
SELECT *
FROM curated_core.salesforce_account_curated_raw
WHERE business_date IS NULL OR business_date <= current_date + INTERVAL '1' day;
