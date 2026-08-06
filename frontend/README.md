# SpliceProb — Frontend

A CyberChef-inspired frontend for the SpliceProb backend (see `../docs/ai/`
for the backend architecture): stack operation blocks (each mapped 1:1 to a
backend endpoint) in the Recipe panel, reorder them by drag and drop, then
"Bake" to run them sequentially. The output panel shows the resulting
sequence, or a chart/table when the last block is a probability/analysis
endpoint.

No build step: plain ES modules, Preact + [`htm`](https://github.com/developit/htm)
and Chart.js loaded from a CDN (`esm.sh`) at runtime. There is no
`package.json` / `node_modules` to install.

A dark/light theme toggle lives in the app header; the choice persists to
`localStorage` and is applied via a `data-theme` attribute on `<html>`, with
colors resolved through CSS custom properties (`src/styles/base.css`) and,
for the handful of colors Chart.js needs as literal strings (canvas series
fills), a small JS-side palette in `src/lib/theme.js`.

## Why `serve.py` exists

The FastAPI backend (`app/main.py`) registers no CORS middleware, and this
project's scope forbids modifying backend code. Opening `index.html`
directly (or serving it from a different origin/port) would make every
`fetch()` call fail CORS. `serve.py` is a small stdlib-only static file
server that also reverse-proxies API paths (`/GetSimpleProb/`,
`/GetDeltaScore/`, `/resetgv`, `/get/*`, `/altbyindex/*`, `/altbypattern/*`,
`/mutateindependently`, `/analysis/*`) to the backend, so the browser sees
everything as same-origin — the same trick a `vite dev --proxy` config
performs, just without Node.

## Running it

```bash
# Terminal 1 — backend (from the repo root)
fastapi dev app/main.py           # serves on http://127.0.0.1:8000

# Terminal 2 — frontend
python3 frontend/serve.py         # serves on http://127.0.0.1:5500, proxying to :8000
```

Then open <http://127.0.0.1:5500>.

Optional flags: `python3 frontend/serve.py --port 5500 --backend http://127.0.0.1:8000`.

## Known backend quirks the frontend works around

Documented in `src/lib/workspace.js`, but worth repeating:

- The structural alteration endpoints (`/altbyindex/*`, `/altbypattern/*`,
  `/mutateindependently`) return `null` — there is no `return` in those
  FastAPI route handlers. The client always follows up with
  `GET /get/alteredsequence?session_id=...` to observe the effect.
- `session_id` is only ever returned in a JSON body by `/GetSimpleProb/`,
  `/GetDeltaScore/` and `/resetgv`. Every other endpoint requires it as an
  input and stays silent about it.
- `mutations` passed to `/resetgv`, `/GetSimpleProb/` or `/GetDeltaScore/`
  are applied transiently, in-memory, only for that one response — they are
  never written back to the session's `altered_sequence` in Redis. Only the
  structural alteration endpoints persist changes. Point-mutation scoring
  blocks/panels are therefore "probes": they read the current session state
  but don't change what later operations see.
- `POST /ensembl/get` with an *existing* `session_id` silently no-ops — it
  returns a success status but does not update that session's sequence. The
  Ensembl ID field in `SessionBar` always fetches into a throwaway session
  (see `fetchEnsemblSequence` in `workspace.js`) and only fills the draft
  textarea for review, the same way "Upload FASTA…" does.

## Project layout

```
frontend/
  serve.py                 # static file server + API reverse proxy (stdlib only)
  index.html
  src/
    main.js, App.js        # entry point + app shell
    api/client.js           # one function per backend endpoint
    lib/
      preact.js              # pinned Preact + htm CDN imports
      sequence.js             # validation, mutation parsing, diffing, CSV/export helpers
      workspace.js             # shared reactive session/sequence store
      theme.js                 # dark/light theme store + Chart.js literal-color palette
      chartLogic.js            # Chart click-resolution, popover assembly, bar aggregation (no rendering)
    components/shared/       # SequenceTrack, Chart, Popover, Feedback, SessionBar
    views/
      pipeline/                # Recipe builder, block library, output panel
```

## Requirements

Any modern browser with ES module support. No install step. Internet access
is required at runtime to fetch Preact/htm/Chart.js from `esm.sh`.
