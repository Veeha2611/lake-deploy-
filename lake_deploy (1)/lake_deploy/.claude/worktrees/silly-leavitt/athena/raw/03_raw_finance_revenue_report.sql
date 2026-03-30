-- Raw revenue report wide (monthly columns) + long format for reconciliation

CREATE TABLE IF NOT EXISTS raw_finance.revenue_report (
  revenue_row_id string,
  customer_id string,
  guarantor_id string,
  customer_name string,
  customer_active string,
  company_name string,
  system_id string,
  bill_day string,
  customer_type string,
  m_2024_01 double,
  m_2024_02 double,
  m_2024_03 double,
  m_2024_04 double,
  m_2024_05 double,
  m_2024_06 double,
  m_2024_07 double,
  m_2024_08 double,
  m_2024_09 double,
  m_2024_10 double,
  m_2024_11 double,
  m_2024_12 double,
  m_2025_01 double,
  m_2025_02 double,
  m_2025_03 double,
  m_2025_04 double,
  m_2025_05 double,
  m_2025_06 double,
  m_2025_07 double,
  m_2025_08 double,
  m_2025_09 double,
  m_2025_10 double,
  m_2025_11 double,
  m_2025_12 double,
  source_file string,
  source_sheet string,
  extracted_at_utc string
)
WITH (
  external_location = 's3://gwi-raw-us-east-2-pc/raw/finance/revenue_report/',
  format = 'CSV',
  skip_header_line_count = 1,
  csv_separator = ',',
  csv_quote = '\"',
  csv_escape = '\\\\'
);

CREATE TABLE IF NOT EXISTS raw_finance.revenue_report_long (
  revenue_row_id string,
  customer_id string,
  guarantor_id string,
  customer_name string,
  customer_active string,
  company_name string,
  system_id string,
  bill_day string,
  customer_type string,
  source_file string,
  source_sheet string,
  extracted_at_utc string,
  report_month string,
  amount double
)
WITH (
  external_location = 's3://gwi-raw-us-east-2-pc/raw/finance/revenue_report_long/',
  format = 'CSV',
  skip_header_line_count = 1,
  csv_separator = ',',
  csv_quote = '\"',
  csv_escape = '\\\\'
);
