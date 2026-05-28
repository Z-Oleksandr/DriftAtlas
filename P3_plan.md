---
type: implementation-plan
created: 2026-05-28
status: draft — Phase 3 component
related: '[[thesis-drift-paper-cheatsheet]] · [[thesis-structure]] · [[paper-jot2024-variance-drift]]'
component: Force-Directed Graph (FDG) panel — Day view
---

# Implementation Plan — Force-Directed Graph Panel (Driftatlas Phase 3)

> Goal: add a force-directed branch graph to the Day view as a peer to the existing
> 3D MDS point cloud. The FDG is designed for its **own** analytic value (explicit
> edges, draggable nodes, dynamic edge encoding, similarity/grouping focus), not as
> a faithful re-embedding of the MDS distances. A separate thesis subsection will
> _compare_ MDS vs FDG — that comparison consumes this component but does not
> constrain its design.

## Decisions locked (2026-05-28)

| Decision       | Choice                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placement      | Toggle inside the point-cloud panel slot (MDS ↔ FDG) for normal use; a side-by-side comparison mode renders MDS + FDG together for thesis figures                   |
| Rendering      | `react-three-fiber` for **both** 2D and 3D. 2D = orthographic top-down camera, `z≈0`, rotation disabled (pan/zoom only). 3D = perspective camera, full orbit.       |
| Layout intent  | Optimise for FDG's own usefulness. Use repulsion, collision, explicit edges, drag-to-pin, and a configurable edge encoding. Do **not** kill repulsion to mimic MDS. |
| Physics engine | `d3-force-3d` (single engine, `numDimensions` toggled 2↔3 — one layout codebase, two views)                                                                         |
| Drift variant  | One layout per variant (Line / Conflict / File), driven by the existing URL-synced metric state                                                                     |

---

## Why FDG earns its place (the analytic argument)

The MDS point cloud already answers _"how scattered is the branch set?"_. The FDG is
not there to answer the same question a second time. It answers questions MDS
structurally cannot, which map directly onto Karl's May-15 suggestions:

- **Coincident-point disambiguation.** In MDS you can never tell whether two points
  sit together because they truly have no conflicts or because the embedding compressed
  them (stress). The FDG makes this explicit: an edge (or its absence) between two nodes
  is unambiguous. Karl's exact concern, resolved by visible topology.
- **Similarity / "no conflict" focus.** Instead of encoding _distance_, the FDG can
  encode _mergeability_ — draw edges only between branches with zero/low conflict, so
  clean-merge clusters pop out as connected components. This is the "no conflict as a
  focus" idea: actionable grouping rather than scatter.
- **Dynamic edge semantics.** The user can switch what edges mean (conflict-count
  thickness vs. mergeability links) without recomputing positions. MDS bakes its
  semantics into the coordinates; the FDG keeps them live.
- **Manipulability.** Drag-to-pin lets a developer test structural hypotheses
  ("pin main here — where does the rest relax to?"). Pure exploratory affordance the
  static cloud lacks.

These are the four points the thesis MDS-vs-FDG subsection can stand on, independent of
whether the two layouts happen to look similar.

---

## Data contract (already satisfied)

No new preprocessing needed. The FDG reuses the same per-day JSON the conflict-matrix
heatmap already loads:

- **Nodes** = branch list (already have it; reuse Viridis spread colouring, main-at-origin
  convention, 1×/2× outlier ring thresholds from the point cloud).
- **Edges** = upper triangle of the pairwise conflict matrix for the active variant.
  Derive once per (day, variant); memoise.

Edge **rendering** policy (not the same as the matrix the force reads):

- Default: draw only edges below a drift threshold → "mergeable" links → connected
  components = clean-merge clusters. Threshold exposed as a slider.
- Alternative encoding (toggle): draw all edges, opacity/thickness ∝ inverse conflict
  (Karl's "thickness encodes conflict count" — invert so thicker = more conflict, or
  thicker = closer; pick one and document it).

The **force** simulation can read the full matrix even when the **rendered** edge set is
thresholded — keep the two concerns separate.

---

## Force configuration

Starting point (tune empirically against 3–4 representative repos):

```
forceSimulation(nodes, /* numDimensions */ dims)
  .force("link",   forceLink(edges).id(d => d.branch)
                     .distance(d => scaleDrift(d.conflict))   // monotone in drift
                     .strength(linkStrength))
  .force("charge", forceManyBody().strength(repulsion))       // KEEP — readability
  .force("collide", forceCollide(nodeRadius + pad))           // no overlap
  .force("center", forceCenter())                             // keep cloud framed
  .randomSource(d3.randomLcg(SEED))                            // determinism (see below)
```

- `scaleDrift`: clamp + scale conflict values into a sane pixel/world range; non-linear
  (sqrt or log) likely reads better given drift's heavy tails (matrix heatmap already uses
  a log colour scale — mirror that).
- `repulsion`: negative; the dial that separates clusters. This is the deliberate
  divergence from MDS — keep it meaningful.
- For 2D add `forceX`/`forceY` weak centring if the layout drifts; for 3D the
  three-axis centre force suffices.

**Determinism (required for thesis figures).** Force layouts are stochastic by default,
so figures would regenerate differently each rebuild. Pin three things:

1. Seeded RNG via `randomLcg(SEED)`.
2. Fixed initial positions (seed node positions deterministically, e.g. on a circle/sphere
   by branch-name hash) instead of random.
3. Run to a fixed iteration count or `alpha < threshold`, then **freeze** (stop ticking).
   Store the frozen positions in the day's view state so re-entry is identical.

---

## Component architecture (matches existing conventions)

```
src/
  routes/Day.tsx                      ← add panel mode + comparison layout
  features/fdg/
    useForceLayout.ts                 ← d3-force-3d wrapper; in: {nodes, matrix, variant, dims}
                                         out: frozen positions + sim controls. Seeded, memoised.
    deriveEdges.ts                    ← matrix → edge list; threshold + encoding helpers
    ForceGraph.tsx                    ← r3f <Canvas> contents: nodes (instanced spheres),
                                         edges (drei <Line>/<Segments>), camera rig per dims
    ForceGraphNode.tsx                ← sphere + outlier ring + drag handler (pin on drag)
    ForceGraphEdges.tsx               ← edge geometry; encoding-aware thickness/opacity
    PanelModeToggle.tsx               ← MDS | FDG-2D | FDG-3D switch (lives in panel header)
    fdgControls.ts                    ← threshold slider, edge-encoding toggle, repulsion dial
  context/DayViewContext             ← REUSE for hover/select; FDG both emits and consumes
```

Integration points with what already exists:

- **Selection sync.** Hover/click a branch in the FDG → set `DayViewContext` selection →
  highlights the same branch in the MDS cloud, the matrix heatmap, and the ranking table
  (and vice-versa). This cross-panel linking is the dashboard's strongest feature; the FDG
  must participate, not sit apart.
- **Metric state.** Line/Conflict/File already URL-synced — the FDG reads it; switching
  variant re-derives edges and re-runs the (seeded) layout.
- **Styling reuse.** Pull node colour (Viridis spread), main-anchor convention, and
  outlier-ring logic from the existing point-cloud component so MDS and FDG read as siblings.

---

## 2D vs 3D in one r3f component

Single `<ForceGraph dims={2|3}>`:

- `dims=3`: `<PerspectiveCamera>` + `OrbitControls` (full rotate/zoom/pan). `numDimensions(3)`,
  read `node.z`.
- `dims=2`: `<OrthographicCamera>` looking down −Z, `OrbitControls` with rotation disabled
  (pan + zoom only). `numDimensions(2)`, `node.z = 0`. Nodes/edges render flat; same code path.

Keep node/edge components dimension-agnostic — they just read `(x, y, z)`. Only the camera
rig and the simulation's `numDimensions` differ.

---

## Toggle + side-by-side comparison mode

- **Toggle (default UX):** `PanelModeToggle` swaps the panel slot between MDS, FDG-2D, FDG-3D.
  One panel visible at a time; selection state persists across the swap.
- **Comparison mode (thesis):** a layout flag that splits the panel area to render MDS and a
  chosen FDG view together, sharing selection + metric state. Primary purpose is producing
  the side-by-side figures for the MDS-vs-FDG subsection and (optionally) a user-study
  condition. Gate behind a query param or a dev/▣-comparison button so it doesn't clutter
  the normal flow.

---

## Performance note

Branch counts after driftool's inactive-branch filtering (60-day default) are realistically
tens, occasionally ~100+ on the busiest repos. That's comfortably inside r3f + d3-force
territory — no Canvas-2D fallback, no worker needed. If a specific repo janks during the
live tick phase, move the simulation iterations into a one-shot off-main-thread compute and
hand the frozen positions to r3f for render-only. Don't build that until a real repo
demands it.

---

## Milestones

1. **Layout core.** `useForceLayout` + `deriveEdges` + seeded determinism. Headless;
   unit-test on `conflict-example` fixture (positions stable across runs).
2. **3D renderer.** `ForceGraph` in r3f: instanced spheres + edges, reusing point-cloud
   styling. 3D first (closest to existing component).
3. **2D mode.** Orthographic locked camera; verify identical node/edge code path.
4. **Interactivity.** Drag-to-pin; hover/select wired through `DayViewContext`; threshold
   slider; edge-encoding toggle; repulsion dial.
5. **Toggle + comparison mode.** `PanelModeToggle`; split-panel comparison layout.
6. **Polish + thesis.** Figure-export (deterministic), draft the MDS-vs-FDG subsection
   against captured figures, fold FDG in as a user-study condition.

---

## Open items to resolve while building

- [ ] Edge default: thresholded "mergeable" links vs. all-edges-weighted — pick the default,
      keep the other as a toggle. (Lean: thresholded default — best demonstrates the
      "no-conflict focus" Karl liked.)
- [ ] Drift→distance/strength scaling function (linear vs sqrt vs log) — match the matrix
      heatmap's log scale unless it reads badly.
- [ ] Drag-pin lifetime: does a pinned node stay pinned on variant switch / day change, or
      reset? (Lean: reset on day change, persist within a day.)
- [ ] Persist frozen FDG positions in day view state vs. recompute on entry (recompute is
      fine if seeded + fast; persist only if entry latency shows).
- [ ] Confirm with Karl: is the FDG also a formal **user-study condition**, or only a
      dashboard feature + comparison-subsection subject? Affects how much polish the
      comparison mode needs.

---

## Thesis mapping

| Thesis section                       | What this component feeds                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 2.2 Datenvisualisierung — Grundlagen | FDG as a point-cloud/spatial layout technique alongside MDS                                            |
| 3.2 Visualisierungsmethoden          | Force-directed layout in software-engineering contexts                                                 |
| 4.2 Dashboard Design                 | Panel rationale: data type → layout choice → interaction model                                         |
| MDS-vs-FDG subsection                | Determinism vs interactivity; coincident-point ambiguity resolved by edges; dynamic edge semantics     |
| 4.x User study (if condition)        | Tasks: identify clean-merge cluster, locate the worst outlier branch, compare against MDS for the same |
