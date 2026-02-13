-- Raw Platt external tables (CSV)
CREATE DATABASE IF NOT EXISTS raw_platt;

-- Source: dbo.customer
CREATE TABLE IF NOT EXISTS raw_platt.customer (
  "id" string,
  "name" string,
  "guarantor" string,
  "date" string,
  "active" string,
  "staffnum" string,
  "timestamp" string,
  "attn" string,
  "addr1" string,
  "addr2" string,
  "city" string,
  "state" string,
  "country" string,
  "zip" string,
  "phone" string,
  "fax" string,
  "username" string,
  "password" string,
  "email" string,
  "stmtmethod" string,
  "laststmt" string,
  "nextstmt" string,
  "custbillday" string,
  "nostatement" string,
  "nolatenotice" string,
  "nodeactivate" string,
  "nocloseout" string,
  "noreceipt" string,
  "latedate" string,
  "deactivatedate" string,
  "referralid" string,
  "referral" string,
  "comment" string,
  "cctype" string,
  "ccnumber" string,
  "ccdate" string,
  "acctnumber" string,
  "timeleft" string,
  "blockuser" string,
  "blocktype" string,
  "shellid" string,
  "websignup" string,
  "ponumber" string,
  "routenumber" string,
  "damount" string,
  "dtype" string,
  "salesid" string,
  "lastusername" string,
  "latefeetype" string,
  "latefeeamt" string,
  "lastlatefee" string,
  "c_pop_id" string,
  "lastrcpt" string,
  "bank_acct_type" string,
  "bank_name" string,
  "storeid" string,
  "blacklist" string,
  "gracedate" string,
  "htmlemail" string,
  "closeoutdate" string,
  "Stmtamnt" string,
  "osrsusername" string,
  "osrspassword" string,
  "signup_ip" string,
  "reg_code_number" string,
  "gwi_aft" string,
  "gwi_sano" string,
  "gwi_sasf" string,
  "gwi_sasd" string,
  "gwi_sasn" string,
  "gwi_sath" string,
  "gwi_sass" string,
  "gwi_route" string,
  "gwi_box" string,
  "gwi_ld1" string,
  "gwi_lv1" string,
  "gwi_ld2" string,
  "gwi_lv2" string,
  "gwi_ld3" string,
  "gwi_lv3" string,
  "gwi_lq_state" string,
  "gwi_lq_city" string,
  "gwi_lq_zip" string,
  "gwi_lq_phone" string,
  "gwi_last_qualified_date" string,
  "gwi_xdsl_qualified_p" string,
  "gwi_xdsl_reason_not_qualified" string,
  "gwi_loop_length" string,
  "gwi_has_dsl_p" string,
  "gwi_eatn" string,
  "gwi_loop_product_available" string,
  "gwi_last_message" string,
  "gwi_wire_center_id" string,
  "gwi_qualified_p" string,
  "gwi_reason_not_qualified" string,
  "gwi_voice_provider_id" string,
  "gwi_existing_dsl_circuit_id" string,
  "gwi_clli" string,
  "refuser" string,
  "parentuser" string,
  "gwi_legacy_id" string,
  "birthday" string,
  "gwi_marketpartner" string,
  "gwi_promocode" string,
  "gwi_customer_type" string,
  "gwi_source_date" string,
  "gwi_rate_center_id" string,
  "gwi_tandem_id" string,
  "gwi_custom_message_id" string,
  "gwi_osg_statement" string,
  "gwi_enable_late_fee_billing_p" string,
  "gwi_begin_rating_date" string,
  "gwi_revert_to_paper" string,
  "latitude" string,
  "longitude" string,
  "gwi_do_not_email_p" string,
  "gwi_promo_exclude_p" string,
  "gwi_latitude" string,
  "gwi_longitude" string,
  "gwi_geocoded_timestamp" string,
  "usage_invoice_type" string,
  "invoice_detail_type" string,
  "exclude_from_late_fees_p" string,
  "sensitive_p" string,
  "device_password" string,
  "gwi_partner" string,
  "gwi_partner_email" string,
  "gwi_partner_notifications_p" string,
  "account_group" string,
  "gwi_company_id" string,
  "gwi_maintenance_notifications_p" string,
  "gwi_maintenance_email" string,
  "gwi_maintenance_notifications_all_p" string,
  "gwi_migration_id" string,
  "gwi_company_account_id" string,
  "gwi_outage_notifications_p" string,
  "gwi_outage_email" string,
  "authorization_pin" string,
  "device_ip" string,
  "customer_ip" string,
  "promotion_code" string,
  "source_code" string,
  "gwi_data_source" string,
  "paperfee" string,
  "lastpaperfee" string,
  "qualification" string,
  "lastpasswordreset" string,
  "county" string,
  "gwi_system" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/customer'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);

-- Source: dbo.iheader
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
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/iheader'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);

-- Source: dbo.idetail
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
  "qty" string,
  "pkey" string,
  "id_rg_id" string,
  "id_svc_id" string,
  "id_sbd_id" string,
  "id_rate_id" string,
  "id_prorated" string,
  "id_data_id" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/idetail'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);

-- Source: dbo.custrate
CREATE TABLE IF NOT EXISTS raw_platt.custrate_raw (
  "crid" string,
  "custid" string,
  "rgid" string,
  "lastbilled" string,
  "nextbill" string,
  "billguar" string,
  "dateadded" string,
  "cr_frequency" string,
  "cr_discount_amount" string,
  "cr_discount_type" string,
  "cr_quantity" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/custrate'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);


-- Source: lake-side derived/exported billing summary (do not assume a 1:1 native table name)
CREATE TABLE IF NOT EXISTS raw_platt.billing_summary (
  "crid" string,
  "customer_id" string,
  "customer_name" string,
  "total_billed_last_12m" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/billing_summary'
TBLPROPERTIES (
  'skip.header.line.count'='1'
);

-- Source: gwi.middleware_plat_billings
CREATE TABLE IF NOT EXISTS raw_platt.billing (
  "id" string,
  "name" string,
  "guarantor" string,
  "iyear" string,
  "imonth" string,
  "iday" string,
  "yyyymmdd" string,
  "nrr" string,
  "credits" string,
  "fees" string,
  "taxes" string,
  "usage" string,
  "mrr" string,
  "bill_date" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/billing'
TBLPROPERTIES (
  'skip.header.line.count'='1'
);

-- History tables (audit trail)
-- Source: dbo.iheader__History
CREATE TABLE IF NOT EXISTS raw_platt.iheader_history (
  "history_id" string,
  "history_added_date" string,
  "history_action_type_id" string,
  "history_sys_user" string,
  "history_cur_user" string,
  "history_host" string,
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
  "ih_locked" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/iheader_history'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);

-- Source: dbo.idetail__History
CREATE TABLE IF NOT EXISTS raw_platt.idetail_history (
  "history_id" string,
  "history_added_date" string,
  "history_action_type_id" string,
  "history_sys_user" string,
  "history_cur_user" string,
  "history_host" string,
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
  "qty" string,
  "pkey" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/idetail_history'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);

-- Source: dbo.custrate__History
CREATE TABLE IF NOT EXISTS raw_platt.custrate_history (
  "history_id" string,
  "history_added_date" string,
  "history_action_type_id" string,
  "deleted_by_staff_id" string,
  "deleted_by_system_user" string,
  "crid" string,
  "custid" string,
  "rgid" string,
  "lastbilled" string,
  "nextbill" string,
  "billguar" string,
  "dateadded" string,
  "cr_frequency" string,
  "cr_discount_amount" string,
  "cr_discount_type" string,
  "cr_quantity" string
)
PARTITIONED BY ("dt" string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar'=',',
  'quoteChar'='"',
  'escapeChar'='\\',
  'serialization.format'='1'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/custrate_history'
TBLPROPERTIES (
  'skip.header.line.count'='0'
);
