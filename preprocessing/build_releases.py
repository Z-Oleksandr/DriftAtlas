"""Parse release dump files into a {repo: [{date, tag}]} map.

Reads `$DRIFT_REPO_ANALYSIS_PATH/stats_crawler/releases/dumps/releases_dump_<repo>_*.json`,
returns a dict keyed by repo name. Each entry is sorted by date.

Imported by build_timeseries.py — not run standalone.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path


_DUMP_NAME = re.compile(r"releases_dump_(?P<repo>[^_]+(?:[._-][^_]+)*)_fetched_[\d.]+\.json$")


def _iso_date(raw: str | None) -> str | None:
    if not raw:
        return None
    # GitHub returns ISO-8601 with Z suffix, e.g. "2024-04-15T19:21:33Z".
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def collect_releases(source_root: Path) -> dict[str, list[dict[str, str]]]:
    dumps_dir = source_root / "stats_crawler" / "releases" / "dumps"
    if not dumps_dir.is_dir():
        return {}

    out: dict[str, list[dict[str, str]]] = {}
    for path in sorted(dumps_dir.glob("releases_dump_*.json")):
        match = _DUMP_NAME.match(path.name)
        if not match:
            continue
        repo = match.group("repo")

        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)

        # GitHub paginated dumps come as [[page1...], [page2...]] OR [release, ...].
        flat: list[dict] = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, list):
                    flat.extend(x for x in item if isinstance(x, dict))
                elif isinstance(item, dict):
                    flat.append(item)

        records: list[dict[str, str]] = []
        for rel in flat:
            date = _iso_date(rel.get("published_at") or rel.get("created_at"))
            tag = rel.get("tag_name") or rel.get("name") or ""
            if date and tag:
                records.append({"date": date, "tag": tag})

        records.sort(key=lambda r: r["date"])
        out[repo] = records

    return out
