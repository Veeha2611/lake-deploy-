-- Platt reconciliation summary
SELECT 'customer' AS table_name, COUNT(*) AS row_count FROM raw_platt.customer
UNION ALL
SELECT 'iheader_raw' AS table_name, COUNT(*) AS row_count FROM raw_platt.iheader_raw
UNION ALL
SELECT 'idetail_raw' AS table_name, COUNT(*) AS row_count FROM raw_platt.idetail_raw
UNION ALL
SELECT 'billing' AS table_name, COUNT(*) AS row_count FROM raw_platt.billing
UNION ALL
SELECT 'custrate_raw' AS table_name, COUNT(*) AS row_count FROM raw_platt.custrate_raw;

-- Key totals (billing summary file)
SELECT SUM(CAST(total_billed_last_12m AS DOUBLE)) AS total_billed_last_12m_sum
FROM raw_platt.billing_summary;
