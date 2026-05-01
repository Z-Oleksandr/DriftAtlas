"""Build per-repo time series JSON artifacts and the master index.

Reads the wide-format CSVs produced by drift-repo-analysis, transposes them
into a per-day record list, merges in releases, and writes:

    public/data/index.json
    public/data/repos/<repo>/timeseries.json

The source root is read from DRIFT_REPO_ANALYSIS_PATH (loaded from .env at
the project root). The script fails loudly if the variable is missing or
the path does not exist.

Idempotent: running it twice on the same input produces byte-identical output.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from _env import DEFAULT_ANALYSIS_RUN, load_source_root, out_data_root
from build_releases import collect_releases


METRIC_KEYS = {
    "lineDrift": "lineDrift",
    "conflictDrift": "conflictDrift",
    "fileDrift": "fileDrift",
    "numberOfBranchesTotal": "branchesTotal",
    "numberOfBranchesAnalyzed": "branchesAnalyzed",
    "numberOfFinalBranches": "branchesFinal",
    "commits": "commits",
}


def parse_header_date(raw: str) -> date:
    # The CSV header uses YYYY-DD-MM (day before month) — verified on a sample
    # PowerToys file. Do not assume ISO order.
    parts = raw.strip().split("-")
    if len(parts) != 3:
        raise ValueError(f"unexpected date column: {raw!r}")
    year, day, month = (int(p) for p in parts)
    return date(year, month, day)


def coerce(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def build_repo_timeseries(csv_path: Path, releases: list[dict[str, str]]) -> dict:
    df = pd.read_csv(csv_path, sep=";", index_col=0)
    df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed")]]

    days = []
    for col in df.columns:
        day_date = parse_header_date(str(col))
        row: dict = {"date": day_date.isoformat()}
        for source_key, out_key in METRIC_KEYS.items():
            row[out_key] = coerce(df.at[source_key, col]) if source_key in df.index else None
        days.append(row)

    days.sort(key=lambda d: d["date"])
    return {
        "repo": csv_path.stem.replace("_report_collection", ""),
        "days": days,
        "releases": releases,
    }


def main() -> int:
    source_root = load_source_root()

    csv_dir = source_root / "driftool_postprocess" / "timeseries_drift"
    if not csv_dir.is_dir():
        print(f"ERROR: expected directory not found: {csv_dir}", file=sys.stderr)
        return 1

    out_root = out_data_root()
    repos_root = out_root / "repos"
    repos_root.mkdir(parents=True, exist_ok=True)

    csvs = sorted(p for p in csv_dir.glob("*_report_collection.csv") if "_GER" not in p.name)
    if not csvs:
        print(f"ERROR: no CSVs found in {csv_dir}", file=sys.stderr)
        return 1

    print("Collecting releases…")
    releases_by_repo = collect_releases(source_root)
    print(f"  releases for {len(releases_by_repo)} repos")

    index_repos = []
    all_ts = []
    total_bytes = 0
    for csv_path in csvs:
        repo = csv_path.stem.replace("_report_collection", "")
        ts = build_repo_timeseries(csv_path, releases_by_repo.get(repo, []))
        all_ts.append(ts)
        repo_dir = repos_root / ts["repo"]
        repo_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(ts, separators=(",", ":"), sort_keys=True)
        target = repo_dir / "timeseries.json"
        target.write_text(payload)
        total_bytes += len(payload)

        with_drift = [d for d in ts["days"] if d.get("lineDrift") is not None]
        date_range = [with_drift[0]["date"], with_drift[-1]["date"]] if with_drift else None
        analyzed_days = [d["date"] for d in with_drift]

        index_repos.append({
            "name": ts["repo"],
            "dateRange": date_range,
            "dayCount": len(ts["days"]),
            "dayWithDriftCount": len(with_drift),
            "analyzedDays": analyzed_days,
        })
        print(
            f"  {csv_path.name} -> {ts['repo']} "
            f"({len(ts['days'])} days, {len(with_drift)} with drift, "
            f"{len(ts['releases'])} releases)"
        )

    # Deterministic "data freshness" marker: the latest analyzed date across all repos.
    # Avoids embedding a build timestamp (rule §11.2: no timestamps in artifacts).
    latest_date = max(
        (r["dateRange"][1] for r in index_repos if r["dateRange"]),
        default="",
    )
    index = {
        "generatedAt": latest_date,
        "analysisRun": DEFAULT_ANALYSIS_RUN,
        "repos": sorted(index_repos, key=lambda r: r["name"].lower()),
    }
    index_path = out_root / "index.json"
    index_payload = json.dumps(index, indent=2, sort_keys=True)
    index_path.write_text(index_payload)

    print(f"\nwrote {len(index_repos)} timeseries.json ({total_bytes / 1024:.1f} KB total)")
    print(f"wrote index.json ({len(index_payload)} bytes)")

    portfolio = build_portfolio(all_ts)
    portfolio_payload = json.dumps(portfolio, separators=(",", ":"), sort_keys=True)
    (out_root / "portfolio.json").write_text(portfolio_payload)
    print(f"wrote portfolio.json ({len(portfolio_payload)} bytes)")

    return 0


def build_portfolio(all_ts: list[dict]) -> dict:
    """Aggregate per-repo timeseries into a single matrix-friendly artifact for the home page.

    Includes only the dates with any analyzed drift (working days). One row per repo
    with arrays parallel to `dates`. Missing values are `null`.
    """
    all_dates = sorted({
        d["date"] for ts in all_ts for d in ts["days"] if d.get("lineDrift") is not None
    })
    date_index = {d: i for i, d in enumerate(all_dates)}

    repos = []
    for ts in all_ts:
        by_date = {d["date"]: d for d in ts["days"]}
        line_arr: list[float | None] = [None] * len(all_dates)
        conflict_arr: list[float | None] = [None] * len(all_dates)
        file_arr: list[float | None] = [None] * len(all_dates)
        commits_arr: list[int | None] = [None] * len(all_dates)
        for date_str, day in by_date.items():
            i = date_index.get(date_str)
            if i is None:
                continue
            line_arr[i] = day.get("lineDrift")
            conflict_arr[i] = day.get("conflictDrift")
            file_arr[i] = day.get("fileDrift")
            commits_arr[i] = day.get("commits")
        repos.append({
            "name": ts["repo"],
            "drifts": {"line": line_arr, "conflict": conflict_arr, "file": file_arr},
            "commits": commits_arr,
        })

    repos.sort(key=lambda r: r["name"].lower())
    return {"dates": all_dates, "repos": repos}


if __name__ == "__main__":
    raise SystemExit(main())
