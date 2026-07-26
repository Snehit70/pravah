---
status: accepted
---

# V2 target resolution, Goal progress, and write receipts

Canonical v2 Task and Goal targets accept either an ID or an exact unique title/name; ambiguous names fail with candidates and IDs, while fuzzy matching remains Search-only. Creation takes its primary text positionally. Goals display `completed / active linked Tasks`, excluding cancelled links, and every recoverable human write prints a standard operation receipt with a ready-to-run Undo command and expiry.

## Considered options

- **IDs only.** Rejected because a human list does not always expose IDs and routine commands should not require a lookup detour.
- **Automatic fuzzy target selection.** Rejected because a destructive or state-changing command must never select an uncertain Task or Goal.
- **Success-only write messages.** Rejected because the operation ledger is most useful at the moment an operator may need to recover a write.
