import pandas as pd
import geojson
import gpxpy
import os
from shapely import distance
from shapely.geometry import shape, Point

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), '..'))
ROUTES_LOCS_DIR = os.path.join(ROOT, "routes_and_locs")

GOOGLE_MAPS_API_KEY = open("_api_keys/google_maps", "r").read().strip()

NEIGHBORHOOD_FILE = f"{ROUTES_LOCS_DIR}/seattle_transit_data/Neighborhood_Map_Atlas_Neighborhoods.geojson"
ROUTES_CSV_FILE = f"{ROUTES_LOCS_DIR}/routes.csv"
LOCS_CSV_FILE = f"{ROUTES_LOCS_DIR}/locs.csv"

TRANSPORT_FILES = {
    "Light Rail": f"{ROUTES_LOCS_DIR}/seattle_transit_data/light_rail.csv",
    "Ferry": f"{ROUTES_LOCS_DIR}/seattle_transit_data/ferry.csv",
    "Bus": f"{ROUTES_LOCS_DIR}/seattle_transit_data/bus.csv",
}

STOPS = {}
for system_name, file_name in TRANSPORT_FILES.items():
    system_df = pd.read_csv(TRANSPORT_FILES[system_name])
    for index, row in system_df.iterrows():
        STOPS[row['stop_name']] = {
            'lat': row['stop_lat'],
            'lon': row['stop_lon'],
            'system': system_name,
        }

df = pd.read_csv(ROUTES_CSV_FILE)
assert "id" in list(df), "db.csv does not contain route ids"

NEIGHBORHOOD_POLYGONS = {}
with open(NEIGHBORHOOD_FILE) as f:
    gj = geojson.load(f)

for n_obj in gj['features']:
    n_lname = n_obj["properties"]["L_HOOD"]
    n_sname = n_obj["properties"]["S_HOOD"]
    n_shape = shape(n_obj["geometry"])
    NEIGHBORHOOD_POLYGONS[(n_sname, n_lname)] = n_shape

# determine if this stop is "close enough"
def near_enough(p1, p2, threshold=0.005): #0.005 ~= 0.3 miles or 6 minutes of walking
    return distance(p1, p2) < threshold

## add new columns if not existing in csv
for col_name in ["neighborhoods", "coarse_neighborhoods", "start_neighborhood", "end_neighborhood"]: #, "transit"]:
    if col_name not in df:
        df[col_name] = ""

for index, row in df.iterrows():
    id = row["id"]
    gpx_file = open(f"{ROUTES_LOCS_DIR}/gpx/{id}.gpx", 'r')

    gpx = gpxpy.parse(gpx_file)

    route_neighborhoods = []
    coarse_route_neighborhoods = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                p = Point(point.longitude, point.latitude)
                for (n_name, n_coarse_name), n_shape in NEIGHBORHOOD_POLYGONS.items():
                    # import pdb;pdb.set_trace()
                    if n_shape.contains(p):
                        route_neighborhoods.append(n_name)
                        coarse_route_neighborhoods.append(n_coarse_name)
    
    if len(route_neighborhoods) == 0:
        route_neighborhoods.append("non-Seattle")
        coarse_route_neighborhoods.append("non-Seattle")

    df.at[index, "start_neighborhood"] = route_neighborhoods[0]
    if row['type'] in ["Loop", "OB"]:
        df.at[index, "end_neighborhood"] = route_neighborhoods[0]
    elif row['type'] in ["P2P"]:
        df.at[index, "end_neighborhood"] = route_neighborhoods[-1]
    # hacky, to allow saving list as a csv column
    df.at[index, "neighborhoods"] = ";".join(list(set(route_neighborhoods)))
    df.at[index, "coarse_neighborhoods"] = ";".join(list(set(coarse_route_neighborhoods)))

    start = gpx.tracks[0].segments[0].points[0]
    start_point = Point(start.longitude, start.latitude)

    # for stop_name, stop_dict in STOPS.items():
    #     if near_enough(start_point, Point(stop_dict['lon'], stop_dict['lat'])):
    #         df.at[index, "transit"] = f"{stop_dict['system']} to {stop_name} stop"
    #         break

os.rename(ROUTES_CSV_FILE, ROUTES_CSV_FILE + "_old")
df.to_csv(ROUTES_CSV_FILE, index=False)

 