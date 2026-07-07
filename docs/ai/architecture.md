# Architecture Document: SpliceProb

## Directory Structure

```
SpliceProbRepo/
├── .gitignore
├── README.md
├── requirements.txt
├── docs/
│   └── ai/                          # AI Memory Bank (this directory)
├── .clinerules                      # AI behavior instructions
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

### 3. Session Management & Two Variant Paradigms

There are **two competing architectural patterns** in the codebase:

#### A. Session-based (Newer Pattern — Factory + Redis)
- Used by: `simple_router.py`, `delta_router.py`, `alteration_byindex_router.py`, `alteration_bypattern_router.py`
- Flow: `Pydantic GeneticVariant` → `create_internal_variant()` factory → `InternalGeneticVariant` with `session_id`
- The factory (`app/domain/internal_gv_factory.py`) creates variant instances, stores the base sequence in Redis under `session:{uuid}:base_sequence`, and tracks the current altered sequence under `session:{uuid}:current_altered_sequence`.
- The `AlteredSequenceTrackerMixin` persists one-hot encodings, probability dictionaries, and SpliceAI mutation labels to Redis under `session:{uuid}:altered_sequences`.
- Session data has a TTL of 30 minutes.

#### B. Singleton-based (Legacy Pattern)
- Used by: `get_router.py`, `resetgv_router.py`, `analysis_router.py`, `alteration_radom.py`
- References `my_internal_genetic_variant` imported from `app.domain.initialization.initialize_internal_gv`
- **This module does not exist yet on disk** — it must be created for these routers to function.
- This pattern uses a single global instance, incompatible with multi-user isolation.

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
- A simpler variant that inherits only from `IndependentGeneralServices` (duplicating logic from `GeneralServices`).
- Used by `genomic_analysis.py` for zone detection analysis.
- Self-contained: applies mutations, computes proba_delta via SpliceAI, and scores results.

### 8. Type System (`app/schemas/typing.py`)
Custom type aliases used throughout:
- `genome` = `str` (DNA sequence, ATCG only)
- `mut` = `str` (mutation string like `>p.8.a>c`)
- `JSON` = `dict[str, Any]`
- `MutationMatrix` = `np.ndarray[np.float64]` (4×4 probability matrix)
- `percentage` = `int`

## Key Design Patterns
- **Factory Pattern**: `create_internal_variant()` in `internal_gv_factory.py`
- **Mixin Pattern**: `AlteredSequenceTrackerMixin` adds Redis persistence to alteration classes
- **Multiple Inheritance / Composition over Inheritance tension**: `InternalGeneticVariant` inherits from 9 parent classes — this is a "mega-class" anti-pattern that creates tight coupling
- **Strategy Pattern**: Scoring methods (euclidean, manhattan, pondered, quadratic) selectable via parameter
- **Decorator Pattern**: `wrapp_calcul` times function execution; `check_initialized` guards singleton access

## Known Architectural Issues
1. **Missing module**: `app/domain/initialization/initialize_internal_gv.py` is imported by 4 routers but does not exist.
2. **Code duplication**: `GeneralServices` and `IndependentGeneralServices` contain nearly identical logic.
3. **Code duplication**: `IndependentScoring` and `Scoring` classes are identical.
4. **Singleton vs Session duality**: The codebase is mid-migration from a global singleton variant to Redis-backed session variants. The two patterns coexist but are incompatible.
5. **Incomplete features**: `ProbaLawsFunctions.mutate_base()` returns `None` (stub). Gradient-based Integrated Gradients code is commented out in `genomic_analysis.py`.
6. **Import in `genomic_analysis.py`** references `app.schemas.independant_gv_schema` (French spelling "independant" vs "independent" used inconsistently).