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
Three alternative frontend MVPs consuming the API above, switchable at runtime via a 3-position toggle. No build step — plain ES modules with Preact + `htm` + Chart.js loaded from a CDN at runtime (no `package.json`/`node_modules`).
- `frontend/serve.py` — stdlib-only static file server that also reverse-proxies API paths to the FastAPI backend, purely to avoid CORS (the backend registers no CORS middleware) without modifying backend code.
- `frontend/src/views/pipeline/` — **Pipeline**: CyberChef-style drag-and-drop recipe of blocks, one per backend endpoint.
- `frontend/src/views/dashboard/` — **Workbench**: dense genome-browser-style researcher dashboard (mutation table, zoomable probability track, zone analysis, alteration toolbox).
- `frontend/src/views/comparative/` — **Compare**: batch console — score a list of point mutations and rank by impact.
- `frontend/src/lib/workspace.js` — shared reactive session/sequence store used by all three views; documents the backend's session/mutation persistence quirks in code comments.
- See `frontend/README.md` for setup/run instructions and a full list of backend behaviors the frontend has to work around (e.g. structural alteration endpoints return `null` and must be followed by a `GET /get/alteredsequence` call).

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