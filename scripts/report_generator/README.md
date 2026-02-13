# Report Generator (MAC AI Console)

This folder contains developer utilities for generating and exporting reports from the MAC AI Console runtime.

## export_case_report.py

Triggers report generation for an existing `case_id` by calling the MAC API action endpoint.

Environment:
- `MAC_APP_API_BASE` (default: production API base URL)
- `MAC_APP_AUTH_TOKEN` (optional; bearer token if the API is protected)

Example:
```bash
python3 scripts/report_generator/export_case_report.py --case-id <CASE_ID>
```

This script does not print secrets and is intended to be safe to run locally.

