Base44 Structured Response Contract

Purpose
Base44 UI must render lake answers using the SSOT Answer Format.

Response Shape (JSON)
{
  "answer_version": "1.0",
  "definition_block": {
    "metric_definition": "...",
    "category_definitions": "...",
    "source_of_truth": "...",
    "coverage_notes": "..."
  },
  "evidence_discovery": {
    "discovery_sql": "...",
    "discovery_qids": ["..."],
    "selection_rationale": "..."
  },
  "computation_queries": [
    { "sql": "...", "qid": "...", "result_summary": "..." }
  ],
  "results_tables": {
    "today_table": [
      { "context": "business", "bulk_retail": "retail", "passings": 0, "pct": 0.0 }
    ],
    "pipeline_table": [
      { "context": "pipeline", "bulk_retail": "bulk", "passings": 0, "pct": 0.0 }
    ],
    "optional_breakdowns": []
  },
  "crosswalk_logic": {
    "rules": ["..."],
    "tables_views": ["..."],
    "qids": ["..."],
    "inference_notes": "..."
  },
  "blockers_gaps": {
    "missing_assets": ["..."],
    "minimal_view_contract": ["..."],
    "impact": "..."
  },
  "final_answer": {
    "short_answer": "...",
    "caveats": "..."
  }
}

UI Requirements
- Render sections in the same order as the Answer Format Runbook.
- Show QIDs inline with the evidence.
- If blockers exist, display them prominently before the short answer.

