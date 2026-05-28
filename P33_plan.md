# Activity vs Drift Correlation Panel

## Context

The Repo view currently shows drift over time and a commits bar strip on the *same* axes (`DriftTimeSeries.tsx`) — but dual-axis time charts don't answer the developer's real question: **is this risk just because we're shipping a lot, or is something structurally wrong?** That distinction is precisely RQ1.H3 in the paper ("drift hotspots that don't track activity"). This panel operationalizes H3 as a concrete diagnostic surface and a clean user-study task ("find the hotspot not explained by commit volume").

Add an **"Activity vs drift"** section to the Repo route, below the existing time series, containing two coordinated sub-views over `(commits, drift[metric])` pairs across analyzed days:

1. **Scatter** with a deterministic least-squares fit line — outlier points (drift far above what activity predicts) are visually badged.
2. **Residual strip** with the same x-axis as the time series above — bars are signed residuals; same outliers flagged at the time of occurrence.

All compute is pure-client over data already in `RepoTimeseries` (`DayPoint.commits` is shipped per `src/data/schema/repoTimeseries.ts:18`); no preprocessing changes.

**Design decisions (already agreed):**
1. Scope: Repo route only (cross-repo Portfolio scatter is a future PR).
2. Metric: single metric with a URL-synced toggle (`?metric=`), defaulting to `line`.
3. Click-through: scatter point / residual bar → `/repo/:name/diff/:prev/:date` (reuses `onDayClick` predecessor logic at `src/routes/Repo.tsx:30-42`).
4. Outliers: auto-badged when `|residual / sd(residuals)| > 1.5`. Threshold pinned in code.

---

## Approach

### Math (pure selector)

Given `series: RepoTimeseries` and `metric: DriftMetric`:

1. **Build pairs**: from `series.days`, filter to entries where both `commits != null` and `drift[metricKey] != null`. Sort by `date` asc (canonical input order).
2. **OLS fit** over `(x = commits, y = drift)`:
   ```
   n = pairs.length
   sx = Σx, sy = Σy, sxx = Σ(x²), sxy = Σ(x·y)
   denom = n·sxx − sx²
   slope     = denom === 0 ? 0 : (n·sxy − sx·sy) / denom
   intercept = denom === 0 ? mean(y) : (sy − slope·sx) / n
   hasFit    = n >= 3 && denom !== 0
   ```
3. **Residuals**: per point `residual = drift − (slope·commits + intercept)`.
4. **Sample sd** of residuals: `sd = sqrt(Σ(r²) / (n − 1))`. If `!hasFit` or `sd === 0`, all `zResidual = 0` and no outliers.
5. **Outlier flag**: `isOutlier = hasFit && sd > 0 && Math.abs(zResidual) > 1.5`.
6. **R²** (for the summary line): `1 − Σ(r²) / Σ((y − mean(y))²)`; null when denominator is 0.

All sums in fixed iteration order (sorted input). No randomness, no clock. Inputs are 6-dp rounded in source JSON; arithmetic of like-precision floats is bit-stable on the reference environment.

### Public types

```ts
// src/data/selectors/repoActivity.ts
export interface ActivityPoint {
  date: string;        // ISO
  commits: number;
  drift: number;
  predicted: number;
  residual: number;
  zResidual: number;
  isOutlier: boolean;
}

export interface ActivityDriftAnalysis {
  metric: DriftMetric;
  points: ActivityPoint[];     // sorted by date asc
  slope: number;
  intercept: number;
  residualSd: number;
  rSquared: number | null;     // null when sum of squares total is 0
  outlierThreshold: number;    // 1.5 (committed constant, exported for thesis-doc parity)
  n: number;                   // count of usable pairs
  hasFit: boolean;
}

export function analyzeActivityDrift(
  series: RepoTimeseries,
  metric: DriftMetric,
): ActivityDriftAnalysis;
```

### Components

**`src/components/charts/ActivityDriftScatter.tsx`** — square SVG, fixed `viewBox` (mirror `DriftTimeSeries.tsx:25-32` style with `W=520, H=420`, deterministic margins). Linear `x = commits`, linear `y = drift` (no log toggle on first cut — residuals require linear arithmetic and the symlog story is wasted here). Renders:
- Fit line (dashed dark-gray) across the cloud's x extent when `hasFit`.
- Non-outlier points as small filled circles (muted blue, `r=3`).
- Outlier points larger (`r=5`) and color-coded by sign: positive residual → orange (mirrors `BranchDeltaRanking.module.css .chipPersistedPos`), negative → accent blue. Title attr shows `{date} · commits={c} · drift={d} · residual={r} (zσ)`.
- Selected-date point: ring overlay (matches selectedBranch convention in `ConflictMatrix.tsx:184`).
- Click → `onDayClick(date)` (parent navigates).
- Hover → publishes `selectedDate` to `RepoActivityContext`.

**`src/components/charts/ActivityResidualStrip.tsx`** — wide SVG sharing the time series' visual rhythm (`W=920, H=140`, identical `margin.left`/`right` to `DriftTimeSeries.tsx:27` so the column visually aligns with the chart above it). Renders:
- Time `xScale` built from `points.map(p => new Date(p.date))` (matches `DriftTimeSeries.tsx:80-82` constructor: `new Date(\`${date}T00:00:00\`)`).
- Vertical bars from `y=0` baseline to `y = yScale(zResidual)`. Symmetric y domain `[-max|z|, +max|z|]` clamped to at least `[-2, 2]` so the ±1.5σ guide-lines are always visible.
- Two horizontal dashed guide-lines at `y = ±1.5σ` (the outlier threshold).
- Bar color: same orange/blue/muted-gray scheme as the scatter.
- x-axis ticks identical format to `DriftTimeSeries`'s `d3.timeFormat('%b %d')` (`DriftTimeSeries.tsx:136`).
- Hover/click wiring identical to scatter.

**`src/components/charts/ActivityDriftPanel.tsx`** — container that runs `analyzeActivityDrift` via `useMemo`, renders:
```
<MetricToggle/>        n=42 · R²=0.42 · 5 outliers (|z|>1.5)
─────────────────────────────────────────────
| Residuals over time                       |   ← ActivityResidualStrip (wide)
─────────────────────────────────────────────
              Scatter                         ← ActivityDriftScatter (centered)
─────────────────────────────────────────────
[legend: ● in-band   ● outlier (drift > predicted)   ● outlier (drift < predicted)   --- fit / guides]
[explainer: "Outliers are days whose drift differs from the activity-based prediction by more than 1.5σ — candidates for structural change unrelated to commit volume."]
```

Empty states:
- `n === 0` → "No days with both commits and drift recorded."
- `n < 3` or `!hasFit` → render scatter without fit line; residual strip with bars but no guide-lines; show an explanatory note.

### Context (lean)

`src/state/RepoActivityContext.tsx` + `src/hooks/useRepoActivity.ts` — exactly the same shape as `DiffViewContext`:
```ts
interface RepoActivityState {
  metric: DriftMetric;                 // URL-synced via ?metric=
  setMetric: (m: DriftMetric) => void;
  selectedDate: string | null;         // transient hover, cross-panel link
  setSelectedDate: (d: string | null) => void;
}
```
Provider re-mounts via `key={name}` on `Repo.tsx` so transient selection resets per-repo.

### Routing & wiring

Modify `src/routes/Repo.tsx` only:
- Wrap render tree in `<RepoActivityProvider key={name}>`.
- Append a new `<section>` below the existing `Drift over time` section:
  ```tsx
  <div className={styles.section}>
    <div className={styles.sectionTitle}>Activity vs drift</div>
    <ActivityDriftPanel series={series} onDayClick={onDayClick} />
  </div>
  ```
- `onDayClick` is already the right shape (navigates to diff vs predecessor when one exists, else day view); reuse unchanged.

No changes to `App.tsx`, `Layout.tsx`, schemas, loaders, hooks for index/timeseries, or preprocessing.

---

## File inventory

**New (9):**

| Path | Purpose |
|---|---|
| `src/data/selectors/repoActivity.ts` | Pure OLS + residual selector + types |
| `src/data/selectors/repoActivity.test.ts` | Vitest unit tests |
| `src/state/RepoActivityContext.tsx` | Provider (metric + selectedDate) |
| `src/hooks/useRepoActivity.ts` | Context + hook |
| `src/components/charts/ActivityDriftPanel.tsx` (+ `.module.css`) | Container, metric toggle, summary stats, layout |
| `src/components/charts/ActivityDriftScatter.tsx` (+ `.module.css`) | Square scatter with fit line + outlier badges |
| `src/components/charts/ActivityResidualStrip.tsx` (+ `.module.css`) | Wide time-axis residual bars |

**Modify (1):**

| Path | Change |
|---|---|
| `src/routes/Repo.tsx` | Wrap in `<RepoActivityProvider key={name}>`; add `<ActivityDriftPanel>` section below `DriftTimeSeries` |

---

## Test plan (Vitest)

Mirror `src/data/selectors/dayReportDiff.test.ts` style: inline `makeSeries(...)` factory.

1. **Perfect linear** — `drift = 2·commits + 1` for 10 days → `slope ≈ 2`, `intercept ≈ 1`, all residuals ≈ 0, no outliers, `R² === 1`.
2. **Flat drift** — drift constant across varying commits → `slope === 0`, `intercept === mean(drift)`, all residuals 0, `R² === null` (denominator 0).
3. **All-identical commits** — `denom === 0` path → `hasFit === false`, `slope === 0`, `intercept === mean(y)`, no outliers.
4. **Single outlier** — 9 on-line points + 1 obvious outlier → exactly 1 point with `isOutlier === true`, sign matches direction.
5. **n < 3** — series of 2 days → `hasFit === false`, points still returned with `predicted/residual` computed against the degenerate fit.
6. **Filters null commits and null drift** — mixed nulls → only fully-defined pairs counted; null-day excluded from `points`.
7. **Per-metric routing** — same series analyzed with `'conflict'` vs `'line'` returns different `points` lengths if drift-nullity differs across metrics.
8. **Sort stability** — input days out of date order → `points` returned in date-asc order regardless.
9. **Determinism** — `JSON.stringify(analyze(s, 'line')) === JSON.stringify(analyze(s, 'line'))` on repeat invocation.
10. **Non-mutation** — snapshot `series` before; deep-equal after.
11. **Outlier threshold exposed** — `result.outlierThreshold === 1.5` (catches accidental constant drift across refactors).
12. **R² floor** — `rSquared` is `null` (not `NaN`) when SST is 0.

Components are not unit-tested per `code_rules §10` (test the pure layer, not pixels); verified manually.

---

## Verification

```
npm run lint
npm run test
npm run build
npm run dev
```

Manual checklist:
1. Portfolio → click any repo → Repo route renders with both the existing time series and the new "Activity vs drift" panel.
2. Toggle metric (line / conflict / file) → scatter, residual strip, and summary stats all recompute; URL `?metric=` updates without a page reload.
3. Hover an outlier point in the scatter → corresponding bar highlights in the residual strip (and vice versa) via `selectedDate`.
4. Click an outlier → navigates to `/repo/:name/diff/:prev/:date` (existing predecessor logic).
5. Pick a repo with very few analyzed days (e.g., the empty-state cases) → panel renders the explanatory note instead of an empty chart.
6. Refresh the page → `?metric=` restores; selection is correctly transient (resets).
7. Visual cross-check: residual-strip x-axis aligns visually with `DriftTimeSeries` above it (same `margin.left/right`, same date range).
8. **Determinism capture for thesis**: load a repo's panel, screenshot; hard refresh, screenshot; diff PNGs.
9. Run the diff selector smoke test path on a repo with a known outlier day (e.g., `react` 2024-04-04 → 2024-04-05 from prior testing) — confirm the outlier coincides with a real branch-attribution change.

---

## Edge cases

| Case | Handling |
|---|---|
| `n === 0` (no days with both commits and drift) | Panel renders "No days with both commits and drift recorded." |
| `n === 1` or `n === 2` | `hasFit === false`; scatter renders points without fit line; residual strip shows bars without ±1.5σ guides; explanatory note. |
| All commits identical (`denom === 0`) | `hasFit === false`; intercept = mean(drift); residuals = `drift − mean(drift)`. |
| All residuals identical (i.e., perfect fit, `sd === 0`) | No outliers flagged; `zResidual === 0` for all. |
| SST === 0 (constant drift) | `rSquared === null`; summary renders "R² —". |
| Repo not yet loaded | Panel parent already returns loading/error states from `useRepoTimeseries`; panel never mounts without data. |
| `?metric=` set to an unknown value | `isMetric` guard (copy from `DiffViewContext.tsx`) falls back to `'line'`. |
| `metric` toggle conflicts with future Day-view metric on the same URL | Different route; no shared param state. Safe. |
| Branch / repo with `commits === 0` on some days | Counts as `0`, included in fit (not filtered as null). |

---

## Determinism risks specific to this feature

| Risk | Mitigation |
|---|---|
| Sum order dependency in OLS | Inputs sorted by date asc before summation; all sums fixed-order. |
| `Math.sqrt` cross-platform variance | Treated as deterministic on the reference environment (`code_rules §3` / `§9` golden-file philosophy). |
| `NaN` / `Infinity` from degenerate fits leaking into output | All divisions guarded; degenerate paths return finite values (0 or mean). `rSquared` returns `null`, not `NaN`. |
| Outlier threshold drift across releases | Threshold defined as `OUTLIER_Z = 1.5` module-level constant, exported via `outlierThreshold` so test #11 fails any accidental change. |
| Locale-default `toLocaleString` | All numeric formatting in components via `Intl.NumberFormat('en-US', {...})` (`formatNumber`, `formatPct`) — same pattern as `dayReportDiff.ts`. |
| Date parsing timezone leak | Use `new Date(\`${date}T00:00:00\`)` exactly like `DriftTimeSeries.tsx:73` (UTC midnight, no local tz). |
| Color scheme drift | Reuse the pinned palette already in `BranchDeltaRanking.module.css` (`chipPersistedPos`/`chipPersistedNeg`); document inline. |
| Hover-state in render | `selectedDate` is pure React state; never observed in selector / fit math; cannot affect outputs. |

---

## Sequencing

1. `repoActivity.ts` + `repoActivity.test.ts` — selector first, get tests green.
2. `RepoActivityContext.tsx` + `useRepoActivity.ts` — copy `DiffViewContext.tsx` shape, trim to two fields.
3. `ActivityDriftScatter.tsx` + module CSS.
4. `ActivityResidualStrip.tsx` + module CSS.
5. `ActivityDriftPanel.tsx` + module CSS — wire it all together.
6. `Repo.tsx` — wrap provider, mount panel.
7. Full verification path.

---

## Out of scope (deliberately)

- **Portfolio-level cross-repo scatter** — a natural sibling but a separate PR; one panel at a time keeps scope honest.
- **Releases as a visual overlay on the residual strip** — could be added later as a thin marker line, but the existing `DriftTimeSeries` already shows releases above and the panels share a visual x-axis; adding them again is redundant noise.
- **Rolling correlation / window-based residuals** — interesting but adds method choices (window size, weighting) that need separate justification. Default to global OLS.
- **Non-linear models (polynomial, GAM)** — premature; the H3 hypothesis is satisfiable with a linear baseline. Any model upgrade should be a documented thesis decision, not a UI tweak.
- **User-adjustable outlier threshold slider** — explicitly considered and rejected: pinning at 1.5σ keeps the user-study task and thesis figures reproducible.
- **Per-day commit attribution by branch** — the dataset doesn't expose it; out of reach.
