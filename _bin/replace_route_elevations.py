import argparse

import gpxpy
import requests
from gpxpy.gpx import GPXTrackPoint
from joblib import Memory
import time
import haversine
from typing import Callable
import tqdm
import sys

cache = Memory("cache", verbose=0).cache

def distance_window_smoothing(
    points: list[GPXTrackPoint],
    distance_window: float,
    accumulate: Callable[[int], float],
    compute: Callable[[float, int, int], float],
    remove: Callable[[int], float] = None
) -> list[float]:
    result = []

    start = 0
    end = 0
    accumulated = 0

    for i in range(len(points)):
        while start + 1 < i and haversine.haversine((points[start].latitude, points[start].longitude), (points[i].latitude, points[i].longitude), unit=haversine.Unit.METERS) > distance_window:
            if remove:
                accumulated -= remove(start)
            else:
                accumulated -= accumulate(start)
            start += 1

        while end < len(points) and haversine.haversine((points[i].latitude, points[i].longitude), (points[end].latitude, points[end].longitude), unit=haversine.Unit.METERS) <= distance_window:
            accumulated += accumulate(end)
            end += 1

        result.append(compute(accumulated, start, end - 1))

    return result


def compute_smoothed_elevation(track: list[GPXTrackPoint]) -> list[float]:
    def accumulate(index: int) -> float:
        return track[index].elevation if track[index].elevation else 0

    def compute(accumulated: float, start: int, end: int) -> float:
        return accumulated / (end - start + 1)

    smoothed = distance_window_smoothing(
        track,
        distance_window=100,
        accumulate=accumulate,
        compute=compute
    )

    if track:
        smoothed[0] = track[0].elevation if track[0].elevation else 0
        smoothed[-1] = track[-1].elevation if track[-1].elevation else 0

    return smoothed


@cache
def query_usgs_elevation(lat, lon, wait_time=0.0):
    url = f'https://epqs.nationalmap.gov/v1/json'
    params = {
        'x': lon,
        'y': lat,
        'units': 'Meters',
    }
    ## res = requests.get(url, params=params).json()
    ## # Use this param to avoid slamming the server
    ## time.sleep(wait_time)
    ## return float(res['value'])

    # sometimes the USGS server returns a 200 but with an empty body
    # hypothesis: this is some kind of bad rate limiting
    raw = requests.get(url, params=params)
    try:
        res = raw.json()
        # Use this param to avoid slamming the server
        time.sleep(wait_time)
        return float(res['value'])
    except Exception as e:
        print(f"Error querying elevation for {lat}, {lon}")
        print(f"Exception: {e}")
        print(f"Response code: {raw.status_code} ({raw.reason})")
        print(f"Response text: {raw.text}")
        print(f"Response content: {raw.content}")
        print(f"Consider waiting an hour and increasing --wait")
        sys.exit(1)
        return None

def main():
    parser = argparse.ArgumentParser(description="Replace route elevations files.")
    parser.add_argument("--input", required=True, nargs="+", help="Input GPX file(s).")
    parser.add_argument("--output", required=True, nargs="+", help="Output GPX file(s).")
    parser.add_argument("--overwrite", action="store_true", help="Replace any existing elevation data")
    parser.add_argument("--wait", type=float, default=0.25, help="Wait time between elevation queries (seconds)")
    args = parser.parse_args()
    print("Resulting GPX files will be denormalized. Use `normalize_gpx.py` to fix them before committing.")

    if len(args.input) != len(args.output):
        raise ValueError("The number of inputs must match the number of outputs.")

    for inpath, outpath in zip(args.input, args.output):
        # Load GPX
        route = gpxpy.parse(open(inpath, 'r'))
        # Iterate over all tracks
        for track in route.tracks:
            for segment in track.segments:
                for point in tqdm.tqdm(segment.points):
                    if not point.elevation or args.overwrite:
                        point.elevation = query_usgs_elevation(point.latitude, point.longitude, wait_time=args.wait)
        # Iterate over all waypoints (pois)
        for waypoint in route.waypoints:
            if not waypoint.elevation or args.overwrite:
                waypoint.elevation = query_usgs_elevation(waypoint.latitude, waypoint.longitude, wait_time=args.wait)

        # Save GPX
        with open(outpath, 'w') as f:
            f.write(route.to_xml())

if __name__ == '__main__':
    main()
