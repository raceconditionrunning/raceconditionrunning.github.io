"""
Generate a YAML summary for quarter schedules with their aggregate GeoJSON.

This is modeled after make_routes_table.py but focused on schedule metadata.
The script discovers schedule YAML files, validates the content, attaches
links to the pre-generated aggregate GeoJSON, and writes an ordered YAML list
that can be consumed by Jekyll data pages.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import yaml

import rcr

_SEASON_SEQUENCE = ["winter", "spring", "summer", "autumn"]

SEASON_LABELS = {season: season.title() for season in _SEASON_SEQUENCE}
SEASON_ORDER = {season: index for index, season in enumerate(_SEASON_SEQUENCE)}


@dataclass
class ScheduleRecord:
    """Container for the data we emit per schedule."""

    id: str
    year: int
    season: str
    aggregate_geojson: Path
    start_date: str
    end_date: str
    event_count: int
    route_count: int
    manual_route_count: int
    unique_date_count: int
    previous_id: str | None = None
    next_id: str | None = None

    @property
    def label(self) -> str:
        return f"{SEASON_LABELS.get(self.season, self.season.title())} {self.year}"

    def to_serializable(self) -> dict[str, object]:
        """Convert to the dict layout we want in YAML."""
        data: dict[str, object] = {
            "id": self.id,
            "label": self.label,
            "year": self.year,
            "season": self.season,
            "aggregate_geojson": self._public_geojson_path(),
            "start_date": self.start_date,
            "end_date": self.end_date,
            "event_count": self.event_count,
            "unique_date_count": self.unique_date_count,
            "route_count": self.route_count,
            "manual_route_count": self.manual_route_count,
        }
        if self.previous_id:
            data["previous_id"] = self.previous_id
        if self.next_id:
            data["next_id"] = self.next_id
        return data

    def _public_geojson_path(self) -> str:
        """Return the site-relative path to the aggregate GeoJSON."""
        try:
            rel_path = self.aggregate_geojson.relative_to(rcr.ROOT)
        except ValueError:
            rel_path = self.aggregate_geojson
        return "/" + rel_path.as_posix()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build schedule metadata table for Jekyll.")
    parser.add_argument(
        "--schedules-dir",
        type=Path,
        default=rcr.SCHEDULES,
        help="Directory containing quarter schedule YAML files (default: %(default)s)",
    )
    parser.add_argument(
        "--aggregates-dir",
        type=Path,
        default=rcr.ROOT / "routes" / "geojson" / "aggregates",
        help="Directory containing aggregate GeoJSON files (default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Destination YAML file to write.",
    )
    return parser.parse_args(list(argv))


def load_schedule(path: Path) -> list[dict]:
    with path.open("r") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, list):
        raise ValueError(f"Schedule file '{path}' is not a list.")
    return data


def validate_schedule_entries(schedule_id: str, entries: list[dict]) -> None:
    if not entries:
        raise ValueError(f"Schedule '{schedule_id}' has no entries.")
    for entry in entries:
        if "date" not in entry:
            raise ValueError(f"Schedule '{schedule_id}' entry {entry!r} missing 'date'.")
        if "plan" not in entry:
            raise ValueError(f"Schedule '{schedule_id}' entry {entry!r} missing 'plan'.")
        if not isinstance(entry["plan"], list):
            raise ValueError(f"Schedule '{schedule_id}' entry for {entry['date']} has non-list plan.")


def derive_dates(entries: list[dict]) -> tuple[str, str, int]:
    dates = []
    for entry in entries:
        # Accept ISO date strings; fall back to string if parsing fails.
        date_str = entry["date"]
        try:
            parsed = dt.date.fromisoformat(date_str)
            dates.append(parsed)
        except ValueError:
            # Keep the original order if parsing fails (but record the string).
            dates.append(date_str)
    first = dates[0]
    last = dates[-1]
    if isinstance(first, dt.date):
        start = first.isoformat()
    else:
        start = str(first)
    if isinstance(last, dt.date):
        end = last.isoformat()
    else:
        end = str(last)
    unique_dates = {entry["date"] for entry in entries}
    return start, end, len(unique_dates)


def count_plan_entries(entries: list[dict]) -> tuple[int, int]:
    route_count = 0
    manual_count = 0
    for entry in entries:
        for phase in entry["plan"]:
            if "cancelled" in phase:
                continue
            if "route_id" in phase:
                route_count += 1
            elif "route" in phase:
                manual_count += 1
    return route_count, manual_count


def build_record(path: Path, aggregate_dir: Path) -> ScheduleRecord:
    schedule_id = path.stem
    try:
        year_str, season = schedule_id.split("-", 1)
    except ValueError as exc:
        raise ValueError(f"Schedule filename '{path.name}' must be in '<year>-<season>.yml' form.") from exc

    if season not in SEASON_LABELS:
        raise ValueError(f"Unknown season '{season}' in schedule '{schedule_id}'.")

    try:
        year = int(year_str)
    except ValueError as exc:
        raise ValueError(f"Schedule '{schedule_id}' year must be numeric.") from exc

    entries = load_schedule(path)
    validate_schedule_entries(schedule_id, entries)
    start_date, end_date, unique_date_count = derive_dates(entries)
    route_count, manual_route_count = count_plan_entries(entries)

    aggregate_path = (aggregate_dir / f"{schedule_id}.geojson").resolve()
    if not aggregate_path.exists():
        raise FileNotFoundError(f"Missing aggregate GeoJSON for '{schedule_id}': {aggregate_path}")

    return ScheduleRecord(
        id=schedule_id,
        year=year,
        season=season,
        aggregate_geojson=aggregate_path,
        start_date=start_date,
        end_date=end_date,
        event_count=len(entries),
        route_count=route_count,
        manual_route_count=manual_route_count,
        unique_date_count=unique_date_count,
    )


def attach_navigation(records: list[ScheduleRecord]) -> None:
    for index, record in enumerate(records):
        if index > 0:
            record.previous_id = records[index - 1].id
        if index + 1 < len(records):
            record.next_id = records[index + 1].id


def write_yaml(records: list[ScheduleRecord], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w") as handle:
        handle.write("# AUTOGENERATED - DO NOT EDIT\n\n")
        yaml.safe_dump(
            [record.to_serializable() for record in records],
            handle,
            sort_keys=False,
            width=120,
            default_flow_style=False,
        )
        handle.write("\n")


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    schedules_dir = args.schedules_dir.resolve()
    aggregates_dir = args.aggregates_dir.resolve()
    if not schedules_dir.is_dir():
        print(f"Error: schedules directory '{schedules_dir}' does not exist.", file=sys.stderr)
        return 1
    if not aggregates_dir.is_dir():
        print(f"Error: aggregates directory '{aggregates_dir}' does not exist.", file=sys.stderr)
        return 1

    schedule_paths = list(sorted(schedules_dir.glob("*.yml"), key=lambda p: p.stem))
    if not schedule_paths:
        print(f"Error: no schedule files found in '{schedules_dir}'.", file=sys.stderr)
        return 1

    records: list[ScheduleRecord] = []
    for path in schedule_paths:
        try:
            records.append(build_record(path, aggregates_dir))
        except Exception as exc:  # pragma: no cover - defensive reporting
            print(f"Error processing schedule '{path}': {exc}", file=sys.stderr)
            return 1

    # order chronologically using rcr.schedule_paths to respect season ordering
    expected_order = {path.stem: index for index, path in enumerate(rcr.schedule_paths())}
    def sort_key(record: ScheduleRecord) -> tuple[int, int, int]:
        expected = expected_order.get(record.id)
        if expected is not None:
            return (0, expected, 0)
        return (1, record.year, SEASON_ORDER.get(record.season, 0))

    records.sort(key=sort_key)

    attach_navigation(records)
    write_yaml(records, args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
