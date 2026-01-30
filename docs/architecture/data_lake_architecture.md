# Data Lake Architecture (Current State)

## Overview
The data lake is built on AWS S3 + Athena with scheduled ingestion and curated views. Source systems land raw data in S3, Athena defines raw/curated schemas, and downstream apps query curated views with evidence fields (query IDs, SQL, row counts).

## Diagram
- Mermaid source: `docs/architecture/diagrams/data_lake_current.mmd`

## Core Systems
- **S3 (gwi-raw-us-east-2-pc)**: System of record for raw, curated, recon, and proof artifacts.
- **Athena**: Query engine for raw and curated layers.
- **Glue (where applicable)**: Catalogs manual/ingested datasets.
- **Lambda + CloudFormation**: Scheduled ingestion for Vetro exports and other automated pulls.
- **Base44 App (MAC Intelligence Platform)**: Consumes curated Athena views and S3 knowledge artifacts.

## Data Flow (End-to-End)
1. **Source systems** deliver raw extracts to S3 (automated or manual).
2. **Athena raw tables** map raw S3 locations and partitioning.
3. **Curated views/tables** standardize schemas and business logic.
4. **SSOT + recon** layers track exceptions and reconcile inputs.
5. **Consumers** (Base44 UI, investor outputs, analytics) query curated views.

## Key Modules (Application Wiring)
### Network Map (GIS)
- **Source**: `vetro_raw_db.vetro_raw_json_lines`
- **Layers**: Service Locations, NAPs, FAT
- **Evidence**: `athena_query_execution_id`, `generated_sql`, `rows_returned`, `rows_truncated`
- **Status**: Deployed

### Projects Pipeline
- **Source View**: `curated_core.projects_enriched`
- **Limit**: 200 default, 2000 max
- **Evidence**: `athena_query_execution_id`, `generated_sql`, `data_source`
- **Status**: Deployed

### Revenue Reconciliation Pack
- **Source Views**: `curated_core.invoice_line_item_repro_v1`, `curated_core.v_monthly_revenue_platt_long`
- **Evidence**: `athena_query_execution_id`, `generated_sql`, `rows_returned`, `rows_truncated`
- **Status**: Deployed

### Query Intelligence Console
- **Lane A (Numerical)**: Athena curated views
- **Lane B (Knowledge)**: `s3://gwi-raw-us-east-2-pc/knowledge_base/`
- **Evidence**: multi-query execution IDs, SQL, view list, KB sources
- **Status**: Deployed

### Dashboard Tiles
- **Source Views**: `v_monthly_revenue_platt_long`, `v_customer_spine`, `v_support_tickets`, `v_network_health`
- **Status**: Deployed

## Deployed Today
- Vetro raw ingestion via Lambda + CFN
- Intacct GL ingest via scripts + S3
- Platt raw + curated tables
- Gaiia curated customer/invoice tables
- Curated views for projects, revenue, SSOT

## Planned / Future
- Full automation for manual investor documents (Glue catalog + standardized raw_sheets).
- Broader GIS coverage and Vetro backfill completion monitoring.
- Expand knowledge ingestion to additional internal sources.
