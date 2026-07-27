# Architecture Document: SpliceProb

## Directory Structure

```
SpliceProbRepo/
├── .gitignore
├── README.md
├── requirements.txt
├── pytest.ini                       # excludes test_functions.py (manual script) from pytest collection
├── test_payloads.py                 # standalone end-to-end smoke script (POSTs every endpoint against a live server)
├── notes_human.txt                  # human session notes (not AI-maintained)
├── docs/
│   └── ai/                          # AI Memory Bank (this directory)
│       ├── project_brief.md
│       ├── architecture.md
│       ├── progress.md
│       ├── active_context.md
│       └── audits_history.md        # archived audit/bug-fix history
├── .clinerules                      # AI behavior instructions
├── frontend/                        # 3 frontend MVP proposals (see "Frontend Layer" below and frontend/README.md)
└── app/
    ├── __init__.py
    ├── main.py                      # FastAPI application entry point
    ├── client/
    │   └── __init__.py              # (empty — placeholder for client code)
    ├── domain/
    │   ├── __init__.py
    │   ├── calcul_function.py       # Input validation (IsValid), scoring (Scoring, IndependentScoring)
    │   ├── genomic_analysis.py      # ImportanceSplicingSearch (zone detection), SpliceAIModels (tf.keras wrapper)
    │   ├── internal_gv_factory.py   # Factory for creating session-bound InternalGeneticVariant instances
    │   ├── mixins.py                # AlteredSequenceTrackerMixin — Redis-based mutation tracking
    │   ├── proba_laws_functions.py  # Probability law functions (incomplete stub)
    │   ├── sequence_functions.py    # Alteration functions, SequenceFactory, RandomAlteration, WindowMutation
    │   ├── spliceai_calculation.py  # SpliceAI model loading, one-hot encoding, prediction, tuple_mutation
    │   └── initialization/
    │       └── initalize_my_model.py # Singleton SpliceAIModels instance (my_model)
    ├── errors/
    │   ├── __init__.py
    │   └── errors_and_warnings.py   # Custom exceptions and warnings
    ├── models/
    │   └── __init__.py              # (empty — could host custom model code)
    ├── router/
    │   ├── __init__.py
    │   ├── alteration_byindex_router.py  # POST endpoints for index-based mutations (delete, insert, move, copy-paste)
    │   ├── alteration_bypattern_router.py # POST endpoints for pattern-based mutations (replace, delete)
    │   ├── alteration_radom.py           # POST endpoint for random/probabilistic mutations
    │   ├── analysis_router.py            # POST endpoint for zone/pattern analysis
    │   ├── delta_router.py               # POST endpoint for delta score computation
    │   ├── get_router.py                 # GET endpoints for retrieving variant state
    │   ├── resetgv_router.py             # POST endpoint for resetting the internal variant
    │   └── simple_router.py              # POST endpoint for simple probability computation
    ├── schemas/
    │   ├── general_schema.py        # GeneticVariant Pydantic model (API layer)
    │   ├── independant_gv_schema.py # IndependentGeneticVariant (simpler, non-persistent variant)
    │   ├── internal_gv_schema.py    # InternalGeneticVariant (domain layer mega-class)
    │   └── typing.py               # Custom type aliases (genome, mut, JSON, MutationMatrix, etc.)
    ├── services/
    │   ├── __init__.py
    │   ├── general_services.py      # GeneralServices + IndependentGeneralServices (result_per_seqences, return_proba_*)
    │   └── redis_session.py         # Redis session management (get/set, namespaced keys, no expiry by default)
    └── test/
        ├── __inti__.py
        ├── global_var.py            # Global variables for tests (CONTEXT, BASE, paths)
        ├── output_gradiant.json     # Test output for gradient analysis
        ├── proba.json               # Test output for probability data
        ├── test_analysis_regression.py # Regression tests for genomic analysis
        ├── test_functions.py        # Manual/script-based testing with visualization
        └── test_independent_gv.py   # Unit test for IndependentGeneticVariant
```

## Layer Architecture

```
 ┌─────────────────────────────────────────────────┐
 │                  API LAYER (FastAPI)              │
 │  routers: simple, delta, altbyindex, altbypattern │
 │  alteration_radom, analysis, get, resetgv         │
 │  Schemas: GeneticVariant (Pydantic BaseModel)      │
 ├─────────────────────────────────────────────────┤
 │               SERVICE LAYER                       │
 │  GeneralServices / IndependentGeneralServices     │
 │  redis_session (Redis client wrapper)             │
 │  Mixin: AlteredSequenceTrackerMixin               │
 ├─────────────────────────────────────────────────┤
 │               DOMAIN LAYER                        │
 │  InternalGeneticVariant (mega-class via MI)       │
 │  ├── AlterationFunctionsByIndex                   │
 │  ├── AlterationFunctionsByPattern                 │
 │  ├── SequenceFactory                              │
 │  ├── RandomAlterationFunctions                    │
 │  ├── WindowMutationFunctions                      │
 │  ├── ImportanceSplicingSearch                     │
 │  ├── IsValid                                      │
 │  ├── Scoring                                      │
 │  └── GeneralServices (inherited)                  │
 │  IndependentGeneticVariant (simpler standalone)   │
 │  SpliceAIModels (tf.keras.Model wrapper)          │
 ├─────────────────────────────────────────────────┤
 │            INFRASTRUCTURE LAYER                   │
 │  Redis (session state)                            │
 │  SpliceAI .h5 model files (via spliceai package)   │
 │  TensorFlow runtime                               │
 └─────────────────────────────────────────────────┘
```

## Core Components and Data Flow

### 1. Application Entry Point (`app/main.py`)
- Creates a `FastAPI()` instance.
- Includes 7 routers, each with optional URL prefixes.
- Interactive documentation is auto-generated at `/docs`.

### 2. Routers (API Endpoints)

| Endpoint | Method | Router File | Purpose |
|----------|--------|-------------|---------|
| `/GetSimpleProb/` | POST | `simple_router.py` | Returns baseline splicing probabilities for a sequence |
| `/GetDeltaScore/` | POST | `delta_router.py` | Returns delta (change) in splicing scores after mutations |
| `/resetgv` | POST | `resetgv_router.py` | Resets the singleton internal genetic variant |
| `/get/sequence` | GET | `get_router.py` | Returns the current sequence from singleton variant |
| `/get/gv` | GET | `get_router.py` | Returns all public fields of the singleton variant |
| `/get/simpleproba` | GET | `get_router.py` | Returns cached/calculated simple probabilities |
| `/get/deltaproba` | GET | `get_router.py` | Returns cached/calculated delta probabilities |
| `/get/mutations` | GET | `get_router.py` | Returns current mutations list |
| `/get/alteredsequence` | GET | `get_router.py` | Returns current altered sequence |
| `/altbyindex/delet` | POST | `alteration_byindex_router.py` | Delete by index |
| `/altbyindex/insert` | POST | `alteration_byindex_router.py` | Insert pattern at index |
| `/altbyindex/move` | POST | `alteration_byindex_router.py` | Cut-and-paste by index |
| `/altbyindex/copypast` | POST | `alteration_byindex_router.py` | Copy-and-paste by index |
| `/altbypattern/replace` | POST | `alteration_bypattern_router.py` | Replace pattern (regex-based) |
| `/altbypattern/delet` | POST | `alteration_bypattern_router.py` | Delete by pattern (regex-based) |
| `/mutateindependently` | POST | `alteration_radom.py` | Mutate each base independently by probability matrix |
| `/analysis/patterninzona` | POST | `analysis_router.py` | Find most impactful windowed mutations in zones of interest |
| `/analysis/rubberwindow` | POST | `analysis_router.py` | Slide masked ("N"-filled) windows across a sequence and measure the donor/acceptor score shift at a given exon's boundaries. Two mutually exclusive tiling modes (`window_size` fixed tiling, or `all_window_size=(m,n)` overlapping per-base tiling) — see `SpotPositionFunctions.rubber_window()`'s docstring. Response keys are `"{start}_{end}"` strings (not the domain layer's `(start, end)` tuples, which aren't valid JSON object keys). |

### 3. Session Management

The codebase has fully migrated to a **session-based (Factory + Redis) pattern** —
**every** router (`simple_router.py`, `delta_router.py`, `alteration_byindex_router.py`,
`alteration_bypattern_router.py`, `get_router.py`, `resetgv_router.py`, `analysis_router.py`,
`alteration_radom.py`) now uses `create_internal_variant()`. The former singleton/session
duality (documented in earlier revisions of this file) has been resolved.

- Flow: `Pydantic GeneticVariant` → `create_internal_variant()` factory → `InternalGeneticVariant` with `session_id`
- The factory (`app/domain/internal_gv_factory.py`) creates variant instances, stores the base sequence in Redis under `session:{uuid}:base_sequence`, and tracks the current altered sequence under `session:{uuid}:current_altered_sequence`.
- The `AlteredSequenceTrackerMixin` persists one-hot encodings, probability dictionaries, and SpliceAI mutation labels to Redis under `session:{uuid}:altered_sequences`.
- Session data has no expiry by default (`set_session_data()`'s `ttl` param defaults to `None`, i.e. no `EX` set on the Redis key); no call site currently passes an explicit `ttl`.
- If no real Redis server is reachable, `app/services/redis_session.py` transparently falls back to an in-memory `fakeredis` client.

#### Legacy singleton (vestigial, not used by any live endpoint)
- `app/domain/initialization/initialize_internal_gv.py` still defines a global `my_internal_genetic_variant` instance.
- It is imported **only** by `app/test/test_functions.py` (a manual/script-based tool, excluded from pytest via `pytest.ini`) — no router references it anymore.
- Safe to remove once `test_functions.py` is updated or retired; kept for now for backward compatibility with that script.

### 4. InternalGeneticVariant (Domain Mega-Class)
This is the central domain object, built via **multiple inheritance** from 9 parent classes:

- **AlterationFunctionsByIndex** — `insert()`, `delete_by_index()`, `move()`, `copy_past()`
- **AlterationFunctionsByPattern** — `replace()`, `delete_by_pattern()` with wildcard support (`_` and `%(n)`)
- **SequenceFactory** — `repeat()`, `merge()`
- **RandomAlterationFunctions** — `mutate_independently()` using a 4×4 mutation probability matrix
- **WindowMutationFunctions** — `enumerate_window_mutants()` exhaustively tests windowed mutants
- **ImportanceSplicingSearch** — `_zona()` (change-point detection), `pattern_in_zona()` (most impactful patterns)
- **IsValid** — `test_mutations()`, `test_sequence()` input validation
- **Scoring** — `mut()` computes a vector norm score from delta probabilities
- **GeneralServices** — `result_per_seqences()`, `return_proba_simple()`, `return_proba_delta()`

The `__init__` applies mutations via `apply_mutations()` and initializes `proba_simple`, `proba_delta`, and `there_is_change` tracking flags.

### 5. SpliceAI Integration (`spliceai_calculation.py`)

- **`one_hot_encoder()`**: Converts DNA sequences to 4-channel one-hot encoding with N-padding flanking context (default 10,000 bases).
- **`calcul_y()`**: Runs one-hot encoded sequences through 1–5 SpliceAI models (loaded from the `spliceai` package resource files) and averages their predictions. Returns shape `[1, seq_len, 4]` where the 4 channels are: Acceptor Gain, Donor Gain, Acceptor Loss, Donor Loss.
- **`SpliceAIModels`**: A `tf.keras.Model` subclass that loads all 5 SpliceAI models, provides `run()` and `_one_hot_encoder()` methods, and supports gradient tracking via `keep_gradiant=True`.
- **`tuple_mutation()`**: Compares two sequences and returns a tuple of mutation strings in `>p.<pos>.<ref>><alt>` format.

### 6. Data Flow for a Typical Request

```
Client POST /GetDeltaScore/
  → Pydantic validates GeneticVariant (name, sequence, mutations)
  → IsValid.test_mutations() and test_sequence()
  → create_internal_variant(sequence, mutations, session_id)
       → If new session: store base_sequence in Redis
       → If existing session: retrieve base_sequence from Redis
       → Create InternalGeneticVariant instance
  → gv_instance.return_proba_delta()
       → apply_mutations() — applies mutations to altered_sequence
       → result_per_seqences() — runs SpliceAI on ORIGINAL sequence → y → acceptor/donor proba dict
       → result_per_seqences(using_altered_seqence=True) — runs SpliceAI on ALTERED sequence
       → Compute per-position delta: altered_value - original_value
       → Return JSON with delta values, altered_sequence, and session_id
  → FastAPI returns JSON response
  → (If alteration endpoint): _track_alteration() persists one_hot + proba + mutation label to Redis
```

### 7. IndependentGeneticVariant (Alternative Path)
- A simpler variant that inherits only from `IndependentGeneralServices`, which now only overrides the `_mutations_target_attr` class attribute (`"altered_sequence"` instead of `"sequence"`) — the former near-duplicate implementation was eliminated.
- Used by `genomic_analysis.py` for zone detection analysis (`_zona()`, `pattern_in_zona()`).
- Self-contained: applies mutations onto `altered_sequence`, computes proba_delta via SpliceAI, and scores results. Callers must seed `altered_sequence` with a real, correctly-sized sequence (e.g. a copy of `sequence`) — mutations are applied by 1-based position, so an empty or placeholder `altered_sequence` raises `IndexError`.

### 8. Type System (`app/schemas/typing.py`)
Custom type aliases used throughout:
- `genome` = `str` (DNA sequence, ATCG only)
- `mut` = `str` (mutation string like `>p.8.a>c`)
- `JSON` = `dict[str, Any]`
- `MutationMatrix` = `np.ndarray[np.float64]` (4×4 probability matrix) — used as a plain Python type hint in the domain layer (`sequence_functions.py`, `proba_laws_functions.py`). **Not** used as a Pydantic field type: `alteration_radom.py`'s `MutateIndependentlyParameters.prob_mat` uses `list[list[float]]` instead, since Pydantic v2 cannot generate a schema for a bare `numpy.typing.NDArray` alias. Same JSON wire format either way.
- `percentage` = `int`

### 9. Frontend Layer (`frontend/`)

Three alternative frontend MVPs consuming the API above, switchable at
runtime via a 3-position `SegmentedControl` in `App.js`. **No build step** —
plain ES modules with Preact + [`htm`](https://github.com/developit/htm) +
Chart.js loaded from `esm.sh` at runtime (no `package.json`/`node_modules`,
no bundler, no test runner). This has two direct consequences every session
touching the frontend should plan around:
- **No automated verification exists.** `pytest` covers only `app/`. Frontend
  correctness checking in past sessions has been: (a) brace/paren/bracket
  balance on edited files, (b) `frontend/serve.py` byte-diffing served files
  against disk (catches truncation/encoding mistakes only), (c) manually
  tracing `htm` template logic against real backend response shapes fetched
  live. None of this substitutes for actually opening the app in a browser —
  do that if the environment has one; if not, say so explicitly rather than
  claiming the UI works.
- **Read this section instead of re-exploring the tree.** Every file below
  was read in full at least once while writing this section (2026-07-09;
  the Chart.js/chartLogic.js/theme.js/SessionBar.js/Pipeline-column
  subsections were re-verified against the 2026-07-14 UX overhaul). Re-
  reading them all from scratch each session (as several past Worker/Judge
  sessions have done) is pure wasted tool calls — trust this map,
  spot-check only the specific file(s) your task touches.

#### 9.1 Directory map

```
frontend/
├── README.md                       # setup/run instructions
├── serve.py                        # stdlib static file server + API reverse
│                                    # proxy (avoids CORS without touching
│                                    # backend — backend has no CORS middleware)
└── src/
    ├── main.js                     # mounts <App/>
    ├── App.js                      # top-level 3-way SegmentedControl + view switch,
    │                                # a "New session" shortcut button (mints a fresh
    │                                # session with a hardcoded default sample sequence,
    │                                # bypassing SessionBar's draft textarea), and the
    │                                # theme toggle
    ├── api/
    │   └── client.js               # one function per backend endpoint; thin fetch wrapper
    ├── lib/
    │   ├── preact.js               # re-exports Preact + htm from esm.sh (single import point)
    │   ├── sequence.js             # pure helpers: validation, diffing, label parsing (see 9.3)
    │   ├── workspace.js            # shared reactive session store, used by all 3 views (see 9.4)
    │   ├── theme.js                # dark/light theme store + Chart.js literal-color palette (see 9.2)
    │   └── chartLogic.js           # Chart click-resolution/popover/bar-aggregation logic, no rendering (see 9.2)
    ├── components/shared/          # used across 2+ of the 3 proposals — see 9.2
    │   ├── Chart.js                 # Chart.js wrapper — HIGH TRAFFIC, see 9.2
    │   ├── Popover.js               # chart click-popup (position, scores, sequence context)
    │   ├── SessionBar.js            # sequence loader / session indicator
    │   ├── SequenceTrack.js         # monospace diff-highlighted sequence viewer
    │   ├── Feedback.js              # ErrorBanner, Spinner, StatTile, Badge
    │   └── SegmentedControl.js      # generic N-way toggle (top bar + Compare's data-source toggle)
    └── views/
        ├── pipeline/                # Proposal 1 — "Pipeline" (CyberChef-style), see 9.5
        │   ├── PipelineView.js       # top-level layout, drag/drop orchestration, bake()
        │   ├── blockDefinitions.js   # BLOCK_DEFINITIONS — one entry per backend endpoint
        │   ├── BlockForm.js          # generic field renderer driven by a block's `fields` schema
        │   ├── BlockLibrary.js       # left-column palette, drag source for new blocks
        │   ├── RecipeBlock.js        # one stacked block instance in the recipe
        │   ├── OutputPanel.js        # renders the last block's result by outputKind
        │   └── pipeline.css
        ├── dashboard/                # Proposal 2 — "Workbench" (always-visible panel grid)
        │   ├── DashboardView.js      # 3-column panel grid layout
        │   ├── dashboard.css
        │   └── panels/
        │       ├── MutationManager.js    # point-mutation table → scoreDelta/scoreSimple probes
        │       ├── GenomeTrack.js        # synchronized sequence + proba/delta Chart, windowed
        │       ├── DeltaSummary.js       # stat tiles from the last delta result (no chart)
        │       ├── ZonePanel.js          # PELT zone analysis; reports positions up for GenomeTrack highlight
        │       ├── AlterationToolbox.js  # single-shot structural edits, reuses BlockForm+blockDefinitions
        │       └── HistoryLog.js         # client-side ws.history feed + TrackedProbabilities subsection
        └── comparative/              # Proposal 3 — "Compare" (batch console)
            ├── ComparativeView.js     # Data Source toggle (delta batch vs. tracked-alteration proba)
            ├── RankingTable.js        # sortable table, mode-aware column labels
            ├── ManhattanChart.js      # scatter overview, mode-aware axis labels
            ├── DetailChart.js         # per-row detail trace, mode-aware flatten function
            ├── DiffView.js            # stacked reference/altered sequence diff
            ├── ExportBar.js           # CSV/JSON export of the ranking table
            └── comparative.css
```

#### 9.2 Shared components — high blast-radius, check for collisions before editing

These are imported by multiple views/proposals. A change here affects
everything downstream; before editing, grep for every call site and check
`docs/ai/progress.md`'s active backlog for other tasks touching the same
file (several planned tasks explicitly overlap here — see the file itself).

- **`Chart.js`** — thin Chart.js wrapper (`type`, `labels`, `datasets`,
  `options`, `sequence`, `companionDatasets` props). Owns only the
  `<canvas>`/Chart.js instance lifecycle and drawing; click-resolution,
  popover-content assembly, bar aggregation and y-axis extents are pure
  functions in `lib/chartLogic.js` (split out so that logic is
  chart.js-agnostic and independently reasoned-about — see that file's
  header comment for the rationale), only *called* from here. Called from
  `OutputPanel.js` (×3+: `ProbaOutput` now renders two charts, acceptor and
  donor, linked via `companionDatasets` so a click on either shows both
  scores; `ProbaHistoryOutput`, `DeltaOutput`), `GenomeTrack.js`,
  `DetailChart.js`, `ManhattanChart.js`. Current interactivity: clicking a
  data point (when a `sequence` prop is supplied) opens a `Popover.js`
  showing position/scores/±10bp sequence context and drops a persistent
  vertical marker line until the popup is closed or a new point is
  clicked; `chartjs-plugin-zoom` is registered once at module scope
  (wheel-zoom requires **Ctrl** — plain wheel is left free for page scroll
  — plus click-drag panning and `+`/`-`/reset toolbar buttons, right-aligned;
  there is no drag-to-zoom and no pan-range slider, and no on-screen "Ctrl +
  scroll to zoom" hint — that static text label was removed in the
  2026-07-15 plan5 UX pass). Bar charts above 500 points are
  downsampled by `chartLogic.js`'s `aggregateBarSeries()` (keeps the 150
  largest-magnitude bars full width, collapses intervening runs into a
  thin placeholder bar at that run's own peak) and use
  `resolveNearestBarIndex()` to resolve a click near a short/tall bar
  boundary to the taller bar. Y-axis `max`/`min` are set from the actual
  data extremes (`computeYAxisExtent()`) instead of Chart.js's default
  auto-padding. Series colors for canvas fills (not CSS-themeable) come
  from `lib/theme.js`'s `seriesColors()`. Any further backlog task
  extending clicking/zoom/annotation behavior should land in
  `chartLogic.js` if it's data/logic, or `Chart.js` only for
  rendering/plugin wiring — shared correctly across every call site above,
  not per-call-site reimplementations.
- **`SessionBar.js`** — sequence loader + session indicator, rendered with
  different CSS framing (`compact` prop) in all three proposals. It has
  three distinct actions: "Load sequence" (changes the *current* session's
  base sequence in place, disabled with no active session), "Start new
  session" (always mints a fresh `session_id`), and "Upload FASTA…" / an
  "Ensembl ID…" field + "Fetch Ensembl" button, both of which only *fill
  the draft textarea* for review — nothing is sent to the backend until
  "Load sequence" or "Start new session" is clicked afterward. The Ensembl
  fetch deliberately requests a **throwaway session** (never the active
  `session_id`) because `POST /ensembl/get` silently no-ops on an existing
  `session_id` — see 9.4 point 6 and root `AGENTS.md`. See 9.4 for the
  backend calls behind each action. As of the 2026-07-15 plan5 pass, it no
  longer renders the `session <id>…` / `N bp` indicator badges next to
  "Fetch Ensembl" — `App.js`'s separate "New session" header button (9.1)
  is now the quick one-click way to mint a session without those badges.
- **`SequenceTrack.js`** — monospace FASTA-style viewer, 60 bases/row, a
  position gutter, and per-base diff highlighting against an optional
  `reference` sequence (hover title shows `position N: ref→base`). Also
  accepts `highlightRanges` (zone highlighting, used by `GenomeTrack.js`)
  and, since Task 8, an `operations` Map (0-based position → operation
  summary string, appended to the hover title) used by Pipeline's
  `SequenceOutput`.
- **`Popover.js`** — the chart click-popup (position, per-dataset scores,
  ±10bp sequence context). Positioned via coordinates the caller computes
  relative to the chart canvas's own bounding rect (not the viewport),
  since it renders `position: absolute` inside a `position: relative`
  ancestor.
- **`Feedback.js`** — `ErrorBanner`, `Spinner`, `StatTile`, `Badge`.
- **`SegmentedControl.js`** — generic N-way toggle; takes an `ariaLabel`
  prop (default `"Frontend proposal"` for the top-level 3-way switch) so a
  second instance (Compare's Data Source toggle) can self-identify to
  screen readers correctly.
- **`lib/theme.js`** — hand-rolled reactive store mirroring `workspace.js`'s
  pattern (module-level value + listener `Set` + a `useTheme()` hook);
  persists `"dark"|"light"` to `localStorage` and applies it via
  `data-theme` on `<html>`. Most colors are themed through CSS custom
  properties in `styles/base.css`; this module additionally exposes
  `seriesColors()`, a JS-side mirror of a few of those same colors for the
  one place CSS variables can't reach — literal color strings handed to
  Chart.js for canvas fills. Keep the two palettes in sync by eye when
  either changes.

#### 9.3 `frontend/src/lib/sequence.js` — pure helper functions

No backend calls, no state — safe to unit-reason-about in isolation.
`cleanSequence()`/`isValidSequence()` (strict ACGT, case-insensitive),
`buildMutation()` (constructs `>p.<pos>.<ref>><alt>` strings),
`flattenProbaTrack()`/`flattenDeltaTrack()` (backend's
`{index: {base: value}}` / `{index: {value, delta_proportion_variation}}`
dicts → parallel arrays for Chart.js), `parseTrackedLabel()` (tracked-
alteration human label → `{from, to, summary}` position range — as of
Task 8's fix, returns `null` rather than a fabricated range for operation
types the label doesn't encode a position for), `diffToPointMutations()`
(Task 9 — same-length before/after diff → point-mutation strings, rejects
length-changing diffs). `toCsv()`/`downloadFile()` for exports.

As of the 2026-07-15 plan5 pass: `parseTrackedAlterationDisplay(label, entry)`
renders a tracked-alteration label as `**{step}** : **{operation type}** :
[{from} - {to}]` (falling back to `(all mutations applied)` when no range is
determinable) — used by both `OutputPanel.js`'s `TrackedAlterationEntry` and
`RecipeBlock.js`'s expandable tracked-entry list instead of the raw backend
label string. `maxTrackedDelta(entry)`/`topTrackedEntries(entriesByLabel,
topN)` rank a `GET /get/allsimpleprobas` label→entry map by each entry's
largest-magnitude acceptor/donor delta, powering the Tracked Alterations
block's new "Show only top entries" / "Top N entries" fields (9.5).

#### 9.4 `frontend/src/lib/workspace.js` — the shared state store

A hand-rolled reactive store (not Redux/Zustand — just a module-level
object + a `Set` of listener callbacks + `useWorkspace()` hook that
re-renders on any change). Survives switching the top-level 3-way toggle,
which is what makes the proposals feel like one app instead of three.

**State shape:** `{ name, baseSequence, sessionId, alteredSequence, history[],
lastResult, lastError, busy }`. `history` entries are
`{ id, ts, kind: 'init'|'structural'|'probe'|'error', label, detail?, at }`.

**Method contract (all wrapped in `withBusy()` — sets `busy`, catches
errors into `lastError`):**
| Method | Backend call | Session effect |
|---|---|---|
| `initSession(sequence, name?)` | `POST /resetgv`, `session_id: null` | Always mints a **new** session; resets all client state. |
| `loadSequenceIntoSession(sequence, name?)` | `POST /resetgv`, existing `session_id` + non-empty `sequence` | In-place: changes `base_sequence`, clears tracked history, **same** `session_id`. (Task 5/6.) |
| `resetSession()` | `POST /resetgv`, existing `session_id` + **unchanged** `sequence` | Clears tracked history only, `base_sequence` untouched. Used by Pipeline's `bake()` before re-running alteration blocks (Task 7). |
| `fetchEnsemblSequence(ensemblId)` | `POST /ensembl/get` with `session_id: null`, then `GET /get/sequence` on the returned session | Read-only from the caller's perspective — mints and discards a throwaway session purely to read back the fetched sequence text; does not touch the active session. See quirk 6 below for why. |
| `refreshAlteredSequence()` / `runAlteration(label, apiCall)` | `GET /get/alteredsequence` | Structural alteration endpoints return `null` by design (no `return` in the route handler) — this is the **only** way to observe their effect. |
| `scoreSimple(mutations)` / `scoreDelta(mutations)` | `POST /GetSimpleProb/` / `POST /GetDeltaScore/` | **Read-only probe** — mutations are applied transiently in-memory server-side, never written back to the session. Does not chain into structural operations. |
| `fetchAllSimpleProbas()` | `GET /get/allsimpleprobas` | Read-only. |
| `analyzeZones(params)` | `POST /analysis/patterninzona` | Read-only. |

**Backend quirks the frontend works around (all confirmed by reading the
actual router code, not assumed):**
1. Structural alteration endpoints (`/altbyindex/*`, `/altbypattern/*`,
   `/mutateindependently`) return `null` — always follow with
   `GET /get/alteredsequence` to see the effect.
2. Point-mutation scoring (`/GetSimpleProb/`, `/GetDeltaScore/`) is a
   read-only probe against whatever the session's `altered_sequence`
   currently is — it does **not** persist and does **not** chain with
   structural operations, even though both "mutate" the sequence
   conceptually.
3. The session model is a **single linear chain** — one
   `current_altered_sequence` per session that every structural operation
   builds on. There is no branching/multi-variant state (relevant if a
   task ever needs to represent "N alternative outcomes" — see Task 17's
   explicit design note in `progress.md`).
4. Sequence validation is strict ACGT only, case-insensitive — no `N`/IUPAC
   ambiguity codes accepted (relevant to Task 19, FASTA upload).
5. `POST /resetgv` has two different in-place behaviors depending on
   payload as of Task 5 — see the method table above; don't assume
   "existing `session_id`" always means "reconnect without change" the way
   it did before Task 5.
6. `POST /ensembl/get` with an *existing* `session_id` returns a success
   status but does **not** actually update that session's stored sequence —
   a follow-up `GET /get/sequence` for the same session still returns the
   old text. `fetchEnsemblSequence()` always omits `session_id` (mints a
   throwaway one) to get the fetched sequence back; see root `AGENTS.md`.

#### 9.5 The Pipeline's block/recipe pattern

`blockDefinitions.js`'s `BLOCK_DEFINITIONS` array is the single source of
truth for every block: `id`, `category` (`Index-based`/`Pattern-based`/
`Random`/`Scoring`/`Analysis` — categories `Index-based`/`Pattern-based`/
`Random` map 1:1 to "this block mutates the session's sequence" and are
checked by name in `PipelineView.js`'s `bake()`, e.g. for the Task 7 reset
fix — keep that check in sync if categories are ever renamed), `label`,
`summary`, `fields` (schema consumed generically by `BlockForm.js` — adding
a block never requires touching `BlockForm.js`), `outputKind` (drives which
`OutputPanel.js` sub-renderer fires), and `run(params)` (calls into
`workspace`). `AlterationToolbox.js` (Workbench) reuses this exact same
array for its single-shot operation picker — a block definition change
affects both proposals at once. `BlockForm.js`'s field-type registry
(`FIELD_COMPONENTS`) also has a `checkbox` type (`CheckboxField`, plan5)
alongside `sequence`/`int`/`select`/`mutationList`/`matrix4x4`/`modelSet` —
the "Tracked Alterations → Baseline Probability" block uses it for a
`showTopOnly` toggle plus an `int` `topN` field (default top 5), consumed by
`topTrackedEntries()` (9.3) in both `OutputPanel.js`'s `ProbaHistoryOutput`
and `RecipeBlock.js`'s expandable tracked-entry list (entries outside the
top-N are rendered plain, top-N entries bolded, when the toggle is on).

Dragging a block onto a Scoring block's mutation-list field works from two
different sources, both handled in `PipelineView.js`: dragging an
already-baked recipe block (`handleDropOnMutationList`) diffs its captured
before/after sequence into point mutations and appends them directly;
dragging a block straight out of the library (`handleDropLibraryBlockOnMutationList`,
never baked yet, so it has no diff to translate) instead adds it to the
recipe just before the target and returns an inline message telling the
user to Bake, then drag it again — now from the recipe stack, not the
library — to actually append its mutations.

The recipe stack's drop target and its "no blocks yet" empty state used to
be two separate elements (a full-panel placeholder shown only when
`recipe.length === 0`, plus a small permanent "drop here to append" tail
strip); as of plan5 they're merged into one always-rendered tail drop zone
("drop operation blocs here") that also serves as the empty-recipe
affordance, so there's a single drop target regardless of recipe length.
The "Bake ▶" button moved out of the "Recipe" panel-title row into its own
full-width `recipe__bake-btn` under the title. While a bake is running, the
Output panel shows a "Stop" button (`output__stop-btn`, sets a `cancelRef`
checked before each remaining block runs — later blocks are marked
`skipped`, same as the pre-existing post-error skip path) next to the
`Spinner`.

The three Pipeline columns (library/recipe/output) have draggable
`col-resize` boundaries (`pipeline-view__resize-handle`, driven by
`libraryWidth`/`recipeWidth`/`outputWidth` state in `PipelineView.js`); each
floor (`MIN_LIBRARY_WIDTH`/`MIN_OUTPUT_WIDTH`) matches the column's old
fixed width, so resizing can never squeeze a column away entirely. As of
plan5 the second handle resizes the **output** column instead of the
recipe column (`MIN_RECIPE_WIDTH` was removed; the recipe column has no
floor of its own beyond what the other two columns' floors leave it), and
the output column has a fixed pixel width (`${outputWidth}px`) instead of
the previous `minmax(${MIN_OUTPUT_WIDTH}px, 1fr)` flexible track.

`OutputPanel.js` renders every block's result from the most recent bake, not
just the last one: `bake()` accumulates each block's `{ kind, data, params }`
into `finalResult.allResults`, and `OutputPanel` maps over that array,
inserting an `output-panel__divider` `<hr>` between entries (only the last
entry gets the run's `operations` Map for `SequenceOutput`'s hover titles).

## Key Design Patterns
- **Factory Pattern**: `create_internal_variant()` in `internal_gv_factory.py`
- **Mixin Pattern**: `AlteredSequenceTrackerMixin` adds Redis persistence to alteration classes
- **Multiple Inheritance / Composition over Inheritance tension**: `InternalGeneticVariant` inherits from 9 parent classes — this is a "mega-class" anti-pattern that creates tight coupling. Still unresolved (see Known Architectural Issues).
- **Strategy Pattern**: Scoring methods (euclidean, manhattan, pondered, quadratic) selectable via parameter
- **Decorator Pattern**: `wrapp_calcul` times function execution and prints timing to stdout

## Known Architectural Issues

### Resolved (kept here for history — see `docs/ai/audits_history.md` for full details)
- ~~Missing `initialize_internal_gv.py` module~~ — exists, but is now vestigial (see "Session Management" above).
- ~~Code duplication between `GeneralServices`/`IndependentGeneralServices`~~ — eliminated.
- ~~Code duplication between `Scoring`/`IndependentScoring`~~ — eliminated (`IndependentScoring = Scoring` alias).
- ~~Singleton vs Session duality~~ — resolved; all routers use the session-based factory.

### Still open
1. **Mega-class inheritance**: `InternalGeneticVariant` inherits from 9 parent classes. Consider composition instead.
2. **Incomplete features**: `ProbaLawsFunctions.mutate_base()` returns `None` (stub, and appears unused — `RandomAlterationFunctions.proba_law()` in `sequence_functions.py` implements the same concept independently). Gradient-based Integrated Gradients code is commented out in `genomic_analysis.py`.
3. **Spelling inconsistency**: `app/schemas/independant_gv_schema.py` uses the French spelling "independant" vs "independent" used elsewhere.
4. **Third-party incompatibility patched locally**: `spliceai.utils.one_hot_encode()` (installed package) calls a NumPy binary-mode API that NumPy 2.x removed. `app/domain/spliceai_calculation.py` now defines a local, output-identical `one_hot_encode()` instead of importing the upstream one — if `spliceai` is ever upgraded to a NumPy-2-compatible release, this local shim could be removed.
5. **`/analysis/patterninzona` reliability**: endpoint returns 200 with real output in smoke testing (`test_payloads.py`), but has been flagged as not fully reliable/operational in all cases — not yet root-caused. See `docs/ai/progress.md`.
6. **`/analysis/rubberwindow` latency**: `all_window_size` mode's overlapping tiling can produce far more windows than a fixed `window_size` sweep. Measured live against the real 5-model ensemble: a 200bp sequence with `all_window_size=[4,8]` (678 windows, `batch_size=50`, ~14 batches) took ~206s end-to-end. Scale roughly linearly with window count for longer sequences or wider `all_window_size` ranges — there is no timeout, background job, or sequence-length cap (intentionally not added speculatively), so a caller should keep `all_window_size` ranges and sequence length modest, or use `interval` to scope the analysis to a sub-region, until a real usage pattern justifies more.