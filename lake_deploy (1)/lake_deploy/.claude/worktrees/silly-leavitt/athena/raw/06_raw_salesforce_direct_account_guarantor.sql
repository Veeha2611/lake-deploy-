-- Raw Salesforce direct extract: Account plat_guarantor_id__c (read-only API pull)
CREATE DATABASE IF NOT EXISTS raw_salesforce_direct;

CREATE EXTERNAL TABLE IF NOT EXISTS raw_salesforce_direct.account_guarantor (
  id string,
  plat_guarantor_id__c string
)
PARTITIONED BY (run_date string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES (
  'ignore.malformed.json' = 'true'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/salesforce_direct/account_guarantor/'
TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.run_date.type'='date',
  'projection.run_date.format'='yyyy-MM-dd',
  'projection.run_date.range'='2020-01-01,NOW',
  'storage.location.template'='s3://gwi-raw-us-east-2-pc/raw/salesforce_direct/account_guarantor/run_date=${run_date}/'
);
