"""Build per-(repo, day) JSON artifacts for the Day view.

Walks `$DRIFT_REPO_ANALYSIS_PATH/driftool_analysis/results/<run>/output_*/opendrift_DD_MM_YY/report_<repo>_*.json`
and produces one slim JSON per (repo, date) under
`public/data/repos/<repo>/days/<YYYY-MM-DD>.json`.

For each metric (line, conflict, file) the artifact contains:
- a sparse, symmetrized edge list keyed by branch *name* (rule §14.1, §14.3);
- the precomputed 3D MDS point cloud;
- a hierarchical-cluster ordering for matrix display;
- per-branch contribution to the cluster spread (distance from centroid).

The script is idempotent and deterministic: same input → byte-identical output.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date as Date
from pathlib import Path
from typing import Iterable

import numpy as np
from scipy.cluster.hierarchy import leaves_list, linkage, optimal_leaf_ordering
from scipy.spatial.distance import squareform

from _env import DEFAULT_ANALYSIS_RUN, load_source_root, out_data_root


METRICS: tuple[str, str, str] = ("line", "conflict", "file")
_FOLDER_RE = re.compile(r"opendrift_(\d{2})_(\d{2})_(\d{2})$")
_REPORT_RE = re.compile(r"report_(.+)_opendrift_\d{2}_\d{2}_\d{2}\.json$")


def folder_to_iso(name: str) -> str:
    m = _FOLDER_RE.match(name)
    if not m:
        raise ValueError(f"unexpected folder name: {name!r}")
    dd, mm, yy = m.groups()
    year = 2000 + int(yy)
    return Date(year, int(mm), int(dd)).isoformat()


def repo_from_report_name(name: str) -> str:
    m = _REPORT_RE.match(name)
    if not m:
        raise ValueError(f"unexpected report file name: {name!r}")
    return m.group(1)


def symmetrize(matrix: np.ndarray) -> np.ndarray:
    """Mirror lower-triangular fill into the upper triangle. Asserts no conflicts."""
    upper = np.triu(matrix, k=1)
    lower = np.tril(matrix, k=-1)
    if np.any((upper > 0) & (lower.T > 0) & (upper != lower.T)):
        raise ValueError("matrix has conflicting upper/lower values")
    sym = np.maximum(upper, lower.T)
    return sym + sym.T


def edges_from_matrix(branches: list[str], matrix: np.ndarray) -> list[dict]:
    """Size optimization. Walk the upper triangle and emit only non-zero pairs. Sort for determinism."""
    n = len(branches)
    if matrix.shape != (n, n):
        raise ValueError(f"matrix shape {matrix.shape} mismatches branch count {n}")
    out: list[dict] = []
    for i in range(n):
        for j in range(i + 1, n):
            w = float(matrix[i, j])
            if w > 0.0:
                out.append({"a": branches[i], "b": branches[j], "weight": w})
    out.sort(key=lambda e: (e["a"], e["b"]))
    return out


def hierarchical_order(matrix: np.ndarray) -> list[int]:
    """Reorder branches by similatiry."""
    n = matrix.shape[0]
    if n < 2:
        return list(range(n))
    if not np.any(matrix):
        # All-zero matrix — clustering is degenerate. Preserve input order.
        return list(range(n))
    condensed = squareform(matrix, checks=False)
    z = linkage(condensed, method="average")
    z = optimal_leaf_ordering(z, condensed)
    return [int(i) for i in leaves_list(z)]


def mad_contribution(points: np.ndarray) -> list[float]:
    """Each branch's distance from the cluster centroid. Higher = bigger spread driver."""
    if points.size == 0:
        return []
    centroid = points.mean(axis=0)
    return [float(np.linalg.norm(p - centroid)) for p in points]


def build_day(report: dict) -> dict:
    branches: list[str] = report["sortedFinalBranchList"]
    n = len(branches)

    payload: dict = {
        "repo": report["reportTitle"].split(" at ")[0].removeprefix("REPORT ").strip(),
        "date": "",  # filled in by caller from folder name
        "branches": branches,
        "drift": {},
        "pointClouds": {},
        "edges": {},
        "ordering": {},
        "madContribution": {},
        "branchCounts": {
            "total": int(report["numberOfBranchesTotal"]),
            "analyzed": int(report["numberOfBranchesAnalyzed"]),
            "final": int(report["numberOfFinalBranches"]),
        },
    }

    for metric in METRICS:
        scalar_key = f"{metric}Drift"
        matrix_key = f"{metric}DistanceMatrix"
        cloud_key = f"{metric}PointCloud"

        matrix_obj = report[matrix_key]
        if matrix_obj["sortedBranchList"] != branches:
            raise ValueError(f"branch list mismatch for {metric} matrix")
        matrix = np.asarray(matrix_obj["data"], dtype=float)
        if matrix.shape != (n, n):
            raise ValueError(f"{metric} matrix shape {matrix.shape} != ({n},{n})")
        sym = symmetrize(matrix)

        cloud_pts = report[cloud_key]["points"]
        if len(cloud_pts) != n:
            raise ValueError(f"{metric} point cloud length {len(cloud_pts)} != {n}")
        points = np.array(
            [[p["first"], p["second"], p["third"]] for p in cloud_pts],
            dtype=float,
        )

        payload["drift"][metric] = float(report[scalar_key])
        payload["pointClouds"][metric] = [
            [round(float(x), 6), round(float(y), 6), round(float(z), 6)]
            for x, y, z in points
        ]
        payload["edges"][metric] = edges_from_matrix(branches, sym)
        payload["ordering"][metric] = hierarchical_order(sym)
        payload["madContribution"][metric] = [round(v, 6) for v in mad_contribution(points)]

    return payload


def iter_reports(run_root: Path) -> Iterable[tuple[str, str, Path]]:
    """Yield (repo, iso_date, report_path) for every report under the run root."""
    for output_dir in sorted(run_root.glob("output_*")):
        for opendrift_dir in sorted(output_dir.glob("opendrift_*")):
            try:
                iso = folder_to_iso(opendrift_dir.name)
            except ValueError:
                continue
            for report_path in sorted(opendrift_dir.glob("report_*.json")):
                try:
                    repo = repo_from_report_name(report_path.name)
                except ValueError:
                    continue
                yield repo, iso, report_path


def main() -> int:
    source_root = load_source_root()
    run_root = source_root / "driftool_analysis" / "results" / DEFAULT_ANALYSIS_RUN
    if not run_root.is_dir():
        print(f"ERROR: analysis run not found: {run_root}", file=sys.stderr)
        return 1

    repos_root = out_data_root() / "repos"
    repos_root.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    total_bytes = 0
    failures: list[tuple[Path, str]] = []

    for repo, iso, report_path in iter_reports(run_root):
        try:
            with report_path.open("r", encoding="utf-8") as f:
                report = json.load(f)
            payload = build_day(report)
            payload["date"] = iso
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            failures.append((report_path, str(exc)))
            continue

        out_dir = repos_root / repo / "days"
        out_dir.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        (out_dir / f"{iso}.json").write_text(encoded)
        counts[repo] = counts.get(repo, 0) + 1
        total_bytes += len(encoded)

    for repo, count in sorted(counts.items()):
        print(f"  {repo}: {count} days")

    print(
        f"\nwrote {sum(counts.values())} day reports across {len(counts)} repos "
        f"({total_bytes / 1024 / 1024:.2f} MB total)"
    )

    if failures:
        print(f"\n{len(failures)} reports failed:", file=sys.stderr)
        for path, message in failures[:10]:
            print(f"  {path.name}: {message}", file=sys.stderr)
        if len(failures) > 10:
            print(f"  …and {len(failures) - 10} more", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
