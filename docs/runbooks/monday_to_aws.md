# Monday → AWS Ingestion

## Purpose
Sync project inputs from Monday board into AWS S3 for system-of-record storage.

## Landing (S3)
- `s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/input/`
- Append-only CSV with timestamped filenames

## Notes
- Sync function lives in Base44 app deployment; repo documents the data contract.
- AWS S3 is the system of record for Projects module.
