"""Extract unique route IDs referenced in a quarter schedule YAML file."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Sequence

import yaml


class ScheduleError(ValueError):
    """Raised when a schedule file is missing required data."""


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Create and parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Extract unique route IDs from a quarter schedule.",
    )
    parser.add_argument(
        "--input",
        "-i",
        metavar="PATH",
        type=Path,
        required=True,
        help="Quarter schedule YAML file.",
    )
    parser.add_argument(
        "--output",
        "-o",
        metavar="PATH",
        type=Path,
        required=True,
        help="Destination file for the route IDs (one per line).",
    )
    return parser.parse_args(argv)


def load_schedule(path: Path) -> list[dict[str, Any]]:
    """Load and validate the schedule YAML for a single quarter."""
    if not path.exists():
        raise ScheduleError(f"Schedule file does not exist: {path}")
    if not path.is_file():
        raise ScheduleError(f"Schedule path is not a file: {path}")

    try:
        with path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        raise ScheduleError(f"Failed to parse YAML from {path}: {exc}") from exc

    if data is None:
        return []
    if not isinstance(data, list):
        raise ScheduleError(f"Expected a list of schedule entries in {path}")

    validated: list[dict[str, Any]] = []
    for idx, entry in enumerate(data):
        if entry is None:
            continue
        if not isinstance(entry, dict):
            raise ScheduleError(f"Schedule entry #{idx} must be a mapping")
        validated.append(entry)
    return validated


def collect_route_ids(entries: list[dict[str, Any]]) -> list[str]:
    """Return sorted route IDs for non-cancelled runs in ``entries``."""
    route_ids: set[str] = set()

    for idx, entry in enumerate(entries):
        if entry.get("cancelled"):
            continue

        plans = entry.get("plan") or []
        if not isinstance(plans, list):
            raise ScheduleError(f"'plan' must be a list (entry #{idx})")

        for plan_idx, plan in enumerate(plans):
            if plan is None or plan.get("cancelled"):
                continue
            if not isinstance(plan, dict):
                raise ScheduleError(
                    f"Plan entry #{plan_idx} in schedule entry #{idx} must be a mapping"
                )

            route_id = plan.get("route_id")
            if not route_id:
                continue  # public events without route IDs are intentionally skipped.
            if not isinstance(route_id, str):
                raise ScheduleError(
                    f"'route_id' must be a string (entry #{idx}, plan #{plan_idx})"
                )

            route_ids.add(route_id)

    return sorted(route_ids)


def write_route_ids(route_ids: list[str], destination: Path) -> None:
    """Write ``route_ids`` to ``destination`` (one per line)."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as fh:
        for route_id in route_ids:
            fh.write(f"{route_id}\n")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        schedule_entries = load_schedule(args.input)
        route_ids = collect_route_ids(schedule_entries)
    except ScheduleError as exc:
        raise SystemExit(str(exc)) from exc

    write_route_ids(route_ids, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
