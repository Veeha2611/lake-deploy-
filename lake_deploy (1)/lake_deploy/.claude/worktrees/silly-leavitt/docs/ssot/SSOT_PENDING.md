# SSOT Pending Entities

These entities require structured curated tables before SSOT current/exceptions can be enforced.

- Vetro GIS: structured parquet tables **in progress** (see `docs/ssot/intake/vetro_gis_2026-02-11/`). Views currently point to curated tables once CTAS completes.
- Gaiia: curated_core.gaiia_* are raw JSON payloads; need parsed tables with canonical fields and business_date.

Once structured tables exist, add:
- curated_core.<system>_<entity>_curated_raw
- curated_core.<system>_<entity>_current
- curated_recon.<system>_<entity>_exceptions

- Gaiia: invoices parsed fields still pending; current tables are JSON scaffolds.
