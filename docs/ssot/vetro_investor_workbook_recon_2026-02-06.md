# Vetro Investor Workbook Reconciliation (2026-02-06)

## Purpose
Provide a single, auditable reference for proving Vetro layer ingestion + as‑built filtering + network mapping were sufficient to reconstruct the **GWI Investor Questions workbook** (test harness) and to document exactly where the evidence lives for the Base44→AWS rebuild execution.

## Canonical rule (authoritative)
All Vetro operational/BSL/passings analytics must use **plans tagged "As Built"** only.
- Enforced in lake via `curated_core.v_vetro_plans_as_built` (phase_id=3) and downstream views.
- Source doc: `docs/runbooks/vetro_ingestion.md`

## Source artifacts (test harness)
- Workbook (original): `~/Downloads/Investor Questions - GWI Business.xlsx`
- Workbook (previous version): `~/Downloads/Investor Questions - GWI Business (1).xlsx`
- Workbook (reconstructed output): `~/vetro/vetro_reconcile/Investor Questions - GWI Business (2) - reconstructed.xlsx`

## Vetro layer exports landed (S3)
- `s3://gwi-raw-us-east-2-pc/raw/vetro_layers_features/dt=2026-02-05/vetro_layers_features.csv.gz`
- `s3://gwi-raw-us-east-2-pc/raw/vetro_layers_kv/dt=2026-02-05/vetro_layers_kv.csv.gz`
- `s3://gwi-raw-us-east-2-pc/raw/vetro_layers_keys_summary/dt=2026-02-05/vetro_layers_keys_summary.csv`
- `s3://gwi-raw-us-east-2-pc/raw/vetro_as_built_plan_ids/dt=2026-02-05/vetro_as_built_plan_ids.csv`
- `s3://gwi-raw-us-east-2-pc/raw/vetro_assoc_project_to_network_map/dt=2026-02-05/vetro_assoc_project_to_network_map.csv`

## Curated + reconciliation outputs
- **Passings reconciliation (zero‑delta)**
  - Local: `~/vetro/vetro_reconcile/customer_mix_reconstructed_layers_ssot_2026-02-06.csv`
  - S3: `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_customer_mix_recon/dt=2026-02-06/customer_mix_reconstructed_layers_ssot_2026-02-06.csv`

- **Network ↔ plan mapping (proposed / locked)**
  - Local: `~/vetro/vetro_reconcile/investor_network_system_plan_map_proposed_2026-02-06.csv`
  - Candidates: `~/vetro/vetro_reconcile/investor_network_plan_match_candidates_top3_2026-02-05.csv`

- **Associated Project remediation**
  - Missing GWI FTTX mapping (min‑dist): `~/vetro/vetro_reconcile/missing_gwi_fttx_associated_project_min_dist_2026-02-06.csv`
  - Remediation summary: `~/vetro/vetro_reconcile/missing_associated_project_remediation_2026-02-06.csv`

- **Layer inventory outputs**
  - `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_layers_inventory/dt=2026-02-06/`

## How the workbook match was achieved (summary)
- **Passings** derived from Vetro layers using only **As‑Built** plan IDs.
- **Network mapping** uses `raw_vetro.vetro_assoc_project_to_network_map` with strict rules:
  - fill 31 missing Associated Project records:
    - 14 DVFiber + 1 Belmont via FSA mapping
    - 16 GWI FTTX via nearest‑neighbor to plan centroids
- **Belmont/Morril class rule**: count records where class is not null OR (class null AND drop_type='Underground')

## Quick proof checklist (for a new execution)
1. Confirm layer exports exist (S3 paths above).
2. Confirm as‑built plan list exists:
   - `raw_vetro.vetro_as_built_plan_ids`
3. Confirm passings recon output is zero‑delta:
   - `curated_recon/vetro_customer_mix_recon/.../customer_mix_reconstructed_layers_ssot_2026-02-06.csv`
4. Open reconstructed workbook and compare to original:
   - `~/vetro/vetro_reconcile/Investor Questions - GWI Business (2) - reconstructed.xlsx`

## Related runbooks / reference docs
- `docs/runbooks/vetro_ingestion.md`
- `docs/vetro_geometry_export_runbook.md`
- `docs/reference/vetro_completeness_2026-02-03.md`
- `docs/reference/vetro_reconciliation_with_manual_2026-01-30.csv`
- `docs/reference/vetro_remaining_work_2026-01-30.md`

## Notes for the Base44 → AWS rebuild execution
Use the **curated_core** views for dashboard tiles; all Vetro metrics must be filtered through **As‑Built** plan IDs. The mapping + reconciliation artifacts above are the authoritative evidence for plan coverage and workbook alignment.
