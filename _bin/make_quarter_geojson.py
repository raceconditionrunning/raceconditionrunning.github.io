"""Generate quarter-level GeoJSON FeatureCollections for scheduled routes."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Sequence

import yaml

import rcr
from gpx_to_geojson import route_geojson


class ScheduleError(ValueError):
    """Raised when a schedule file is missing required data."""


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Create and parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate quarter GeoJSON files from published schedules.",
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
        help="Destination for the generated quarter GeoJSON.",
    )
    parser.add_argument(
        "--quarter",
        "-q",
        metavar="NAME",
        help="Explicit quarter identifier (defaults to the input filename stem).",
    )
    return parser.parse_args(argv)


def derive_quarter_name(input_path: Path, override: str | None) -> str:
    """Determine the quarter identifier from CLI args or the schedule path."""
    if override:
        return override

    stem = input_path.stem
    if not stem:
        raise ScheduleError(f"Unable to derive quarter name from {input_path}")

    quarter_pattern = re.compile(r"^\d{2}-(winter|spring|summer|autumn)$")
    if not quarter_pattern.match(stem):
        raise ScheduleError(
            f"Schedule filename stem {stem!r} does not look like a quarter identifier."
        )
    return stem


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


def collect_runs_by_route(entries: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group schedule runs by ``route_id`` while ignoring cancelled entries."""
    grouped: dict[str, list[dict[str, Any]]] = {}

    for idx, entry in enumerate(entries):
        if entry.get("cancelled"):
            continue

        date = entry.get("date")
        if date is not None and not isinstance(date, str):
            raise ScheduleError(f"'date' must be a string when provided (entry #{idx})")

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

            run: dict[str, Any] = {"route_id": route_id}
            if date is not None:
                run["date"] = date
            for key, value in plan.items():
                if key in {"route_id", "cancelled"}:
                    continue
                run[key] = value

            grouped.setdefault(route_id, []).append(run)

    return grouped


def load_route_features(route_ids: set[str]) -> dict[str, dict[str, Any]]:
    """Load route features only for the required ``route_ids``."""
    if not route_ids:
        return {}

    remaining = set(route_ids)
    features: dict[str, dict[str, Any]] = {}

    for path in rcr.gpx_paths():
        route_id = path.stem
        if route_id not in remaining:
            continue

        route = rcr.load_route(path)
        features[route_id] = route_geojson(route)
        remaining.remove(route_id)

        if not remaining:
            break

    if remaining:
        missing = ", ".join(sorted(remaining))
        raise ScheduleError(f"Missing GPX file(s) for route_id(s): {missing}")

    return features


def build_feature_collection(
    quarter: str,
    route_features: dict[str, dict[str, Any]],
    runs_by_route: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Combine route geometry/metadata with scheduled runs for the quarter."""
    features: list[dict[str, Any]] = []
    for route_id in sorted(runs_by_route):
        base = route_features.get(route_id)
        if base is None:
            raise ScheduleError(f"Unknown route_id referenced in schedule: {route_id}")

        properties = dict(base.get("properties", {}))
        properties["quarter"] = quarter
        properties["scheduled_runs"] = runs_by_route[route_id]

        features.append(
            {
                "type": base.get("type", "Feature"),
                "geometry": base.get("geometry"),
                "properties": properties,
            }
        )

    return {"type": "FeatureCollection", "features": features}


def write_geojson(collection: dict[str, Any], destination: Path) -> None:
    """Write the GeoJSON collection to ``destination`` with indentation."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as fh:
        json.dump(collection, fh, indent=2)
        fh.write("\n")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        quarter = derive_quarter_name(args.input, args.quarter)
        schedule_entries = load_schedule(args.input)
        runs_by_route = collect_runs_by_route(schedule_entries)
        route_features = load_route_features(set(runs_by_route))
        collection = build_feature_collection(quarter, route_features, runs_by_route)
    except ScheduleError as exc:
        raise SystemExit(str(exc)) from exc

    write_geojson(collection, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
