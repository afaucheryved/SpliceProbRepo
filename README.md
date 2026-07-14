# SpliceProb

A FastAPI-based backend for computing splicing probabilities and analyzing sequence alterations using SpliceAI models.

## Features

- **Splicing Probability** — Compute acceptor/donor splicing probabilities for DNA sequences via SpliceAI.
- **Delta Scoring** — Compare splicing scores between original and mutated sequences.
- **Sequence Alteration** — Modify sequences by index or pattern (insert, delete, replace, move, copy-paste).
- **Random Mutation** — Mutate sequences using a configurable 4×4 probability matrix.
- **Genomic Analysis** — Zone detection with PELT change-point algorithm and windowed mutant enumeration.
- **Session Management** — Redis-backed sessions for multi-user isolation (30-minute TTL, configurable).
- **Multiple Scoring Methods** — Euclidean, Manhattan, Weighted (pondered), Quadratic norms.

## Quick Start

### Prerequisites

- Python 3.10+
- [Redis](https://redis.io/) (optional, for session persistence; falls back to in-memory if unavailable)

### Installation

```bash
pip install -r requirements.txt
```

### Running the Server

```bash
fastapi dev app/main.py
```

The interactive API docs will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Redis Configuration (Optional)

Set these environment variables to configure Redis:

| Variable       | Default     | Description            |
|----------------|-------------|------------------------|
| `REDIS_HOST`   | `localhost` | Redis server hostname  |
| `REDIS_PORT`   | `6379`      | Redis server port      |
| `REDIS_DB`     | `0`         | Redis database index   |

If Redis is not available, the application falls back to an in-memory dictionary store.

## API Endpoints

### Core Probabilities

| Method | Endpoint                     | Description                                     |
|--------|------------------------------|-------------------------------------------------|
| POST   | `/GetSimpleProb/`            | Baseline acceptor/donor probabilities           |
| POST   | `/GetDeltaScore/`            | Delta (difference) in splicing scores           |
| POST   | `/resetgv`                   | Reset internal genetic variant                  |
| GET    | `/get/sequence`              | Get current sequence                            |
| GET    | `/get/simpleproba`           | Get simple probabilities                        |
| GET    | `/get/deltaproba`            | Get delta probabilities                         |
| GET    | `/get/mutations`             | Get applied mutations                           |
| GET    | `/get/alteredsequence`       | Get altered sequence                            |
| GET    | `/get/gv`                    | Get full variant state                          |

### Sequence Alteration by Index

| Method | Endpoint                         | Description                            |
|--------|----------------------------------|----------------------------------------|
| POST   | `/altbyindex/delete`             | Delete bases by start/end or length    |
| POST   | `/altbyindex/insert`             | Insert a pattern at a given index      |
| POST   | `/altbyindex/move`               | Cut-and-paste a subsequence            |
| POST   | `/altbyindex/copypast`           | Copy-and-paste a subsequence           |

> **Note**: The legacy endpoint `/altbyindex/delet` is kept as an alias for backward compatibility.

### Sequence Alteration by Pattern

| Method | Endpoint                           | Description                                  |
|--------|------------------------------------|----------------------------------------------|
| POST   | `/altbypattern/replace`            | Replace a pattern (supports wildcards)       |
| POST   | `/altbypattern/delete`             | Delete a pattern (supports wildcards)        |

Wildcards:
- `_` — matches exactly one base (e.g., `a_c` matches `atc`, `agc`)
- `%(n)` — matches up to `n` bases (e.g., `a%(3)g` matches `a...g` with up to 3 bases in between)
- `%` — matches any sequence (0 to infinity)

> **Note**: The legacy endpoint `/altbypattern/delet` is kept as an alias for backward compatibility.

### Random Mutation

| Method | Endpoint                 | Description                                        |
|--------|--------------------------|----------------------------------------------------|
| POST   | `/mutateindependently`   | Mutate each base independently per a 4×4 matrix    |

### Genomic Analysis

| Method | Endpoint                        | Description                                        |
|--------|---------------------------------|----------------------------------------------------|
| POST   | `/analysis/patterninzona`       | Zone detection + impactful mutation pattern search |

## Running Tests

```bash
# Run all tests
python -m pytest app/test/ -v

# Run specific test file
python -m pytest app/test/test_alteration_functions.py -v

# Run with coverage
python -m pytest app/test/ --cov=app -v
```

## Project Structure

```
app/
├── client/              # External API client code
├── domain/              # Core business logic
│   ├── calcul_function.py
│   ├── genomic_analysis.py
│   ├── internal_gv_factory.py
│   ├── mixins.py
│   ├── proba_laws_functions.py
│   ├── sequence_functions.py    # Sequence alteration & factory
│   ├── spliceai_calculation.py  # SpliceAI model integration
│   └── initialization/          # Model loading
├── errors/              # Custom exceptions & warnings
├── models/              # SpliceAI model files
├── router/              # FastAPI route definitions
├── schemas/             # Pydantic models & variant classes
├── services/            # Business services & Redis session
└── test/                # Unit & integration tests
```

## Session Management

Each API call can include an optional `session_id` parameter. If provided, the variant state is persisted in Redis and can be retrieved across multiple requests. This enables multi-user isolation and stateful workflows.

## License

MIT