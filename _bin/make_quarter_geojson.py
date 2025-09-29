"""Generate quarter-level GeoJSON files for scheduled routes."""

import argparse
import json

import rcr
from gpx_to_geojson import route_geojson


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate quarter GeoJSON files from the published schedules."
    )
    parser.add_argument(
        "--quarter",
        action="append",
        dest="quarters",
        help="Specific quarter(s) to regenerate (defaults to all)",
    )
    args = parser.parse_args()

    schedules = rcr.load_schedules()
    quarters = args.quarters or sorted(schedules)
    route_features = {
        route["id"]: route_geojson(route)
        for route in rcr.load_routes()
    }
    output_dir = rcr.ROOT / "routes" / "geojson" / "quarters"
    output_dir.mkdir(parents=True, exist_ok=True)

    for quarter in quarters:
        if quarter not in schedules:
            raise SystemExit(f"Unknown quarter: {quarter}")

        runs_by_route = {}
        for entry in schedules[quarter] or []:
            if entry.get("cancelled"):
                continue
            date = entry.get("date")
            for plan in entry.get("plan") or []:
                if plan.get("cancelled"):
                    continue
                route_id = plan.get("route_id")
                if not route_id:
                    continue
                run = {"route_id": route_id}
                if date is not None:
                    run["date"] = date
                for key, value in plan.items():
                    if key in {"route_id", "cancelled"}:
                        continue
                    run[key] = value
                runs_by_route.setdefault(route_id, []).append(run)

        features = []
        for route_id in sorted(runs_by_route):
            base = route_features.get(route_id)
            if not base:
                continue
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

        output_path = output_dir / f"{quarter}.geojson"
        with output_path.open("w") as fh:
            json.dump({"type": "FeatureCollection", "features": features}, fh, indent=2)
            fh.write("\n")


if __name__ == "__main__":
    main()
