# SSOT Canonical Model (Cross-System)

Last updated: 2026-02-03

## Goal
Define a canonical, cross-system SSOT layer that is accurate, repeatable, and queryable across Salesforce, Intacct, Platt, Vetro, and Gaiia.

## Source-of-truth by domain (policy)
- Customers/Accounts: **Salesforce** is primary identity; Vetro/Gaiia contribute service context.
- Financials (GL/Invoices/Payments): **Intacct** is primary; other systems reference only.
- Network/Assets/Inventory/Locations: **Vetro/Gaiia** primary; Platt contributes procurement details.
- Orders/Projects: **Salesforce/Vetro** depending on workflow; enforce one per process.

## Canonical dimensions (curated_ssot)
- `dim_account`, `dim_location`, `dim_asset`, `dim_product`, `dim_contract`, `dim_invoice`, `dim_payment`, `dim_ticket`
- Current views: `dim_*_current` (deduped by SSOT id).

## Identity graph (crosswalks)
- `xwalk_account`, `xwalk_location`, `xwalk_asset`, `xwalk_product`, `xwalk_contract`, `xwalk_invoice`, `xwalk_payment`, `xwalk_ticket`
- Fields: `ssot_*_id`, `source_system`, `source_id`, `match_confidence`, `match_rule`, `is_primary`, `effective_at`.

## Source priority rules
- Table: `curated_ssot.ssot_source_priority_rules`
- Use this for field-level precedence in downstream marts.

## Reconciliation views
- `curated_recon.ssot_xwalk_coverage`
- `curated_recon.ssot_dim_counts`

## Implementation notes
1) Raw → curated_core current views via `scripts/ssot_global_orchestrator.py`.
2) Canonical dims + xwalk tables defined in `athena/curated/ssot/60_ssot_canonical_dimensions.sql`.
3) Source priority rules in `athena/curated/ssot/61_ssot_source_priority_rules.sql`.
4) Reconciliation views in `athena/curated/ssot/62_ssot_reconciliation_views.sql`.
5) Daily orchestration executes via `scripts/ssot_daily.sh`.

## Next steps to fully populate
- Load crosswalks deterministically (matching rules by domain).
- Populate dim_* tables from source-specific curated views using the precedence rules.
- Add automated DQ thresholds and alerts per domain.
