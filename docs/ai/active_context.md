# Active Context

## Current Objectives


## Previous Objectives (superseded)
`fastapi run app/main.py` now boots and serves correctly end-to-end (verified
with `python test_payloads.py`, 11/11 endpoints + 6/6 GET accessors passing
with real SpliceAI output). A three-proposal frontend MVP was added under
`frontend/`. Only the `pattern_in_zona` function is not yet fully operational, but don't worry about it for the moment.

### Completed Tasks

## Current Working Files

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|

## Next Steps (Future / Optional)
- Refactor `InternalGeneticVariant` mega-class: 9-parent multiple inheritance → consider composition
- Fix spelling inconsistency: `independant_gv_schema.py` uses French spelling
- Expose Acceptor Loss and Donor Loss SpliceAI scores
- Add batching support for multiple sequences in a single request
- Dockerize the application
- Add `/health` endpoint
- Rewrite the ~43 stale tests listed in `docs/ai/progress.md` against current `_mutations_target_attr` semantics

---

*This file is updated at the end of each completed task to reflect the latest project state.*
