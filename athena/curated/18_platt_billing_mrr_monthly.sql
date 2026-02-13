-- Platt billing MRR rollup (monthly, parent-billed, full history).
-- Source: raw_platt.idetail_raw + raw_platt.iheader_raw (latest dt only).
-- Logic: roll up to guarantor if billed-to parent; exclude taxes/fees/credits per ops list.
CREATE OR REPLACE VIEW curated_core.v_platt_billing_mrr_monthly AS
WITH exclude_items(item) AS (
  VALUES
    ('<WR/OFF>'),('CHGBAK'),('CRDTFPWS'),('CREDIT'),('CRTSYCRDT'),('CRWRITEOFF'),
    ('MECTRENTR'),('MPCREDIT'),('NOUSE'),('PROMOCRDT'),('REFBONUS'),('REFUND'),('REFUNDCK'),
    ('SVC#173'),('CHG#173'),('SVC#730'),('CHG#730'),('SVC#778'),('SVCINKIND'),('VWSUSAGE'),
    ('WRITE-OFF'),('XFER'),('CUSTSVCRDT'),('SVCINTCRDT'),('SVC#828'),('CHG#828'),('DVFIBERCRDT'),
    ('BACKUPGIG'),('BBMODEM'),('CHG#135'),('CHG#136'),('CHG#137'),('SVC#227'),('CHG#227'),
    ('SVC#686'),('CHG#686'),('SVC#689'),('CHG#689'),('SVC#712'),('CHG#712'),('SVC#713'),
    ('CHG#713'),('SVC#733'),('CHG#733'),('SVC#752'),('CHG#752'),('SVC#753'),('CHG#753'),
    ('SVC#755'),('CHG#755'),('SVC#756'),('CHG#756'),('SVC#757'),('CHG#757'),('SVC#758'),
    ('CHG#758'),('SVC#759'),('CHG#759'),('SVC#760'),('CHG#760'),('SVC#761'),('CHG#761'),
    ('SVC#762'),('CHG#762'),('SVC#763'),('CHG#763'),('SVC#764'),('CHG#764'),('SVC#779'),
    ('CHG#779'),('SVC#781'),('CHG#781'),('COMSERVCAL'),('CONFIGWRK'),('LATEFEE'),('MSSUPPORT'),
    ('NRADDLISTB'),('NRCCLR'),('NRCCLREX'),('NRSAC'),('NRSOCC'),('PROSVC'),('RESSVCWK'),
    ('RESTORE1'),('RESTORE2'),('RESTORE3'),('RETCHK'),('RETURNS'),('SVC#805'),('SVC#806'),
    ('SVC#807'),('SVC#808'),('SVC#810'),('SVC#811'),('SVC#813'),('SVC#814'),('SVC#815'),
    ('SVC#816'),('SVC#817'),('SVC#820'),('CHG#805'),('CHG#806'),('CHG#807'),('CHG#808'),
    ('CHG#810'),('CHG#811'),('CHG#812'),('CHG#813'),('CHG#814'),('CHG#815'),('CHG#816'),
    ('CHG#817'),('CHG#820'),('SVC#799'),('CHG#799'),('SVC#800'),('CHG#800'),('SVC#801'),
    ('CHG#801'),('SVC#802'),('CHG#802'),('SVC#803'),('CHG#803'),('SVC#804'),('CHG#804'),
    ('SVC#824'),('CHG#824'),('SVC#852'),('CHG#852'),('SVC#922'),('CHG#922'),('SVC#923'),
    ('CHG#923'),('FBRCONT'),('SVC#901'),('CHG#901'),('SVC#902'),('CHG#902'),('SVC#903'),
    ('CHG#903'),('SVC#912'),('CHG#912'),('SVC#913'),('CHG#913')
),
latest_idetail AS (
  SELECT *
  FROM raw_platt.idetail_raw
  WHERE dt = (SELECT max(dt) FROM raw_platt.idetail_raw)
),
latest_iheader AS (
  SELECT *
  FROM raw_platt.iheader_raw
  WHERE dt = (SELECT max(dt) FROM raw_platt.iheader_raw)
),
base AS (
  SELECT
    CASE
      WHEN try_cast(ih.guarantor AS bigint) = 0 OR ih.guarantor IS NULL
        THEN try_cast(ih.customer AS bigint)
      ELSE try_cast(ih.guarantor AS bigint)
    END AS customer_id,
    date_trunc('month', try_cast(substr(id.date, 1, 10) AS date)) AS period_month,
    COALESCE(try_cast(id.price AS double), 0) * COALESCE(try_cast(id.qty AS double), 0) AS line_total
  FROM latest_idetail id
  JOIN latest_iheader ih
    ON id.invoice = ih.invoice
  LEFT JOIN exclude_items ei
    ON upper(coalesce(id.item, '')) = ei.item
  WHERE try_cast(substr(id.date, 1, 10) AS date) IS NOT NULL
    AND ei.item IS NULL
    AND coalesce(ih.comment, '') NOT LIKE '%Automatically%'
    AND upper(coalesce(id.item, '')) NOT LIKE '%EARLY%'
    AND upper(coalesce(id.item, '')) NOT LIKE '%TAX#%'
    AND coalesce(id.descriptio, '') NOT LIKE '%ConnectME - Statewide Broadband%'
    AND coalesce(id.descriptio, '') NOT LIKE '%E911 State/County Chrg%'
)
SELECT
  period_month,
  SUM(line_total) AS total_mrr,
  COUNT(DISTINCT CASE WHEN line_total <> 0 THEN customer_id END) AS customer_count,
  COUNT(DISTINCT customer_id) AS billed_customers
FROM base
GROUP BY 1;
