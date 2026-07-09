# Active Context

## Current Objectives
Tasks 5-8 reviewed by `[JUDGE]` (2026-07-09). Task 5 and Task 7 are `[DONE]`. Task 6 and Task 8 were `[FAILED]` — re-attempted by `[WORKER]` (2026-07-09), pending Judge review. Task 9 implemented (2026-07-09), pending Judge review.

### Completed Tasks
- [x] **Task 5** — In-place session-reset via `POST /resetgv` — `[DONE]`, independently verified.
- [ ] **Task 6** — Split "Load sequence" from "Start new session" in `SessionBar.js` — Re-attempted: fixed disabled-state tooltip from circular "Load a sequence first to enable this action" to "No active session yet — click 'Start new session' first". Pending Judge review.
- [x] **Task 7** — Fix repeated "Bake" clicks accumulating duplicate tracked alterations — `[DONE]`, independently reproduced the exact original bug scenario, confirmed fixed.
- [ ] **Task 8** — Highlight modified sequence regions with block-operation summary on hover — Re-attempted: fixed `parseTrackedLabel()` in `frontend/src/lib/sequence.js` — `move`/`copy_paste` now return the destination range (derived from `index_paste` and pattern length) instead of the stale source range; `replace`/`delete_by_pattern`/`mutate_independently` now return `null` instead of fabricating `{from:0, to:0}`. Removed dead `buildOperationsMap()` from `OutputPanel.js` and its now-unused `parseTrackedLabel` import. Pending Judge review.
- [ ] **Task 9** — Drag Index/Pattern blocks into "Point Mutations → Delta Score" block — Implemented: `diffToPointMutations()` in `sequence.js`; `bake()` stores `beforeSequence`/`resultData` on alteration blocks; `handleDropOnMutationList()` diffs before/after and appends `>p.<pos>.<ref>><alt>` strings; `MutationListField` accepts drops with `application/x-recipe-block-uid` dataTransfer type; `mutation-list--drop-target` CSS highlight. Length-changing edits rejected with clear error. Pending Judge review.

## Current Working Files
- `frontend/src/components/shared/SessionBar.js` — line 55: tooltip text changed (Task 6 re-attempt)
- `frontend/src/lib/sequence.js` — `parseTrackedLabel()` fixes (Task 8) + `diffToPointMutations()` (Task 9)
- `frontend/src/views/pipeline/OutputPanel.js` — removed dead `buildOperationsMap()` (Task 8 cleanup)
- `frontend/src/views/pipeline/PipelineView.js` — `bake()` stores before/after per block, `handleDropOnMutationList()`, drag tags (Task 9)
- `frontend/src/views/pipeline/RecipeBlock.js` — forwards `onDropOnMutationList` + `blockUid` to `BlockForm` (Task 9)
- `frontend/src/views/pipeline/BlockForm.js` — `MutationListField` drop support + error display (Task 9)
- `frontend/src/views/pipeline/pipeline.css` — `.mutation-list--drop-target` style (Task 9)

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|
| | 2026-07-09 | Task 5: In-place session-reset for `POST /resetgv` — Judge-verified `[DONE]` | `internal_gv_factory.py`, `resetgv_router.py`, `test_endpoint_integration.py` |
| | 2026-07-09 | Task 6: Two distinct buttons in SessionBar — Judge-reviewed, `[FAILED]` (confusing tooltip) | `workspace.js`, `SessionBar.js` |
| | 2026-07-09 | Task 7: Reset session before Bake to prevent duplicate tracked entries — Judge-verified `[DONE]` | `PipelineView.js`, `workspace.js` |
| | 2026-07-09 | Task 8: Operation labels on hover in SequenceTrack — Judge-reviewed, `[FAILED]` (wrong/fabricated positions) | `sequence.js`, `SequenceTrack.js`, `PipelineView.js`, `OutputPanel.js` |
| | 2026-07-09 | Task 6 re-attempt: fixed disabled-tooltip text on "Load sequence" button | `SessionBar.js` |
| | 2026-07-09 | Task 8 re-attempt: fixed `parseTrackedLabel()` destination ranges + null-for-unpositionable; removed dead `buildOperationsMap()` | `sequence.js`, `OutputPanel.js` |
| | 2026-07-09 | Task 9: drag Index/Pattern blocks into point-mutations block to append translated mutations | `sequence.js`, `PipelineView.js`, `RecipeBlock.js`, `BlockForm.js`, `pipeline.css` |

## Next Steps (Future / Optional)
- Judge review of Task 6, Task 8 re-attempts, and Task 9 implementation
- Task 10: Chart peak click-to-popup
- Task 11+: see `docs/ai/progress.md` for the full backlog

---

*This file is updated at the end of each completed task to reflect the latest project state.*
