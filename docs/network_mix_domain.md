# Network Mix Domain (Workbook-Parity Registry)

This document defines a **finite, deterministic** registry for all Network Mix workbook questions.

The contract is:
- Every supported Network Mix question maps to a **canonical metric** + **canonical grain**.
- Every numeric answer is derived from governed lake sources via deterministic queries in `apps/mac-app-v2/lambda/query-broker/query-registry.json`.
- If a question is in-scope but cannot be mapped unambiguously, the API **fails closed** with `NOT SUPPORTED YET` + a concrete next step.

## Canonical Grains (No Ambiguity)

Customer Mix tab:
- Grain: `subscriptions` (services), not unique customers.
- Source: `curated_core.v_network_health` (latest `dt`).

Revenue Mix tab:
- Grain: `plat_id_count` (billed customer IDs), not subscriptions.
- Source: `curated_core.v_investor_revenue_mix_latest` (latest snapshot).

## Canonical Segments

Segments are finite and defined by the workbook:
- `owned` (Owned FTTP + Owned Customer)
- `contracted` (Contracted + Contracted Customer)
- `clec` (CLEC + Owned Customer; access type Copper)
- `resold` (Revenue Mix-only; `network_type` contains resold)

Segment mapping rules live in:
- `apps/mac-app-v2/lambda/query-broker/network-mix-domain.yaml`

## Canonical Metrics

Customer Mix (modeled):
- `passings` (sum)
- `subscriptions` (sum)
- `penetration_pct` (`subscriptions / passings * 100`)
- `arpu_modeled` (`mrr / subscriptions`)
- `mrr_modeled` (sum)

Revenue Mix (billed snapshot):
- `billed_mrr` (sum `revenue`)
- `billed_customers` (sum `plat_id_count`)
- `arpu_billed` (`revenue / plat_id_count`)
- `totals_excluding_dvfiber` (workbook-defined totals excluding DVFiber customers)

## Deterministic Query Templates (Authoritative)

Customer Mix:
- Summary (all segments): `workbook_customer_mix_summary`
- Segment KPIs: `workbook_customer_mix_kpis`
- Segment networks list: `workbook_customer_mix_networks_list`
- Segment share (% of subscriptions/passings): `workbook_customer_mix_segment_pct`

Revenue Mix:
- Summary (all segments): `workbook_revenue_mix_summary`
- Segment KPIs: `workbook_revenue_mix_kpis`
- Segment networks list: `workbook_revenue_mix_networks_list`
- Segment share (% of revenue or % of billed customers): `workbook_revenue_mix_segment_pct`
- Totals excluding DVFiber: `workbook_revenue_mix_totals_excluding_dvfiber`

## Question Matrix (Finite)

For each segment (`owned`, `contracted`, `clec`, `resold`) and each sheet (Customer Mix, Revenue Mix):

Supported operations:
- Count/total question:
  - Customer Mix: routes to `workbook_customer_mix_kpis`
  - Revenue Mix: routes to `workbook_revenue_mix_kpis`
- List/drill-down question (“list networks …”):
  - Customer Mix: routes to `workbook_customer_mix_networks_list`
  - Revenue Mix: routes to `workbook_revenue_mix_networks_list`
- Mix/share question (“what percent/share …”):
  - Customer Mix: routes to `workbook_customer_mix_segment_pct`
  - Revenue Mix: routes to `workbook_revenue_mix_segment_pct`
- DVFiber exclusion:
  - Revenue Mix totals excluding DVFiber: routes to `workbook_revenue_mix_totals_excluding_dvfiber`
  - Customer Mix DVFiber exclusion: **NOT SUPPORTED** (workbook does not define it)

## Deterministic Normalization (No Fuzzy Guessing)

The runtime performs deterministic normalization using:
- `apps/mac-app-v2/lambda/query-broker/network-mix-domain.yaml`

Rules:
- Segment terms map to a single segment key; if multiple segment keys match, routing fails closed.
- Sheet selection:
  - If the question contains billed/revenue/plat-id/mrr language, route to Revenue Mix.
  - Otherwise route to Customer Mix.

## Explicit Gaps / Fail-Closed Behavior

If an in-scope question cannot be answered with existing governed sources:
- return `NOT SUPPORTED YET: ...`
- include `NEXT STEP: ...` describing the exact missing view/dataset/mapping rule required

Known gap (documented in parity report):
- Revenue Mix “Resold” totals may include workbook-only rows `network='NULL'` and `network='(blank)'` which are absent from the lake export. If absent, exact parity is not possible until the export includes them (or workbook removes them).

## Regression Tests

Domain regression tests:
- `automation/tests/network_mix_domain_questions.json`
- Runner: `automation/tests/run_network_mix_domain_questions.py`

