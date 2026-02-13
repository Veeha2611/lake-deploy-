# Query Engine Contracts

This folder contains the canonical contracts for governed query planning, compilation, and validation.

These files are intended to be:
- reviewed as part of governance
- used by tooling (validators, compilers, golden tests)
- synchronized into runtime packages as needed

## Contents
- `query_plan_schema.json`: JSON Schema for the QueryPlan contract.
- `allowed_sources.json`: allowlisted databases/views and policy constraints.
- `join_map.json`: permitted join keys between governed sources.
- `action_intent_schema.json`: schema for case action intents.
- `report_spec_schema.json`: schema for report generation specifications.
- `metric_definitions.json`: metric catalog used by deterministic compilation and cross-checking.

## Notes
- These contracts must remain **deterministic** and **evidence-backed**.
- Any change should be accompanied by an evidence pack demonstrating no regression.

