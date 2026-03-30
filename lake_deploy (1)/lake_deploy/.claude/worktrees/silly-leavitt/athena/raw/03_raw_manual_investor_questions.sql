CREATE DATABASE IF NOT EXISTS raw_manual;

-- Investor Questions workbook (Customer Mix) raw export
CREATE EXTERNAL TABLE IF NOT EXISTS raw_manual.investor_questions_customer_mix (
  network string,
  network_type string,
  customer_type string,
  access_type string,
  unnamed_4 string,
  passings string,
  subscriptions string,
  arpu string,
  gross_margins string,
  operator_margins string,
  churn_monthly string,
  churn_yearly string,
  trends string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/customer_mix/'
TBLPROPERTIES ('skip.header.line.count'='1');

-- Customer Mix normalized (currently same as raw export)
CREATE EXTERNAL TABLE IF NOT EXISTS raw_manual.investor_questions_customer_mix_long (
  network string,
  network_type string,
  customer_type string,
  access_type string,
  unnamed_4 string,
  passings string,
  subscriptions string,
  arpu string,
  gross_margins string,
  operator_margins string,
  churn_monthly string,
  churn_yearly string,
  trends string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/customer_mix_long/'
TBLPROPERTIES ('skip.header.line.count'='1');

-- Revenue Mix normalized long export (network/category/month_label/amount)
CREATE EXTERNAL TABLE IF NOT EXISTS raw_manual.investor_questions_revenue_mix_long (
  network string,
  category string,
  month_label string,
  amount string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/revenue_mix_long/'
TBLPROPERTIES ('skip.header.line.count'='1');
