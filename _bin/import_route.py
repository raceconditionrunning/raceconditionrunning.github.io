#!/usr/bin/env python3
"""Create or import a GPX route file for the RCR website.

Usage:
  # From an OnTheGoMap URL (share link or full URL):
  uv run python3 _bin/import_route.py \\
    --url "https://onthegomap.com/s/ke0cnl2r" \\
    --id cse-sobel-mercer-island \\
    --name "CSE, South Bellevue, Mercer Island"

  # From an existing GPX file:
  uv run python3 _bin/import_route.py \\
    --gpx ~/Downloads/my-route.gpx \\
    --id cse-sobel-mercer-island \\
    --name "CSE, South Bellevue, Mercer Island"

The script:
  1. Extracts track points from the source (URL polyline or GPX file)
  2. Fetches missing elevation data (USGS 3DEP, with Open-Meteo fallback)
  3. Writes a GPX file in the RCR project format to routes/_gpx/<id>.gpx
  4. Runs normalize_gpx.py to finalize the file

Elevation is fetched from USGS 3DEP (~10m resolution), with Open-Meteo as fallback.
Points are batched (up to 100 per request) with retry + backoff on 429 errors.
"""

import argparse
import pathlib
import subprocess
import sys
import urllib.parse

# Allow importing from project root (parent of _bin/)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from utils.onthegomap import (
    compute_distance_mi,
    coords_to_url,
    fetch_elevations,
    gpx_to_coords,
    long_to_short_url,
    url_to_coords,
    write_rcr_gpx,
)


def main():
    parser = argparse.ArgumentParser(
        description="Import a route into the RCR website as a GPX file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--url",
        help="OnTheGoMap URL (share link or full redirect URL with r2= param)",
    )
    source.add_argument(
        "--gpx",
        help="Path to an existing GPX file to reformat and fill in elevation",
    )

    parser.add_argument("--id", required=True, help="Route ID (kebab-case filename stem, e.g. cse-sobel-mercer-island)")
    parser.add_argument("--name", required=True, help='Human-readable route name (e.g. "CSE, South Bellevue, Mercer Island")')
    parser.add_argument(
        "--map-url",
        default=None,
        help="OnTheGoMap share URL for the rcr:map extension (auto-generated if omitted)",
    )
    parser.add_argument(
        "--overwrite-elevation",
        action="store_true",
        help="Replace existing elevation data in an imported GPX file",
    )
    parser.add_argument(
        "--skip-normalize",
        action="store_true",
        help="Skip running normalize_gpx.py after writing (useful if normalize_gpx.py is unavailable)",
    )

    args = parser.parse_args()

    # Determine project root (this script lives in _bin/)
    script_dir = pathlib.Path(__file__).resolve().parent
    project_root = script_dir.parent
    output_path = project_root / "routes" / "_gpx" / f"{args.id}.gpx"

    if output_path.exists():
        print(f"WARNING: {output_path} already exists and will be overwritten")

    # --- Extract coordinates ---
    existing_elevations = None
    map_url = args.map_url

    if args.url:
        print(f"Fetching route from OnTheGoMap: {args.url}")
        coords = url_to_coords(args.url)
        print(f"  decoded {len(coords)} track points")
        if not map_url:
            parsed = urllib.parse.urlparse(args.url)
            if parsed.path.startswith("/s/"):
                map_url = args.url
            else:
                print("Generating short URL for map link...")
                map_url = long_to_short_url(args.url)
                print(f"  {map_url}")
    else:
        print(f"Importing GPX: {args.gpx}")
        coords, existing_elevations = gpx_to_coords(args.gpx)
        print(f"  loaded {len(coords)} track points")

    # --- Fetch elevation data ---
    need_elevation_indices = []
    elevations = [None] * len(coords)

    if existing_elevations is not None and not args.overwrite_elevation:
        for i, ele in enumerate(existing_elevations):
            if ele is not None:
                elevations[i] = ele
        need_elevation_indices = [i for i, e in enumerate(elevations) if e is None]
    else:
        need_elevation_indices = list(range(len(coords)))

    if need_elevation_indices:
        n_missing = len(need_elevation_indices)
        print(f"Fetching elevation for {n_missing} point(s)...")
        missing_coords = [coords[i] for i in need_elevation_indices]
        fetched = fetch_elevations(missing_coords)
        for idx, ele in zip(need_elevation_indices, fetched):
            elevations[idx] = ele
    else:
        print("All points already have elevation data")

    # Sanity check: no Nones left
    missing = sum(1 for e in elevations if e is None)
    if missing:
        print(
            f"WARNING: {missing} point(s) still missing elevation — "
            f"using 0.0 as fallback",
            file=sys.stderr,
        )
        elevations = [e if e is not None else 0.0 for e in elevations]

    # --- Auto-generate short URL if no map URL yet (e.g. --gpx without --map-url) ---
    if not map_url:
        print("Generating short URL for map link...")
        long_url = coords_to_url(coords)
        map_url = long_to_short_url(long_url)
        print(f"  {map_url}")

    distance_mi = compute_distance_mi(coords)
    print(f"Route: {args.name} ({distance_mi:.1f} mi), {len(coords)} points")

    # --- Write GPX ---
    write_rcr_gpx(coords, elevations, args.id, args.name, str(output_path), map_url)
    print(f"Wrote {output_path}")

    # --- Normalize ---
    if not args.skip_normalize:
        print("Running normalize_gpx.py...")
        normalize_script = script_dir / "normalize_gpx.py"
        if normalize_script.exists():
            result = subprocess.run(
                [
                    sys.executable,
                    str(normalize_script),
                    "--input", str(output_path),
                    "--output", str(output_path),
                ],
                cwd=str(project_root),
            )
            if result.returncode != 0:
                print(
                    "WARNING: normalize_gpx.py exited with errors (see above). "
                    "The GPX file was still written but may need manual fixes.",
                    file=sys.stderr,
                )
        else:
            print(
                f"WARNING: {normalize_script} not found, skipping normalization",
                file=sys.stderr,
            )

    print("Done!")


if __name__ == "__main__":
    main()
