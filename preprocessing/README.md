# Preprocessing

Reads raw outputs from the `drift-repo-analysis` package and produces the JSON
artifacts the dashboard consumes from `public/data/`. Run once before
`npm run dev`; rerun whenever the analysis package changes.

## Setup

```bash
cd preprocessing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

From the project root:

```bash
python3 preprocessing/build_timeseries.py
```

The script reads `DRIFT_REPO_ANALYSIS_PATH` from `../.env` and fails loudly if
the variable is missing or does not point to a real directory.

## Output

```
public/data/
├── index.json                       # repo list + global metadata
└── repos/<repo>/timeseries.json     # per-repo daily metrics
```

## Phase 1 scope

Only the per-repo time series is built. Per-day point clouds and conflict
matrices come in Phase 2 (a separate `build_days.py` script).

## Notes

- Source CSV headers use `YYYY-DD-MM` (day before month). The script handles
  this; do not refactor to assume ISO order.
- The script skips `*_GER.csv` files (German-locale duplicates).
