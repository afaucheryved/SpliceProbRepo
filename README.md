# SpliceProb

A FastAPI-based backend for computing splicing probabilities and analyzing sequence alterations using SpliceAI models.

## Features

- **Splicing Probability** — Compute acceptor/donor splicing probabilities for DNA sequences via SpliceAI.
- **Delta Scoring** — Compare splicing scores between original and mutated sequences.
- **Sequence Alteration** — Modify sequences by index or pattern (insert, delete, replace, move, copy-paste).
- **Random Mutation** — Mutate sequences using a configurable 4×4 probability matrix.
- **Genomic Analysis** — Zone detection with PELT change-point algorithm and windowed mutant enumeration.
- **Session Management** — Redis-backed sessions for multi-user isolation (no expiry by default; TTL configurable per call).
- **Multiple Scoring Methods** — Euclidean, Manhattan, Weighted (pondered), Quadratic norms.

## Quick Start

### Prerequisites

- Python 3.10+
- [Redis](https://redis.io/) (optional, for session persistence; falls back to in-memory if unavailable)

### env / Installation / run in a single command

```bash
./myapp all
```
Then open http://127.0.0.1:5500 in browser.

The interactive API docs will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Redis Configuration (Optional)

Set these environment variables to configure Redis:

| Variable       | Default     | Description            |
|----------------|-------------|------------------------|
| `REDIS_HOST`   | `localhost` | Redis server hostname  |
| `REDIS_PORT`   | `6379`      | Redis server port      |
| `REDIS_DB`     | `0`         | Redis database index   |

If Redis is not available, the application falls back to an in-memory dictionary store.

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

## Step-by-Step Example: Discovering Splicing-Regulatory Substrings

This example demonstrates how to identify the subsequences that regulate the splicing of an exon.

**Context:** The user does not know the exact start and end positions of the exon they want to analyze.

1. After running the command described in the **"Running the App"** section, the user opens the application in their web browser and clicks the **"New Session"** button located in the top-right corner of the header.

2. The user loads the sequence they want to analyze by either:

   * entering an Ensembl ID,
   * uploading a `.fasta` file, or
   * pasting a raw DNA sequence directly.

   Then, they click **"Load Sequence"**.

3. Since the user does not remember the exact locations of the 3' splice site (3'ss) and 5' splice site (5'ss), they drag and drop the **"Baseline Probability"** function block from **Operations → Analysis** into the **Recipe** area.

4. The user clicks the **"Bake"** button.

5. They identify the 3'ss and 5'ss peaks displayed on the generated charts.

6. The **Baseline Probability** block is no longer needed. The user can either:

   * uncheck the block to temporarily hide it, or
   * click the red **×** button to remove it completely.

7. Next, the user drags and drops the **"Windows By Splicing Regulation"** function block into the Recipe area. They then enter the exon start and end positions.

   The available parameter sections are:

   * **EXON**

     * Defines the exon coordinates to analyze.

   * **WORKING INTERVAL**

     * Defines the sequence interval in which the algorithm searches for splicing-regulatory substrings. By default, the entire sequence is used.

   * **GENERAL ALGORITHM SETTINGS**

     * **Window size:** The length of the candidate regulatory substring. You can test multiple window sizes.
     * **Batch size:** Reduce this value to around **10–20** for very large sequences (approximately 10,000–100,000 bp). Values between **30 and 60** are generally suitable for smaller sequences.
     * **SpliceAI models:** Using **all models** provides the most reliable results, although it requires more computation time. Using only one or two models may produce significantly different results.
     * **Number of output windows:** The number of top-ranked candidate windows (substrings) that have the greatest predicted impact on the splice sites.

   * **PRESET ALGORITHM SETTINGS**

     * These settings determine which regions are prioritized before running the main algorithm. A higher **Keep proportion** reduces the risk of excluding an important region. For long sequences (approximately 10,000–100,000 bp), it is recommended to multiply the default preset values by **10**, except for **Keep proportion**, which should usually remain unchanged.

8. After clicking **"Bake"**, the user can:

   * visualize the predicted splicing-regulatory substrings on the sequence,
   * download the raw output data, and
   * export a PNG image of the generated plot.



## License

MIT