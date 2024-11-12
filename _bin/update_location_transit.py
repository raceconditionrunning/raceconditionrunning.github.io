import csv
from datetime import datetime, timedelta

import requests
import rcr
import haversine
import os

ROUTES_LOCS_DIR = rcr.ROUTES
GOOGLE_MAPS_API_KEY = open("_api_keys/google_maps", "r").read().strip()

MAX_REACHABILITY = 3


locs = rcr.load_loc_db()
CRITICAL_LOC_NAMES = ["CSE", "GreenLake", "Beacon"]
CRITICAL_LOCS = []
for critical_loc in CRITICAL_LOC_NAMES:
    for row in locs:
        if row['id'] == critical_loc:
            CRITICAL_LOCS.append((row['lon'], row['lat']))


# determine if this stop is "close enough"
def near_enough(p1, p2, threshold=0.005): #0.005 ~= 0.3 miles or 6 minutes of walking
    return haversine.haversine(p1, p2) < threshold


for row in locs:
    id = row["id"]
    print(f"Processing {id}")
    # match to nearest stop
    transit_choice = f"Bus or Drive"
    for stop_name, stop_dict in STOPS.items():
        if near_enough((float(row["lat"]), float(row["lon"])), (stop_dict['lat'], stop_dict['lon'])):
            transit_choice = f"{stop_dict['system']} to {stop_name} stop"
            break
    row["transit"] = transit_choice
    dest = "|".join([f"{lat},{lon}" for lon, lat in CRITICAL_LOCS])
    orig = f"{row['lat']},{row['lon']}"
    # Calculate the number of days to the next Saturday (weekday 5)
    days_to_saturday = (5 - datetime.today().weekday() + 7) % 7
    next_saturday = datetime.today() + timedelta(days=days_to_saturday)
    next_saturday = next_saturday.replace(hour=8, minute=30, second=0, microsecond=0)
    epoch_time_next_saturday = int(next_saturday.timestamp())
    response = requests.get(f"https://maps.googleapis.com/maps/api/distancematrix/json",
                            params=
                            {"destinations": dest,
                             "origins": orig,
                             "mode": "transit",
                             "key": GOOGLE_MAPS_API_KEY,
                             "arrival_time": epoch_time_next_saturday})
    response_json = response.json()

    if response.status_code == 200 and response_json.get("status") == "OK":
        distance_dicts = [r.get("elements", {})[0].get("duration", {}) for r in response_json.get("rows", {})]
        distance_sec = [d["value"] for d in distance_dicts if "value" in d]
        distance_text = [d["text"] for d in distance_dicts if "text" in d]
        reachability = MAX_REACHABILITY
        if distance_sec:
            avg_distance_mins = sum(distance_sec) / len(distance_sec) /60
            max_distance_mins = max(distance_sec)/60
            reachability = min(reachability, 1 + int(max_distance_mins/(30)))
        row["reachability"] = reachability

with open(rcr.LOC_DB, "w") as f:
    writer = csv.DictWriter(f, locs[0].keys(), dialect='unix')
    writer.writeheader()
    writer.writerows(locs)