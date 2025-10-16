"""Merge multiple GeoJSON FeatureCollections into a single output file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, Sequence


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Create and parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Merge multiple GeoJSON FeatureCollections into one file.",
    )
    parser.add_argument(
        "--route-id-file",
        metavar="PATH",
        type=Path,
        help="Optional text file containing route IDs (one per line) to merge.",
    )
    parser.add_argument(
        "--geojson-dir",
        metavar="DIR",
        type=Path,
        help="Directory containing per-route GeoJSON files named <route_id>.geojson.",
    )
    parser.add_argument(
        "--inputs",
        "-i",
        nargs="+",
        metavar="PATH",
        type=Path,
        help="Input GeoJSON files to merge.",
    )
    parser.add_argument(
        "--output",
        "-o",
        metavar="PATH",
        type=Path,
        required=True,
        help="Path for the merged GeoJSON FeatureCollection.",
    )
    return parser.parse_args(argv)


def load_route_id_file(path: Path) -> list[str]:
    """Return route IDs from ``path`` while preserving order and dropping duplicates."""
    if not path.exists():
        raise ValueError(f"Route ID file does not exist: {path}")
    if not path.is_file():
        raise ValueError(f"Route ID path is not a file: {path}")

    seen: set[str] = set()
    route_ids: list[str] = []

    with path.open("r", encoding="utf-8") as fh:
        for line_num, raw in enumerate(fh, start=1):
            route_id = raw.strip()
            if not route_id or route_id.startswith("#"):
                continue
            if " " in route_id or "\t" in route_id:
                raise ValueError(f"Route ID must not contain whitespace (line {line_num} in {path})")
            if route_id in seen:
                continue
            seen.add(route_id)
            route_ids.append(route_id)

    return route_ids


def resolve_input_paths(args: argparse.Namespace) -> list[Path]:
    """Resolve the list of GeoJSON inputs based on CLI arguments."""
    if args.inputs:
        if args.route_id_file or args.geojson_dir:
            raise ValueError("Provide either --inputs or --route-id-file/--geojson-dir, not both.")
        return list(args.inputs)

    if args.route_id_file and args.geojson_dir:
        if not args.geojson_dir.exists():
            raise ValueError(f"GeoJSON directory does not exist: {args.geojson_dir}")
        if not args.geojson_dir.is_dir():
            raise ValueError(f"GeoJSON path is not a directory: {args.geojson_dir}")

        route_ids = load_route_id_file(args.route_id_file)
        if not route_ids:
            return []

        paths: list[Path] = []
        missing: list[str] = []
        for route_id in route_ids:
            candidate = args.geojson_dir / f"{route_id}.geojson"
            if candidate.exists() and candidate.is_file():
                paths.append(candidate)
            else:
                missing.append(route_id)

        if missing:
            missing_ids = ", ".join(missing)
            raise ValueError(
                f"Missing GeoJSON file(s) for route ID(s): {missing_ids}. "
                f"Expected files at {args.geojson_dir}/<route_id>.geojson."
            )

        return paths

    raise ValueError("Provide either --inputs or both --route-id-file and --geojson-dir.")


def load_features(path: Path) -> list[dict]:
    """Load the GeoJSON features from ``path`` with basic validation."""
    if not path.exists():
        raise ValueError(f"Input file does not exist: {path}")
    if not path.is_file():
        raise ValueError(f"Input path is not a file: {path}")

    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to decode JSON from {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"GeoJSON root must be an object: {path}")

    geojson_type = data.get("type")
    if geojson_type == "FeatureCollection":
        features = data.get("features")
        if not isinstance(features, list):
            raise ValueError(f"'features' must be a list in {path}")
        return features
    if geojson_type == "Feature":
        return [data]

    raise ValueError(
        f"Expected GeoJSON type 'FeatureCollection' or 'Feature' in {path}, got {geojson_type!r}"
    )


def merge_feature_collections(paths: Iterable[Path]) -> dict:
    """Merge FeatureCollections from ``paths`` into a single collection."""
    merged: list[dict] = []
    for path in paths:
        merged.extend(load_features(path))
    return {"type": "FeatureCollection", "features": merged}


def write_geojson(data: dict, destination: Path) -> None:
    """Write GeoJSON ``data`` to ``destination`` with minimal whitespace."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=None, separators=(",", ":"))
        fh.write("\n")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        input_paths = resolve_input_paths(args)
        if args.output in input_paths:
            raise ValueError("Output path must not be one of the inputs.")
        merged = merge_feature_collections(input_paths)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    write_geojson(merged, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
