# Action Items Tracker — Data Lake Reconciliation

**Date:** 2026-02-13  
**Source:** Meeting transcript export at `ssot_audit/notion_transcripts/2026-02-13/3063eb690d098193a94fd08ed4f1b196_transcript.txt`

| ID | Action | Owner | Due date/time | Dependencies | Status | Evidence/Link |
|---|---|---|---|---|---|---|
| ALN-001 | Send “updated fix + to-do list” in a digestible format to Adam + Alex (recap: by end of day) | Patch | 2026-02-13 EOD | Current dashboard state + evidence pack | Complete | Report: `deliverables/2026-02-13_mac_app_alignment/MAC_App_Alignment_Report_2026-02-13.md` · Evidence: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_alignment_run/dt=2026-02-13/` |
| ALN-002 | Reconcile and explain Owned FTTP mismatch (912 vs 348) and confirm dashboard definition | Patch | 2026-02-13 EOD | Definition clarity; validation queries | Complete | `deliverables/2026-02-13_mac_app_alignment/MAC_OnePager_What_Changed_2026-02-13.md` |
| ALN-003 | Email Chris Whalen: start Vetro cleanup today + daily progress updates | Adam | 2026-02-13 ASAP | Identify assignee + start time | Pending | `deliverables/2026-02-13_mac_app_alignment/Email_to_Chris_Whalen_Vetro_Cleanup_Daily_Updates.md` |
| ALN-004 | Implement v1 “Change Log” (last 24h delta summary) in dashboard | Patch | 2026-02-20 | Daily snapshot history (2+ points) | In progress | Query + UI tile wired: `change_log_customer_mix` (delta requires daily history) |
| ALN-005 | Implement MRR movement breakdown (contraction/churn/reactivation) | Patch | 2026-02-27 | Platt monthly MRR + movement logic | Complete | Query + UI tile: `mrr_movement_breakdown_latest` · Evidence: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_alignment_run/dt=2026-02-13/` |
| ALN-006 | Publish a billing-aligned “Bucket Summary” alongside subscriptions-aligned | Patch | 2026-02-27 | Billing source + crosswalk coverage | Complete | Query + UI tab: `bucket_summary_billing` · Evidence: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_alignment_run/dt=2026-02-13/` |
