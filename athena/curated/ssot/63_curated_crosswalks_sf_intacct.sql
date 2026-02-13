-- Curated crosswalks: Salesforce ↔ Intacct (deterministic candidate set)
CREATE DATABASE IF NOT EXISTS curated_crosswalks;

CREATE EXTERNAL TABLE IF NOT EXISTS curated_crosswalks.sf_account_to_intacct_customer (
  sf_account_id string,
  sf_account_name string,
  sf_customer_id__c string,
  intacct_customer_id string,
  intacct_customer_recordno string,
  intacct_customer_name string,
  match_rule string,
  match_confidence double,
  created_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_crosswalks/sf_account_to_intacct_customer/';
