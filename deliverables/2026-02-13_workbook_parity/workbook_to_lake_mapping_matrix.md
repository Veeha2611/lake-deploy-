# Workbook ↔ Lake Mapping Matrix (Investor Questions - GWI Business)

Workbook file (latest observed):
- `/Users/patch/Downloads/batch 9 vetro (act design)/Investor Questions - GWI Business (2).xlsx`

This workbook has 2 sheets:
- `Customer Mix` (modeled network mix: passings + subscriptions/services; workbook-defined network/customer/access classification)
- `Revenue Mix` (billed snapshot: Revenue, PLAT ID COUNT, Monthly ARPU)

The MAC AI Console parity contract is:
- Every workbook-domain question routes deterministically to the matching *definition* (no mixing).
- Every numeric claim is derived from governed lake sources with evidence and freshness.
- If the lake cannot reproduce a workbook metric exactly, the system returns **UNAVAILABLE** with the specific missing dataset/row(s).

## Canonical Definitions (No Ambiguity)

Customer Mix (“customers” in Customer Mix tab):
- **Grain**: `subscriptions` (services), not unique customer entities.
- **Source**: `curated_core.v_network_health`
- **Filters**: `dt = MAX(dt)`, `network <> 'Unmapped'`, non-empty `network`
- **Grouping dimensions**: `network_type`, `customer_type`, derived `access_type`:
  - `access_type = 'Copper'` iff `network_type = 'CLEC'`, else `Fiber`

Revenue Mix (“customers” in Revenue Mix tab):
- **Grain**: `plat_id_count` (distinct billed customer IDs), not subscriptions/services.
- **Source**: `curated_core.v_investor_revenue_mix_latest`
- **Filters**: latest snapshot (`MAX(as_of_date) <= current_date`), `network <> 'Total'`
- **Measures**:
  - `revenue` (billed MRR for that snapshot)
  - `plat_id_count` (billed customer IDs)
  - `monthly_arpu` (already computed in the view; equals revenue / plat_id_count for the workbook export)

## Workbook → Lake Metric Mapping

### Customer Mix Sheet

Columns in workbook:
- `Network`, `Network Type`, `Customer Type`, `Access Type`, `Passings`, `Subscriptions`, `ARPU`

Lake mapping:
- `Passings` → `SUM(passings)` from `curated_core.v_network_health`
- `Subscriptions` → `SUM(subscriptions)` from `curated_core.v_network_health`
- `Penetration` (derived) → `subscriptions / passings`
- `Modeled MRR` (available in lake) → `SUM(mrr)` from `curated_core.v_network_health`
- `Modeled ARPU` (derived) → `SUM(mrr) / SUM(subscriptions)`

Deterministic query templates (MAC AI Console):
- `workbook_customer_mix_kpis` (segment totals; parameterized by `network_type`, `customer_type`, `access_type`)
- `workbook_customer_mix_networks_list` (drill-down networks for a segment)
- `workbook_customer_mix_summary` (all segments summary table)

Workbook segment mappings (from workbook content):
- Owned FTTP / Owned Customer / Fiber
- Contracted / Contracted Customer / Fiber
- Contracted / Owned Customer / Fiber
- CLEC / Owned Customer / Copper

### Revenue Mix Sheet

Workbook contains 3 sections:
- `REVENUE`
- `PLAT ID COUNT`
- `Monthly ARPU`

Lake mapping:
- `REVENUE` → `SUM(revenue)` from `curated_core.v_investor_revenue_mix_latest`
- `PLAT ID COUNT` → `SUM(plat_id_count)` from `curated_core.v_investor_revenue_mix_latest`
- `Monthly ARPU` → `monthly_arpu` from `curated_core.v_investor_revenue_mix_latest`

Deterministic query templates (MAC AI Console):
- `workbook_revenue_mix_kpis` (segment totals; parameterized by `network_type_like` + optional `network_like`)
- `workbook_revenue_mix_networks_list` (drill-down networks for a segment)
- `workbook_revenue_mix_summary` (all segment summary table)
- `workbook_revenue_mix_totals_excluding_dvfiber` (explicit workbook “totals excluding DVFiber” parity path)

Segment mapping rules (Revenue Mix view):
- Owned billing: `network_type LIKE '%owned%fiber%'`
- Contracted/resold fiber billing: `network_type LIKE '%resold%fiber%'`
- Copper/CLEC billing: `network_type LIKE '%copper%'`

## Known Parity Blockers (If Present)

The workbook includes two “Resold” detailed line-items that may be absent from the lake export:
- `network = 'NULL'` (Resold)
- `network = '(blank)'` (Resold)

If those rows are not present in `curated_recon.investor_revenue_mix` (the backing table), then:
- the lake cannot reproduce the workbook’s “Resold” totals exactly
- the correct response is **UNAVAILABLE** for that rollup until the export/ingest includes those line-items (or the workbook removes them)

