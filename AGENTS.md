# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Structure

- `app/` — FastAPI backend (SpliceAI splicing-impact API). Routers in `app/router/`, business logic in `app/services/` and `app/domain/`.
- `frontend/` — plain ES modules + CDN imports (Preact + htm, Chart.js), no build step. Single CyberChef-style pipeline UI under `frontend/src/views/pipeline/`, sharing `frontend/src/components/shared/*`, `frontend/src/lib/*`, and `frontend/src/styles/base.css`. (The Workbench/dashboard and Compare/comparative views were removed — pipeline is the only mode.) See `frontend/README.md` for the run/dev-proxy setup (`frontend/serve.py` proxies API calls to the backend to sidestep missing CORS headers — it is a frontend-only dev tool, not part of the backend).

## Backend quirks discovered via live testing

- `POST /ensembl/get` with an *existing* `session_id` returns `{status: "new_sequence_from_ensembl"}` (looks successful) but does **not** actually update that session's stored sequence — a follow-up `GET /get/sequence` for the same session still returns the old text. Always omit `session_id` (or use a fresh one) when calling this endpoint if you need the fetched sequence back; see `frontend/src/lib/workspace.js`'s `fetchEnsemblSequence`.
- `POST /GetDeltaScore/` (and likely `/GetSimpleProb/`) return HTTP 500 when the request's `sequence` field (usually the session's original base sequence) has a different length than the session's current `altered_sequence` after a prior structural alteration (insert/delete/move/etc.) — the two get compared position-by-position server-side. Pre-existing, reproducible via plain `curl`, not something the frontend can fully work around; `app/` is out of scope for most frontend-focused tasks.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
