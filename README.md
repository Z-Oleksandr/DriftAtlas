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
python3 preprocessing/build_timeseries.py

# 5. run the dev server
npm run dev
```

Rerun step 4 whenever the source analysis changes; `public/data/` is gitignored.

## Project structure

```
dashboard/
├── preprocessing/             # Python; reads $DRIFT_REPO_ANALYSIS_PATH
│   ├── build_timeseries.py    # per-repo CSVs → public/data/*.json
│   └── requirements.txt
├── public/
│   └── data/                  # generated artifacts (gitignored)
│       ├── index.json
│       └── repos/<repo>/timeseries.json
├── src/
│   ├── components/            # Layout, charts/
│   ├── routes/                # Portfolio, Repo, (Day in Phase 2)
│   ├── data/                  # types + fetch wrappers
│   ├── App.tsx                # router
│   └── main.tsx
└── ...
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

Phase 1 ships the Portfolio list and the Repo view's drift time series. Day view, calendar
heatmap, sparkline grid, 3D point cloud, and conflict-matrix heatmap come in Phase 2.

## Planned visualizations

**Distance-based**
- 3D MDS scatter (orbit/zoom, anchor `main`, color by MAD contribution)
- Outlier rings at 1×/2× MAD around the centroid (geometric reading of the drift number)
- 2D projections as static fallback / for thesis figures
- Branch ghost-trails when scrubbing the date slider
- Force-directed graph from the raw matrix as an alternative to MDS

**Time series**
- Triple-drift line chart (log scale toggle, normalization toggle) — *Phase 1 ✓*
- Drift × activity overlay (commits as bars, releases as event lines)
- Calendar heatmap (GitHub-contributions style) across all 21 repos
- Sparkline grid as the home-page overview
- Branch-population streamgraph (`total` / `analyzed` / `final`)

**Tables / matrices**
- Interactive conflict heatmap with hierarchical reordering (click cell → highlight in 3D)
- Per-day branch ranking (conflict mass, # partners, distance to `main`)
- Branch leaderboard across the period (chronic offenders, longest-lived, biggest spike)
- Two-day matrix diff

**Cross-cutting**
- Activity-vs-drift scatter (one dot per repo-day) — the thesis-question-shaped chart
- Repo comparison panel (2–3 repos time-aligned, normalized)
- Anomaly panel (top-N days where drift > 2σ above the repo's own baseline)
- MAD decomposition stacked bar (which branches drive today's drift)

## Tech stack

- **React + Vite + TypeScript** — component model, fast dev loop, static build output
- **D3** — all 2D charts (heatmap, time series, calendar, scatter, force graph)
- **Three.js via react-three-fiber** — the 3D MDS point cloud
- **Static site** — no backend; all data served as pre-processed JSON

## Build pipeline

A one-shot preprocessing step (Python) reads the raw analysis outputs once and writes
browser-friendly artifacts:

- one slim per-repo time-series JSON (already shipped in Phase 1);
- one per-(repo, day) JSON with point cloud + matrix-as-edge-list (sparse) + branch list
  (Phase 2).

Storing the matrices as edge lists rather than dense arrays cuts payload roughly 10×
because the matrices are mostly zero.

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

Phase 1 complete: scaffolding, preprocessing pipeline, Portfolio list, Repo view with
triple-drift time series. Phase 2 (per-day preprocessing, 3D point cloud, calendar heatmap,
sparkline grid) is next.
