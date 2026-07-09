# Active Context

## Current Objectives
Tasks 5-8 reviewed by `[JUDGE]` (2026-07-09). Task 5 and Task 7 are `[DONE]`. Task 6 and Task 8 are `[FAILED]` — routed back to `[WORKER]` with specific, small fix instructions (see `docs/ai/audits_history.md` → "Judge Review — Tasks 5–8" and `docs/ai/progress.md` for full detail). Next `[WORKER]` session should re-attempt Task 6 and Task 8 before picking up Task 9+.

**Process note for future `[WORKER]` sessions:** the previous session marked its own tasks `[x]` in `progress.md`/`active_context.md` — per `.clinerules` §3, only `[JUDGE]` marks `[DONE]`/`[FAILED]`. Append an implementation note instead and leave the checkbox for the Judge.

### Completed Tasks
- [x] **Task 5** — In-place session-reset via `POST /resetgv` — `[DONE]`, independently verified.
- [ ] **Task 6** — Split "Load sequence" from "Start new session" in `SessionBar.js` — `[FAILED]`: disabled-state tooltip on the "Load sequence" button is circular/self-contradictory ("Load a sequence first to enable this action" shown on the Load-sequence button itself). One-line fix.
- [x] **Task 7** — Fix repeated "Bake" clicks accumulating duplicate tracked alterations — `[DONE]`, independently reproduced the exact original bug scenario, confirmed fixed.
- [ ] **Task 8** — Highlight modified sequence regions with block-operation summary on hover — `[FAILED]`: `parseTrackedLabel()` in `frontend/src/lib/sequence.js` attaches Move/Copy-paste labels to the wrong (stale source, not destination) position, and hardcodes position 0 for Replace/Delete-by-pattern/Random-mutation instead of omitting them. Fix instructions in the audit are concrete (the destination range is derivable from data already captured in the existing regex match).

## Current Working Files
- `frontend/src/lib/sequence.js` — `parseTrackedLabel()` needs the move/copy_paste + replace/delete_by_pattern/mutate_independently fixes (Task 8 re-attempt)
- `frontend/src/components/shared/SessionBar.js` — disabled-tooltip text needs fixing (Task 6 re-attempt)

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|
| 2026-07-09 | Task 5: In-place session-reset for `POST /resetgv` — Judge-verified `[DONE]` | `internal_gv_factory.py`, `resetgv_router.py`, `test_endpoint_integration.py` |
| 2026-07-09 | Task 6: Two distinct buttons in SessionBar — Judge-reviewed, `[FAILED]` (confusing tooltip) | `workspace.js`, `SessionBar.js` |
| 2026-07-09 | Task 7: Reset session before Bake to prevent duplicate tracked entries — Judge-verified `[DONE]` | `PipelineView.js`, `workspace.js` |
| 2026-07-09 | Task 8: Operation labels on hover in SequenceTrack — Judge-reviewed, `[FAILED]` (wrong/fabricated positions) | `sequence.js`, `SequenceTrack.js`, `PipelineView.js`, `OutputPanel.js` |

## Next Steps (Future / Optional)
- Re-attempt Task 6 (tooltip fix) and Task 8 (`parseTrackedLabel()` fixes) — both small, see audit for exact fix.
- Task 9: Drag Index/Pattern blocks into "Point Mutations → Delta Score" block
- Task 10: Chart peak click-to-popup
- Task 11+: see `docs/ai/progress.md` for the full backlog

---

*This file is updated at the end of each completed task to reflect the latest project state.*