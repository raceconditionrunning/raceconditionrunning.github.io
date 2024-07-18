import pandas as pd
import geojson
import gpxpy
import os
import requests
from shapely import distance
from shapely.geometry import shape, Point
from statistics import mean

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), '..'))

GOOGLE_MAPS_API_KEY = ""
#"AIzaSyCJdAH_V4n12Ko
# DyNBcsAV86hWl1_49Hs0"

TRANSPORT_FILES = {
    "Light Rail": f"{ROOT}/locs/seattle_city_raw_data/sound_transit_light_rail.csv",
    "Ferry": f"{ROOT}/locs/seattle_city_raw_data/ferry.csv",
    # "Bus": f"{ROOT}/locs/seattle_city_raw_data/bus.csv",
}
LOCS_CSV_FILE = f"{ROOT}/locs/db.csv"

df = pd.read_csv(LOCS_CSV_FILE)
assert "id" in list(df), "db.csv does not contain location ids"

CRITICAL_LOC_NAMES = ["CSE", "GreenLake", "Beacon"]
CRITICAL_LOCS = []
for index, row in df.iterrows():
    if row['id'] in CRITICAL_LOC_NAMES:
        CRITICAL_LOCS.append((row['lon'], row['lat']))

STOPS = {}
for system_name, file_name in TRANSPORT_FILES.items():
    system_df = pd.read_csv(TRANSPORT_FILES[system_name])
    for index, row in system_df.iterrows():
        STOPS[row['stop_name']] = {
            'lon': row['stop_lon'],
            'lat': row['stop_lat'],
            'system': system_name,
        }

MAX_REACHABILITY = 3

def near_enough(p1, p2, threshold=0.005): #0.005 ~= 0.3 miles or 6 minutes of walking
    return distance(p1, p2) < threshold

## add new columns if not existing in csv
for col_name in ["transit", "reachability"]:
    if col_name not in df:
        df[col_name] = ""

for index, row in df.iterrows():
    id = row["id"]
    loc_point = Point(row['lon'], row['lat'])

    # match to nearest stop
    df.at[index, "transit"] = f"Bus or Drive"
    for stop_name, stop_dict in STOPS.items():
        if near_enough(loc_point, Point(stop_dict['lon'], stop_dict['lat'])):
            # import pdb; pdb.set_trace()
            df.at[index, "transit"] = f"{stop_dict['system']} to {stop_name} stop"
            break

    dest = "%7C".join([f"{lat}%2C{lon}" for lon, lat in CRITICAL_LOCS])
    orig = f"{row['lat']}%2C{row['lon']}"
    request = f"https://maps.googleapis.com/maps/api/distancematrix/json?destinations={dest}&origins={orig}&mode=transit&key={GOOGLE_MAPS_API_KEY}"
    response = requests.get(request)
    response_json = response.json()
    # import pdb;pdb.set_trace()
    if response.status_code == 200 and response_json.get("status") == "OK":
        distance_dicts = [r.get("elements", {})[0].get("duration", {}) for r in response_json.get("rows", {})]
        distance_sec = [d["value"] for d in distance_dicts if "value" in d]
        distance_text = [d["text"] for d in distance_dicts if "text" in d]
        reachability = MAX_REACHABILITY
        if distance_sec:
            avg_distance_mins = mean(distance_sec)/60
            max_distance_mins = max(distance_sec)/60
            reachability = min(reachability, 1 + int(max_distance_mins/(30)))
        df.at[index, "reachability"] = reachability

os.rename(LOCS_CSV_FILE, LOCS_CSV_FILE + "_old")
df.to_csv(LOCS_CSV_FILE, index=False)


 