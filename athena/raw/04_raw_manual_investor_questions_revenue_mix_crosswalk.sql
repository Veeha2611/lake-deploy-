CREATE DATABASE IF NOT EXISTS raw_manual;

DROP TABLE IF EXISTS raw_manual.revenue_mix_platt_system_crosswalk;
CREATE EXTERNAL TABLE raw_manual.revenue_mix_platt_system_crosswalk (
  network string,
  gwi_system string,
  match_rule string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/manual/investor_questions/dt=2026-02-05/revenue_mix_platt_system_crosswalk/'
TBLPROPERTIES ('skip.header.line.count'='1');
