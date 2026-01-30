# Manual / Investor Documents

## Purpose
Stage investor and ad‑hoc documents into the lake for structured extraction and analysis.

## S3 Layout
- Sources: `s3://gwi-raw-us-east-2-pc/raw/investor_docs/YYYY-MM-DD/`
- Manual staging: `s3://gwi-raw-us-east-2-pc/raw/manual/YYYY-MM-DD/`
- Converted outputs: `s3://gwi-raw-us-east-2-pc/raw/manual/YYYY-MM-DD/converted/`

## Current Status
- Documents are staged in S3 but not fully cataloged in Athena.
- Glue crawler / extraction is required for structured queries.

## Planned / Future
- Glue crawlers for raw/manual and raw/investor_docs.
- Automated conversion pipeline to CSV/JSON for Athena query access.

