# Active Context

## Current Objectives
All tasks from the initial active context are now completed:
1. ✅ Fix `AlterationFunctionsByPattern` missing mixin inheritance — Already inherits from `AlteredSequenceTrackerMixin` (was never broken)
2. ✅ Fix `AlterationFunctionsByIndex` missing mixin — Added `AlteredSequenceTrackerMixin` inheritance
3. ✅ Fix typos in `general_services.py` (`result_per_seqences` → `result_per_sequences`, `using_altered_seqence` → `using_altered_sequence`, `return_proba_simple` bug)
4. ✅ Fix typos in `calcul_function.py` (`euclidian` → `euclidean`)
5. ✅ Create `initialize_internal_gv.py` stub for legacy singleton imports
6. ✅ Migrate 4 legacy routers (`get_router.py`, `resetgv_router.py`, `analysis_router.py`, `alteration_radom.py`) to session-based factory

## Current Working Files
All files have been updated. No pending changes in the current scope.

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|
| 2026-07-07 | Initial AI Memory Bank created | `docs/ai/*`, `.clinerules` |
| 2026-07-07 | Audit complete — identified pending tasks from plan1.txt | `docs/ai/progress.md`, `docs/ai/active_context.md` |
| 2026-07-07 | Typo fixes: `result_per_seqences`→`result_per_sequences`, `euclidian`→`euclidean`, `return_proba_simple` bug | `app/services/general_services.py`, `app/domain/calcul_function.py`, `app/domain/mixins.py` |
| 2026-07-07 | Recreated `initialize_internal_gv.py` stub | `app/domain/initialization/initialize_internal_gv.py` |
| 2026-07-07 | Migrated 4 legacy routers to session-based factory | `app/router/get_router.py`, `app/router/resetgv_router.py`, `app/router/analysis_router.py`, `app/router/alteration_radom.py` |

## Next Steps (Pending Tasks)
1. Fix `AlterationFunctionsByIndex.move()` and `copy_past()` — they use `self.sequence` instead of `self.altered_sequence` for pattern extraction, breaking alteration chaining
2. Fix endpoint typo `/delet` → `/delete` (or keep as alias)
3. Fix `length_past` param name → `length_paste`
4. Fix `get_router.py` endpoint typo `/delatproba` → `/deltaproba`
5. Eliminate code duplication between `GeneralServices` and `IndependentGeneralServices`
6. Eliminate code duplication between `Scoring` and `IndependentScoring`
7. Add unit tests for alteration functions
8. Add Redis session tests
9. Add integration tests for FastAPI endpoints
10. Write proper `README.md`

---

*This file is updated at the end of each completed task to reflect the latest project state.*