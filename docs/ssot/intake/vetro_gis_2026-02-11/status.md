# Status — Vetro GIS SSOT Rebuild

**Last update:** 2026-02-11

## Status
- **GIS SSOT audit:** PASS
- **Evidence pack (local):** `/Users/patch/lake_deploy/ssot_audit/vetro_gis_2026-02-11/`
- **Evidence pack (S3):** `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_gis_self_audit/dt=2026-02-11/`

## Lock
- **Do NOT run GIS CTAS or rebuild GIS tables.**
- GIS views are considered authoritative per the PASS audit above.

## Next step
- Validate MAC app network map loads against the updated GIS views.

## MAC API sanity (2026-02-11)
- `/query` checks PASSED for all GIS endpoints (network_map_counts, service_locations, naps, fat, fiber layers, polygons).
- Evidence file: `/Users/patch/lake_deploy/ssot_audit/mac_app_ssot_2026-02-11/api_query_network_map.json`
