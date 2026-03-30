-- Canonical SSOT dimensions + identity graph scaffolds (Hive-compatible)
CREATE DATABASE IF NOT EXISTS curated_ssot;

-- Identity graph (crosswalks)
CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_account (
  ssot_account_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_account/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_location (
  ssot_location_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_location/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_asset (
  ssot_asset_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_asset/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_product (
  ssot_product_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_product/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_contract (
  ssot_contract_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_contract/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_invoice (
  ssot_invoice_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_invoice/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_payment (
  ssot_payment_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_payment/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.xwalk_ticket (
  ssot_ticket_id string,
  source_system string,
  source_id string,
  match_confidence double,
  match_rule string,
  is_primary boolean,
  effective_at timestamp,
  updated_at timestamp,
  notes string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/xwalk_ticket/';

-- Canonical dimensions
CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_account (
  ssot_account_id string,
  primary_source_system string,
  primary_source_id string,
  account_name string,
  account_type string,
  status string,
  billing_street string,
  billing_city string,
  billing_state string,
  billing_postal_code string,
  service_address string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_account/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_location (
  ssot_location_id string,
  primary_source_system string,
  primary_source_id string,
  address_line1 string,
  address_line2 string,
  city string,
  state string,
  postal_code string,
  latitude double,
  longitude double,
  status string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_location/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_asset (
  ssot_asset_id string,
  primary_source_system string,
  primary_source_id string,
  asset_type string,
  model string,
  serial_number string,
  status string,
  location_id string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_asset/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_product (
  ssot_product_id string,
  primary_source_system string,
  primary_source_id string,
  product_name string,
  product_type string,
  plan_name string,
  status string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_product/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_contract (
  ssot_contract_id string,
  primary_source_system string,
  primary_source_id string,
  account_id string,
  contract_number string,
  start_date date,
  end_date date,
  status string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_contract/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_invoice (
  ssot_invoice_id string,
  primary_source_system string,
  primary_source_id string,
  account_id string,
  invoice_number string,
  invoice_date date,
  due_date date,
  amount_total double,
  amount_due double,
  currency string,
  status string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_invoice/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_payment (
  ssot_payment_id string,
  primary_source_system string,
  primary_source_id string,
  account_id string,
  payment_date date,
  amount double,
  currency string,
  method string,
  status string,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_payment/';

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.dim_ticket (
  ssot_ticket_id string,
  primary_source_system string,
  primary_source_id string,
  account_id string,
  location_id string,
  ticket_number string,
  ticket_type string,
  status string,
  priority string,
  opened_at timestamp,
  closed_at timestamp,
  created_at timestamp,
  updated_at timestamp,
  effective_at timestamp,
  attributes_json string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/dim_ticket/';

-- Current-state views (dedupe by SSOT id)
CREATE OR REPLACE VIEW curated_ssot.dim_account_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_account_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_account
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_location_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_location_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_location
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_asset_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_asset_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_asset
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_product_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_product_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_product
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_contract_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_contract_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_contract
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_invoice_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_invoice_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_invoice
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_payment_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_payment_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_payment
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.dim_ticket_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_ticket_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.dim_ticket
)
SELECT * FROM ranked WHERE rn = 1;
