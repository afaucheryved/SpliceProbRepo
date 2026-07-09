# Project Brief: SpliceProb

## Overview
**SpliceProb** is a Python web application that serves as a computational biology tool for analyzing the impact of genomic mutations on **splicing mechanisms**. It predicts how changes to DNA sequences affect splice site probabilities (acceptor and donor sites), enabling researchers to assess the potential pathogenicity of genetic variants.

The application wraps the **SpliceAI** deep learning model (a Keras/TensorFlow model) behind a **FastAPI** REST API, providing endpoints to:

1. Compute baseline splicing probabilities for a given DNA sequence.
2. Compute the **delta** (change) in splicing probabilities caused by one or more point mutations.
3. Perform interactive sequence alteration operations (insert, delete, move, copy-paste, replace) by index or by pattern.
4. Execute genomic analysis to identify **zones of importance** — regions within a sequence where mutations most significantly impact splicing — using the `ruptures` library for change-point detection.
5. Enumerate and score potential windowed mutations to discover the most impactful pattern modifications.

All operations are session-based using **Redis** for multi-user isolation, allowing a client to progressively alter a sequence and retrieve updated analysis results across multiple requests.

## Business Logic
- **DNA Sequence Representation**: Sequences are composed of the four standard nucleotides: A, T, C, G (case-insensitive).
- **Mutation Syntax**: Mutations follow the notation `>p.<position>.<reference_base>><alternative_base>` (e.g., `>p.8.a>c`), using 1-based biological indexing. An empty string represents "no mutation."
- **Splicing Scores**: SpliceAI returns per-position probabilities for 4 categories: Acceptor Gain, Donor Gain, Acceptor Loss, Donor Loss. Only Donor Gain (index 1) and Acceptor Gain (index 2) are currently surfaced through the API.
- **Delta Scoring**: The impact score quantifies the difference between pre-mutation and post-mutation splicing probabilities using a vector norm (Euclidean, Manhattan, weighted/pondered, or quadratic).
- **Zone Detection**: Uses the PELT algorithm (via `ruptures`) to segment mutation impact scores and identify regions where mutations significantly alter splicing.

## Primary Technologies
| Technology | Purpose |
|-----------|---------|
| **Python 3** | Core language |
| **FastAPI** | Web framework for building the REST API |
| **TensorFlow / Keras** | Deep learning runtime for SpliceAI models |
| **SpliceAI** (`spliceai` package) | Pre-trained deep learning models for splice site prediction (5 ensemble models) |
| **Redis** | Session storage for multi-user state management |
| **NumPy** | Numerical computation and array operations |
| **ruptures** | Change-point detection for genomic zone analysis |
| **Pydantic** | Data validation and serialization |
| **Matplotlib** | Visualization (used in test/debug scripts) |

## Current State
The backend is **functional end-to-end**: `fastapi run app/main.py` boots cleanly and all 11 POST endpoints + 6 GET accessors return real (non-mocked) SpliceAI output, verified via `python test_payloads.py --server http://127.0.0.1:8000`. Full fix history is in `docs/ai/progress.md` and `docs/ai/audits_history.md`.
- Session-based multi-user support via Redis (`create_internal_variant` factory) is used by **every** router. The former legacy singleton pattern (`my_internal_genetic_variant`) is vestigial — only a manual visualization script (`app/test/test_functions.py`, excluded from pytest) still references it.
- A frontend has been added: three alternative MVP UIs under `frontend/` (no-build-step, see `frontend/README.md`), switchable via a 3-position toggle.
- Known caveat: `/analysis/patterninzona` is not confirmed fully reliable in every case (flagged for follow-up investigation; not urgent for now) — see `docs/ai/progress.md`.
- Remaining known issues: the `InternalGeneticVariant` mega-class (9-parent multiple inheritance) is still unrefactored, `ProbaLawsFunctions.mutate_base()` is still a stub, and gradient-based (Integrated Gradients) analysis code is still commented out in `genomic_analysis.py`. See `docs/ai/architecture.md` → "Known Architectural Issues".
- Unit test coverage: most of the previously-broken test infrastructure now runs (`pytest` no longer crashes at collection), but a large batch of tests (~43) predate an internal refactor and need rewriting — see `docs/ai/progress.md` → "Known remaining test debt".