# Driftatlas

Interactive web dashboard for exploring Driftool analysis results across 21 repositories
over a three-month period (~1,470 daily reports). Companion to the `drift-repo-analysis`
package, which lives outside this directory (see *Data sources* below).

The Driftool computes branch drift by attempting pairwise merges across active branches
and counting the resulting conflicts. From the conflict distance matrix it embeds branches
as points in 3D via MDS and reports a single drift value (MAD of the point cloud) in three
variants: conflicting lines, conflict instances, and conflicting files.

This dashboard makes that data navigable: pick a repository, see how its drift evolved,
inspect any single day's point cloud and conflict matrix, and cross-reference drift against
GitHub activity (commits, releases, branch counts).

## Getting started

Prerequisites: Node ≥ 20, Python ≥ 3.10.

```bash
# 1. install JS deps
npm install

# 2. point the env at your local drift-repo-analysis folder
cp .env.example .env
# then edit .env and set DRIFT_REPO_ANALYSIS_PATH=...

# 3. set up the Python preprocessing venv
python3 -m venv preprocessing/.venv
source preprocessing/.venv/bin/activate
pip install -r preprocessing/requirements.txt
deactivate

# 4. generate the JSON artifacts in public/data/
npm run preprocess

# 5. run the dev server
npm run dev
```

Rerun step 4 whenever the source analysis changes; `public/data/` is gitignored.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — type check + production bundle
- `npm run lint` — ESLint
- `npm run test` — Vitest (selectors, parsers)
- `npm run preprocess` — runs both `build_days.py` and `build_timeseries.py`
- `npx prettier --check 'src/**/*.{ts,tsx,css}'` — formatting check (`--write` to fix)

## Project structure

```
dashboard/
├── preprocessing/             # Python pipeline (reads $DRIFT_REPO_ANALYSIS_PATH)
│   ├── build_timeseries.py    # per-repo CSVs → timeseries.json + portfolio.json + index.json
│   ├── build_days.py          # per-day reports → days/<date>.json (sparse, clustered)
│   ├── build_releases.py      # GitHub release dumps → release events
│   └── requirements.txt
├── public/
│   └── data/                  # generated artifacts (gitignored)
│       ├── index.json
│       ├── portfolio.json
│       └── repos/<repo>/{timeseries.json, days/<YYYY-MM-DD>.json}
├── src/
│   ├── components/
│   │   ├── charts/            # D3-driven 2D charts (time series, matrix, ranking, sparkline)
│   │   ├── three/             # react-three-fiber components (PointCloud3D)
│   │   ├── ErrorBoundary.tsx
│   │   └── Layout.tsx
│   ├── routes/                # Portfolio, Repo, Day (lazy-loaded)
│   ├── data/
│   │   ├── schema/            # zod schemas, mirrors public/data/ shapes
│   │   ├── loaders/           # fetch + parse + cache
│   │   └── selectors/         # densify, MAD lookup, branch summaries
│   ├── hooks/                 # useRepoIndex, usePortfolio, useDayReport, useDayView
│   ├── state/                 # DayViewProvider (selection + URL metric state)
│   ├── lib/log.ts             # console wrapper with layer prefixes
│   ├── App.tsx                # router with lazy Day route
│   └── main.tsx
├── code_rules.md              # engineering rules (must read before contributing)
└── package.json
```

## Data sources

All inputs are produced offline by the analysis package; the dashboard never runs the
Driftool itself. The path to the analysis package is **machine-specific** and configured
via an environment variable.

Copy the template and set the variable to the absolute path of your local
`drift-repo-analysis` folder:

```bash
cp .env.example .env
# then edit .env and set DRIFT_REPO_ANALYSIS_PATH=...
```

`.env` is gitignored. Only the preprocessing script reads this variable; once preprocessing
has produced the JSON artifacts in `public/data/`, the deployed site no longer needs it.

- **Per-day reports** — `$DRIFT_REPO_ANALYSIS_PATH/driftool_analysis/results/<run>/output_*/opendrift_DD_MM_YY/report_<repo>_*.json`
  Each contains: three drift scalars (`lineDrift`, `conflictDrift`, `fileDrift`),
  three distance matrices, three 3D point clouds, the analyzed branch list,
  and run metadata.
- **Per-repo time series** — `$DRIFT_REPO_ANALYSIS_PATH/driftool_postprocess/timeseries_drift/<repo>_report_collection.csv`
  Wide format, one row per metric, one column per day. Already includes `commits` alongside
  the drift values and branch counts.
- **Activity metrics** — `$DRIFT_REPO_ANALYSIS_PATH/stats_crawler/{commit_activity,releases}/`
  Raw and aggregated GitHub activity per repo per day.

## Information architecture

Three levels, navigable top-down:

1. **Portfolio view** — sparkline grid (one card per repo) and a calendar heatmap
   (repo × day, colored by drift) for the whole dataset.
2. **Repo view** — drift time series (line / conflict / file), overlaid with commit bars
   and release event markers; branch-population stream below; date slider.
3. **Day view** — interactive 3D MDS point cloud + reordered conflict heatmap +
   branch ranking table, all linked (hovering one highlights the others).

## Visualizations

**Distance-based**
- 3D MDS scatter — *Phase 2 ✓* (orbit/zoom, anchor `main` at origin, Viridis color by spread, outlier rings at 1×/2× drift, origin pile-up clustered)
- 2D projections / thesis figure export — *Phase 3*
- Branch ghost-trails when scrubbing the date slider — *Phase 3*
- Force-directed graph as MDS alternative — *Phase 3*

**Time series**
- Triple-drift line chart with log/linear toggle — *Phase 1 ✓ · Phase 2 enriched*
- Drift × activity overlay (commit bars + release event lines) — *Phase 2 ✓*
- Calendar heatmap (per-repo-normalized) on the Portfolio — *Phase 2 ✓*
- Sparkline cards on the Portfolio — *Phase 2 ✓*
- Branch-population streamgraph (`total` / `analyzed` / `final`) — *Phase 3*

**Tables / matrices**
- Conflict matrix heatmap with hierarchical reordering and log color scale — *Phase 2 ✓*
- Per-day branch ranking (conflict mass, # partners, distance to `main`, spread) — *Phase 2 ✓*
- Branch leaderboard across the period — *Phase 3*
- Two-day matrix diff — *Phase 3*

**Cross-cutting**
- Linked highlighting across 3D scatter / matrix / table — *Phase 2 ✓*
- Activity-vs-drift scatter (the thesis-question chart) — *Phase 3*
- Repo comparison panel — *Phase 3*
- Anomaly panel (drift > 2σ above per-repo baseline) — *Phase 3*
- MAD decomposition stacked bar — *Phase 3*

## Tech stack

- **React + Vite + TypeScript** — component model, fast dev loop, static build output
- **D3** — all 2D charts (heatmap, time series, calendar, scatter, force graph)
- **Three.js via react-three-fiber** — the 3D MDS point cloud
- **Static site** — no backend; all data served as pre-processed JSON

## Build pipeline

A two-script preprocessing step (Python) reads the raw analysis outputs once and writes
browser-friendly artifacts to `public/data/`:

- `build_timeseries.py` — per-repo time series, the master `index.json`, and
  `portfolio.json` for the calendar heatmap.
- `build_days.py` — one slim JSON per (repo, day) with point cloud, sparse edge-list
  matrices, hierarchical-cluster ordering, and per-branch MAD contribution.

Storing the matrices as edge lists rather than dense arrays cuts payload roughly 10×
because the matrices are mostly zero. Per-day clustering and MAD computation are
precomputed in Python (scipy) so the browser doesn't redo them on every render.

`npm run preprocess` runs both scripts in sequence.

## Data caveats worth knowing up front

- **Matrices are sparse.** Most pairs are zero — only branches that touched the same files
  have a non-zero distance.
- **Branch sets shift day-to-day.** A branch on Tuesday may not exist Wednesday; point
  indices are not stable across reports. Any "watch a branch over time" view must key on
  branch *name*, not position.
- **Dynamic range is huge.** Drift values for a single repo can swing from ~3 to ~45 over
  weeks. Plan for log scale and per-repo normalization in overviews.
- **Distance matrices may be lower-triangular** in storage (asymmetric run); symmetrize
  before rendering heatmaps.
- **CSV header dates are `YYYY-DD-MM`**, not `YYYY-MM-DD`. The preprocessing script handles
  this; do not refactor to assume ISO order.

## Status

**Phase 1 complete** — scaffolding, preprocessing pipeline, Portfolio list, Repo view
with triple-drift time series.

**Phase 2 complete** — per-day preprocessing (1,470 reports), Day view with 3D MDS
point cloud · reordered conflict-matrix heatmap · branch ranking table, all linked by
shared selection state. Portfolio upgraded to a calendar heatmap + sparkline grid with
metric and sort controls. Repo view enriched with commit bars, release event lines, and
log/linear y-axis toggle. Click-through from any chart drills into the relevant Day view.

Conventions and rules: see `code_rules.md`. Agent guidance: see `CLAUDE.md`.
