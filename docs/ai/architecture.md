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
    │   └── redis_session.py         # Redis session management (get/set with TTL, namespaced keys)
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

### 3. Session Management

The codebase has fully migrated to a **session-based (Factory + Redis) pattern** —
**every** router (`simple_router.py`, `delta_router.py`, `alteration_byindex_router.py`,
`alteration_bypattern_router.py`, `get_router.py`, `resetgv_router.py`, `analysis_router.py`,
`alteration_radom.py`) now uses `create_internal_variant()`. The former singleton/session
duality (documented in earlier revisions of this file) has been resolved.

- Flow: `Pydantic GeneticVariant` → `create_internal_variant()` factory → `InternalGeneticVariant` with `session_id`
- The factory (`app/domain/internal_gv_factory.py`) creates variant instances, stores the base sequence in Redis under `session:{uuid}:base_sequence`, and tracks the current altered sequence under `session:{uuid}:current_altered_sequence`.
- The `AlteredSequenceTrackerMixin` persists one-hot encodings, probability dictionaries, and SpliceAI mutation labels to Redis under `session:{uuid}:altered_sequences`.
- Session data has a TTL of 30 minutes.
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
  was read in full at least once while writing this section (2026-07-09).
  Re-reading them all from scratch each session (as several past Worker/
  Judge sessions have done) is pure wasted tool calls — trust this map,
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
    ├── App.js                      # top-level 3-way SegmentedControl + view switch
    ├── api/
    │   └── client.js               # one function per backend endpoint; thin fetch wrapper
    ├── lib/
    │   ├── preact.js               # re-exports Preact + htm from esm.sh (single import point)
    │   ├── sequence.js             # pure helpers: validation, diffing, label parsing (see 9.3)
    │   └── workspace.js            # shared reactive session store, used by all 3 views (see 9.4)
    ├── components/shared/          # used across 2+ of the 3 proposals — see 9.2
    │   ├── Chart.js                 # Chart.js wrapper — HIGH TRAFFIC, see 9.2
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
  `options` props). As of 2026-07-09 it has **no interactivity** — no click
  handling, no zoom/pan plugin, no region annotation. Called from
  `OutputPanel.js` (×3: `ProbaOutput`, `ProbaHistoryOutput`, `DeltaOutput`),
  `GenomeTrack.js`, `DetailChart.js`, `ManhattanChart.js`. Multiple backlog
  tasks (peak-click popup, zoom controls, pattern-match region shading) all
  extend this same file — expect to need a Chart.js plugin (e.g.
  `chartjs-plugin-zoom`, `chartjs-plugin-annotation`) registered once,
  shared correctly across every one of those call sites, not per-call-site
  reimplementations.
- **`SessionBar.js`** — sequence loader + session indicator, rendered with
  different CSS framing (`compact` prop) in all three proposals. As of
  2026-07-09 (Task 5/6) it has two distinct actions: "Load sequence"
  (changes the *current* session's base sequence in place, disabled with no
  active session) and "Start new session" (always mints a fresh
  `session_id`) — see 9.4 for the backend calls behind each.
- **`SequenceTrack.js`** — monospace FASTA-style viewer, 60 bases/row, a
  position gutter, and per-base diff highlighting against an optional
  `reference` sequence (hover title shows `position N: ref→base`). Also
  accepts `highlightRanges` (zone highlighting, used by `GenomeTrack.js`)
  and, since Task 8, an `operations` Map (0-based position → operation
  summary string, appended to the hover title) used by Pipeline's
  `SequenceOutput`.
- **`Feedback.js`** — `ErrorBanner`, `Spinner`, `StatTile`, `Badge`. No
  modal/popover exists here as of 2026-07-09 — a planned task (peak-click
  popup) needs to add one.
- **`SegmentedControl.js`** — generic N-way toggle; takes an `ariaLabel`
  prop (default `"Frontend proposal"` for the top-level 3-way switch) so a
  second instance (Compare's Data Source toggle) can self-identify to
  screen readers correctly.

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
affects both proposals at once.

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