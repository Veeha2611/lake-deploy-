CREATE DATABASE IF NOT EXISTS raw_manual;

DROP TABLE IF EXISTS raw_manual.investor_questions_revenue_mix_sections_long;
CREATE EXTERNAL TABLE raw_manual.investor_questions_revenue_mix_sections_long (
  section string,
  network string,
  category string,
  month_label string,
  month_actual string,
  amount double
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/revenue_mix_sections_long/'
TBLPROPERTIES ('skip.header.line.count'='1');

DROP TABLE IF EXISTS raw_manual.investor_questions_revenue_mix_mapping_matrix_accounts;
CREATE EXTERNAL TABLE raw_manual.investor_questions_revenue_mix_mapping_matrix_accounts (
  network string,
  account_code string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/revenue_mix_mapping_matrix_accounts/'
TBLPROPERTIES ('skip.header.line.count'='1');

DROP TABLE IF EXISTS raw_manual.investor_questions_revenue_mix_mapped_to_account_long;
CREATE EXTERNAL TABLE raw_manual.investor_questions_revenue_mix_mapped_to_account_long (
  account_code string,
  month_label string,
  month_actual string,
  amount double
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/revenue_mix_mapped_to_account_long/'
TBLPROPERTIES ('skip.header.line.count'='1');
