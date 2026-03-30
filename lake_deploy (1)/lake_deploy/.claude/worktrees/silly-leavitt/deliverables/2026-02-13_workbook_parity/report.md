# Workbook ↔ Lake Parity
- Run at (UTC): `2026-02-13T21:34:47.250328Z`
- Workbook: `/Users/patch/Downloads/batch 9 vetro (act design)/Investor Questions - GWI Business (2).xlsx`
- Revenue Mix as_of_date (workbook header selection): `2026-01-25`
- Result: **FAIL**

## Athena QIDs
- `lake_revenue_mix_max_as_of_date`: `bc7c11d6-cc92-4e73-8e8c-5f28beb1b1de`
- `lake_customer_mix_combos`: `8efcc7ad-6a77-4cac-a86f-15bbcc8da1fc`
- `lake_revenue_mix_by_type`: `9a6817cd-75cf-468a-a6fc-be253b09f3be`
- `lake_revenue_mix_copper_rollup`: `1bbb2352-6ab7-4446-8cf6-b94303369c89`

## Failures
- (none)

## Comparisons (failed only)
- `revenue_mix.revenue.Resold; Fiber` expected=253171.0 actual=253172.0 delta=1.0
- `revenue_mix.revenue.Resold (Copper rollup)` expected=327669.0 actual=301634.0 delta=-26035.0
- `revenue_mix.plat_id_count.Resold (Copper rollup)` expected=832.0 actual=2819.0 delta=1987.0
- `revenue_mix.arpu.Resold (Copper rollup)` expected=394.0 actual=107.00035473572188 delta=-286.9996452642781
