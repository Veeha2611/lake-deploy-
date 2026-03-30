-- Platt raw tables with pipe-delimited SerDe
-- Use only if Platt exports are re-delimited to '|'

CREATE TABLE IF NOT EXISTS raw_platt.iheader_raw (
  "invoice" string,
  "customer" string,
  "shipname" string,
  "shipaddr1" string,
  "shipaddr2" string,
  "shipcity" string,
  "shipstate" string,
  "shipcountry" string,
  "shipzip" string,
  "phone" string,
  "total" string,
  "date" string,
  "subtotal" string,
  "guarantor" string,
  "paid" string,
  "timestamp" string,
  "comment" string,
  "staffnum" string,
  "batchid" string,
  "stmtdate" string,
  "taxtotal" string,
  "batchexclude" string,
  "ih_storeid" string,
  "ih_locked" string,
  "ih_tax_transaction" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'='|',
  'quoteChar'='\"',
  'escapeChar'='\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/iheader'
TBLPROPERTIES ('skip.header.line.count'='0');

CREATE TABLE IF NOT EXISTS raw_platt.idetail_raw (
  "invoice" string,
  "item" string,
  "descriptio" string,
  "qty_old" string,
  "price" string,
  "date" string,
  "customer" string,
  "sdate" string,
  "edate" string,
  "timestamp" string,
  "profileid" string,
  "id_item_code" string,
  "id_taxable_amt" string,
  "id_item_instock" string,
  "id_extended" string,
  "id_category_id" string,
  "id_subcategory_id" string,
  "id_tax_group_id" string,
  "id_qty_instock" string,
  "id_cost" string,
  "id_storeid" string,
  "id_labor" string,
  "id_tax_exempt" string,
  "id_tax_included" string,
  "id_labor_category_id" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'='|',
  'quoteChar'='\"',
  'escapeChar'='\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/idetail'
TBLPROPERTIES ('skip.header.line.count'='0');

CREATE TABLE IF NOT EXISTS raw_platt.customer (
  "customer" string,
  "company" string,
  "firstname" string,
  "lastname" string,
  "address1" string,
  "address2" string,
  "city" string,
  "state" string,
  "zip" string,
  "country" string,
  "phone" string,
  "phone2" string,
  "fax" string,
  "email" string,
  "groupid" string,
  "rep" string,
  "status" string,
  "type" string,
  "terms" string,
  "credlimit" string,
  "created" string,
  "modified" string,
  "taxable" string,
  "taxid" string,
  "c_storeid" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'='|',
  'quoteChar'='\"',
  'escapeChar'='\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/customer'
TBLPROPERTIES ('skip.header.line.count'='0');

CREATE TABLE IF NOT EXISTS raw_platt.custrate_raw (
  "customer" string,
  "item" string,
  "rate" string,
  "discount" string,
  "timestamp" string,
  "credated" string,
  "expdate" string,
  "pricelevel" string,
  "rep" string,
  "cr_storeid" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'='|',
  'quoteChar'='\"',
  'escapeChar'='\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/custrate'
TBLPROPERTIES ('skip.header.line.count'='0');
