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
        "--inputs",
        "-i",
        nargs="+",
        metavar="PATH",
        type=Path,
        required=True,
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

    if args.output in args.inputs:
        raise SystemExit("Output path must not be one of the inputs.")

    try:
        merged = merge_feature_collections(args.inputs)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    write_geojson(merged, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
