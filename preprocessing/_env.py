"""Shared env loading for preprocessing scripts. Fails loudly on missing config."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ANALYSIS_RUN = "full_run_16_asym"


def load_source_root() -> Path:
    load_dotenv(PROJECT_ROOT / ".env")
    raw = os.environ.get("DRIFT_REPO_ANALYSIS_PATH")
    if not raw:
        print(
            "ERROR: DRIFT_REPO_ANALYSIS_PATH is not set. "
            "Copy .env.example to .env and fill it in.",
            file=sys.stderr,
        )
        sys.exit(1)
    source_root = Path(raw)
    if not source_root.is_dir():
        print(
            f"ERROR: DRIFT_REPO_ANALYSIS_PATH does not point to a directory: {source_root}",
            file=sys.stderr,
        )
        sys.exit(1)
    return source_root


def out_data_root() -> Path:
    return PROJECT_ROOT / "public" / "data"
