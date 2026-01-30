CREATE DATABASE IF NOT EXISTS gwi_raw;

CREATE EXTERNAL TABLE IF NOT EXISTS gwi_raw.raw_salesforce_opportunities (
  sf_opportunity_id STRING,
  account_id STRING,
  stage STRING,
  amount DOUBLE,
  close_date DATE,
  probability DOUBLE
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/salesforce/opportunities/';
