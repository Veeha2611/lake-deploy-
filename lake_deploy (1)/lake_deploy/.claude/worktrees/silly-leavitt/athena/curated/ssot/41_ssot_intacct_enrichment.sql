-- Intacct SSOT enrichment with latest COA + Sage dimensions

CREATE OR REPLACE VIEW curated_finance.coa_accounts_latest AS
SELECT *
FROM curated_finance.coa_accounts
WHERE extracted_at_utc = (
  SELECT max(extracted_at_utc) FROM curated_finance.coa_accounts
);

CREATE OR REPLACE VIEW curated_finance.sage_dimensions_latest AS
SELECT *
FROM curated_finance.sage_dimensions
WHERE extracted_at_utc = (
  SELECT max(extracted_at_utc) FROM curated_finance.sage_dimensions
);

CREATE OR REPLACE VIEW curated_core.intacct_gl_entries_current_ssot AS
SELECT
  gl.*, 
  coa.title AS account_title,
  coa.category AS account_category,
  coa.normal_balance AS account_normal_balance,
  coa.period_end_closing_type AS account_period_end_closing_type,
  coa.close_into_account AS account_close_into_account,
  coa.department AS coa_department,
  coa.location AS coa_location,
  coa.disallow_direct_posting AS coa_disallow_direct_posting,
  cust.dimension_value_label AS customer_name_dim,
  vend.dimension_value_label AS vendor_name_dim
FROM curated_core.intacct_gl_entries_curated_raw gl
LEFT JOIN curated_finance.coa_accounts_latest coa
  ON gl.accountno = coa.account_number
LEFT JOIN curated_finance.sage_dimensions_latest cust
  ON cust.dimension_name = 'Customers'
 AND CAST(cust.dimension_value_id AS varchar) = gl.customerid
LEFT JOIN curated_finance.sage_dimensions_latest vend
  ON vend.dimension_name = 'Vendors'
 AND CAST(vend.dimension_value_id AS varchar) = gl.vendorid
WHERE gl.business_date IS NULL
   OR gl.business_date <= current_date + INTERVAL '1' day;
