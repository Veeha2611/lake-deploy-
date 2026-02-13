-- Platt MRR rollup (monthly) using curated 24m as-billed parquet.
-- This ensures at least 12 fully reconciled months for SSOT.
CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt_full AS
WITH norm AS (
  SELECT
    -- platt_as_billed_24m_parquet.period_month can be TIMESTAMP depending on CTAS;
    -- force DATE so downstream views/queries stay type-stable.
    CAST(period_month AS date) AS period_month,
    customer_id,
    customer_name,
    crid,
    gl_item,
    TRY(CAST(line_amount AS double)) AS line_amount
  FROM curated_core.platt_as_billed_24m_parquet
  WHERE period_month IS NOT NULL
)
SELECT
  period_month,
  customer_id,
  customer_name,
  crid,
  SUM(CASE WHEN line_amount > 0 AND gl_item LIKE 'SVC#%' THEN line_amount ELSE 0 END) AS mrr_service,
  SUM(CASE WHEN line_amount > 0 AND (gl_item IS NULL OR NOT (gl_item LIKE 'SVC#%')) THEN line_amount ELSE 0 END) AS mrr_other,
  SUM(CASE WHEN line_amount > 0 THEN line_amount ELSE 0 END) AS mrr_total
FROM norm
GROUP BY period_month, customer_id, customer_name, crid;

-- Convenience alias used by MAC app + SSOT queries.
CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt AS
SELECT *
FROM curated_core.v_monthly_mrr_platt_full;
