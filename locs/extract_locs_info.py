import pandas as pd
import geojson
import gpxpy
import os
from shapely import distance
from shapely.geometry import shape, Point

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), '..'))

TRANSPORT_FILES = {
    "Light Rail": f"{ROOT}/locs/seattle_city_raw_data/sound_transit_light_rail.csv",
    "Ferry": f"{ROOT}/locs/seattle_city_raw_data/ferry.csv",
    "Bus": f"{ROOT}/locs/seattle_city_raw_data/bus.csv",
}
LOCS_CSV_FILE = f"{ROOT}/locs/db.csv"

df = pd.read_csv(LOCS_CSV_FILE)
assert "id" in list(df), "db.csv does not contain location ids"

def near_enough(p1, p2, threshold=0.005): #0.005 ~= 0.3 miles or 6 minutes of walking
    return distance(p1, p2) < threshold

STOPS = {}

for system_name, file_name in TRANSPORT_FILES.items():
    system_df = pd.read_csv(TRANSPORT_FILES[system_name])
    for index, row in system_df.iterrows():
        STOPS[row['stop_name']] = {
            'lat': row['stop_lat'],
            'lon': row['stop_lon'],
            'system': system_name,
        }

# construct point based on lon/lat returned by geocoder

# check each polygon to see if it contains the point

## add new columns if not existing in csv
for col_name in ["transit"]:
    if col_name not in df:
        df[col_name] = ""

for index, row in df.iterrows():
    id = row["id"]

    loc_point = Point(row['long'], row['lat'])

    for stop_name, stop_dict in STOPS.items():
        if near_enough(loc_point, Point(stop_dict['lon'], stop_dict['lat'])):
            df.at[index, "transit"] = f"{stop_dict["system"]} to {stop_name} stop"
            break


df.to_csv(LOCS_CSV_FILE + "_new")

 