"""Build per-repo time series JSON artifacts for the dashboard.

Reads the wide-format CSVs produced by drift-repo-analysis, transposes them
into a per-day record list, and writes:

    public/data/index.json
    public/data/repos/<repo>/timeseries.json

The source root is read from DRIFT_REPO_ANALYSIS_PATH (loaded from .env at
the project root). The script fails loudly if the variable is missing or
the path does not exist.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv


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


def coerce(value):
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def build_repo_timeseries(csv_path: Path) -> dict:
    df = pd.read_csv(csv_path, sep=";", index_col=0)
    df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed")]]

    days = []
    for col in df.columns:
        day_date = parse_header_date(str(col))
        row: dict = {"date": day_date.isoformat()}
        for source_key, out_key in METRIC_KEYS.items():
            if source_key in df.index:
                row[out_key] = coerce(df.at[source_key, col])
            else:
                row[out_key] = None
        days.append(row)

    days.sort(key=lambda d: d["date"])

    return {
        "repo": csv_path.stem.replace("_report_collection", ""),
        "days": days,
    }


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    load_dotenv(project_root / ".env")

    raw = os.environ.get("DRIFT_REPO_ANALYSIS_PATH")
    if not raw:
        print(
            "ERROR: DRIFT_REPO_ANALYSIS_PATH is not set. "
            "Copy .env.example to .env and fill it in.",
            file=sys.stderr,
        )
        return 1

    source_root = Path(raw)
    if not source_root.is_dir():
        print(
            f"ERROR: DRIFT_REPO_ANALYSIS_PATH does not point to a directory: {source_root}",
            file=sys.stderr,
        )
        return 1

    csv_dir = source_root / "driftool_postprocess" / "timeseries_drift"
    if not csv_dir.is_dir():
        print(f"ERROR: expected directory not found: {csv_dir}", file=sys.stderr)
        return 1

    out_root = project_root / "public" / "data"
    repos_root = out_root / "repos"
    repos_root.mkdir(parents=True, exist_ok=True)

    csvs = sorted(p for p in csv_dir.glob("*_report_collection.csv") if "_GER" not in p.name)
    if not csvs:
        print(f"ERROR: no CSVs found in {csv_dir}", file=sys.stderr)
        return 1

    index_repos = []
    for csv_path in csvs:
        ts = build_repo_timeseries(csv_path)
        repo_dir = repos_root / ts["repo"]
        repo_dir.mkdir(parents=True, exist_ok=True)
        (repo_dir / "timeseries.json").write_text(json.dumps(ts, separators=(",", ":")))

        with_drift = [d for d in ts["days"] if d.get("lineDrift") is not None]
        date_range = [with_drift[0]["date"], with_drift[-1]["date"]] if with_drift else None

        index_repos.append({
            "name": ts["repo"],
            "dateRange": date_range,
            "dayCount": len(ts["days"]),
            "dayWithDriftCount": len(with_drift),
        })
        print(f"  {csv_path.name} -> {ts['repo']} ({len(ts['days'])} days, {len(with_drift)} with drift)")

    index = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repos": sorted(index_repos, key=lambda r: r["name"].lower()),
    }
    (out_root / "index.json").write_text(json.dumps(index, indent=2))
    print(f"\nwrote {len(index_repos)} repos to {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
