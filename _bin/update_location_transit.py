import os
import typing
from datetime import datetime, timedelta

import requests
import rcr
import haversine
import csv
import joblib
import gis

cache = joblib.Memory("cache").cache
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")

MAX_REACHABILITY = 3


locs = rcr.load_loc_db()
neighborhoods = rcr.load_neighborhoods()
CRITICAL_LOC_NAMES = ["CSE", "GreenLake", "Beacon"]
CRITICAL_LOCS = []

TRANSPORT_FILES = {
    "Light Rail": rcr.ROUTES / "transit_data/light_rail.csv",
    #"Ferry": rcr.ROUTES / "transit_data/ferry.csv",
    "Bus": rcr.ROUTES / "transit_data/bus.csv",
}

STOPS = {}
for system_name, file_name in TRANSPORT_FILES.items():
    with open(file_name, "r") as f:
        system = csv.DictReader(f, dialect="unix")
        for loc in system:
            STOPS[loc['stop_name']] = {
                'lon': float(loc['stop_lon']),
                'lat': float(loc['stop_lat']),
                'system': system_name,
            }

for critical_loc in CRITICAL_LOC_NAMES:
    for loc in locs:
        if loc['id'] == critical_loc:
            CRITICAL_LOCS.append((loc["id"], loc['lat'], loc['lon']))


# determine if this stop is "close enough"
def near_enough(p1, p2, threshold=0.3): #0.3 miles or 6 minutes of walking
    return haversine.haversine(p1, p2, unit=haversine.Unit.MILES) < threshold

@cache
def query_routes(start: tuple[float, float], destinations: typing.Iterable[tuple[float, float]], arrive_time, mode="TRANSIT"):
    orig = [{"waypoint": { "location": {"latLng": {"latitude": start[0], "longitude": start[1]}}}}]
    dest = [{"waypoint": { "location": {"latLng": {"latitude": d[0], "longitude": d[1]}}}} for d in destinations]
    epoch_time_next_saturday = arrive_time.isoformat() + 'Z'

    response = requests.post(f"https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
                            json={
                                    "destinations": dest,
                                    "origins": orig,
                                    "travelMode": mode,
                                    "arrivalTime": epoch_time_next_saturday},
                             headers={"Content-Type": "application/json",
                                      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                             "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition"}
                             )
    response_json = response.json()

    if response.status_code == 200:
        distance_sec = []
        for dest in sorted(response_json, key=lambda x: x["destinationIndex"]):
            if "duration" in dest:
                distance_sec.append(int(dest["duration"][:-1]))
            else:
                distance_sec.append(None)
        return distance_sec

    raise Exception(f"Error in query_routes: {response.status_code} {response_json}")

# Calculate the number of days to the next Saturday (weekday 5)
days_to_saturday = (5 - datetime.today().weekday() + 7) % 7
next_saturday = datetime.today() + timedelta(days=days_to_saturday)
next_saturday = next_saturday.replace(hour=8, minute=30, second=0, microsecond=0)

for loc in locs:
    id = loc["id"]
    print(f"Processing {id}")
    # match to nearest stop
    transit_choice = f"Bus or Drive"
    for stop_name, stop_dict in STOPS.items():
        if near_enough((loc["lat"], loc["lon"]), (stop_dict['lat'], stop_dict['lon'])):
            transit_choice = f"{stop_dict['system']} to {stop_name} stop"
            break
    loc["transit"] = transit_choice

    # Tag with neighborhood
    for (n_name, n_coarse_name), (n_shape, bbox) in neighborhoods.items():
        if gis.is_point_in_bbox(loc["lon"], loc["lat"], bbox) and gis.is_point_in_polygon(loc["lon"], loc["lat"], n_shape):
            loc["neighborhood"] = n_name
            break

    # determine reachability
    query_locations = [stop[1:] for stop in CRITICAL_LOCS if stop[0] != id]
    distance_sec = query_routes((loc["lat"], loc["lon"]), query_locations, next_saturday)

    reachability = MAX_REACHABILITY
    # Mark bad reachability if there is a missing value
    if distance_sec and all(distance_sec):
        avg_distance_mins = sum(distance_sec) / len(distance_sec) /60
        max_distance_mins = max(distance_sec)/60
        reachability = min(reachability, 1 + int(max_distance_mins/(30)))
    print(list(zip([stop[0] for stop in CRITICAL_LOCS if stop[0] != id], distance_sec)))
    print(f"Reachability: {reachability}")
    loc["reachability"] = reachability

rcr.save_loc_db(locs)
