-- Refresh Salesforce account segment view to avoid missing column failures.

CREATE OR REPLACE VIEW raw_salesforce.v_account_segment AS
SELECT
  Id AS sf_account_id,
  Name AS sf_account_name,
  Type AS type,
  CASE
    WHEN Type = 'Residential' THEN 'residential'
    WHEN Type IS NOT NULL THEN 'commercial'
    ELSE 'unknown'
  END AS segment
FROM raw_salesforce.accounts;
