import gpxpy
import rcr
import json
import csv

def is_point_in_polygon(x, y, geometry):
    inside = False

    for rings in geometry:
        polygon = rings[0]
        for i in range(1, len(polygon)):
            if ((polygon[i - 1][1] > y) != (polygon[i][1] > y)) and \
                    (x < (polygon[i][0] - polygon[i - 1][0]) * (y - polygon[i - 1][1]) / (polygon[i][1] - polygon[i - 1][1]) + polygon[i - 1][0]):
                inside = not inside
        if inside:
            return True
    return False

def is_point_in_bbox(x, y, bbox):
    return bbox[0] <= x <= bbox[1] and bbox[2] <= y <= bbox[3]

def calculate_bounding_box(geometry):

    # MultiPolygon: geometry is a list of polygons
    min_x = min(point[0] for polygon in geometry for point in polygon[0])
    max_x = max(point[0] for polygon in geometry for point in polygon[0])
    min_y = min(point[1] for polygon in geometry for point in polygon[0])
    max_y = max(point[1] for polygon in geometry for point in polygon[0])

    return min_x, max_x, min_y, max_y


ROUTES_LOCS_DIR = rcr.ROUTES

NEIGHBORHOOD_FILE = f"{ROUTES_LOCS_DIR}/seattle_transit_data/Neighborhood_Map_Atlas_Neighborhoods.geojson"
TRANSPORT_FILES = {
    "Light Rail": f"{ROUTES_LOCS_DIR}/seattle_transit_data/light_rail.csv",
    "Ferry": f"{ROUTES_LOCS_DIR}/seattle_transit_data/ferry.csv",
    "Bus": f"{ROUTES_LOCS_DIR}/seattle_transit_data/bus.csv",
}

STOPS = {}
for system_name, file_name in TRANSPORT_FILES.items():
    with open(file_name) as f:
        system = csv.DictReader(f, dialect='unix')
        for row in system:
            STOPS[row['stop_name']] = {
                'lat': row['stop_lat'],
                'lon': row['stop_lon'],
                'system': system_name,
            }

routes = rcr.load_route_db()

NEIGHBORHOOD_POLYGONS = {}
with open(NEIGHBORHOOD_FILE) as f:
    gj = json.load(f)

for n_obj in gj['features']:
    n_lname = n_obj["properties"]["L_HOOD"]
    n_sname = n_obj["properties"]["S_HOOD"]
    n_shape = n_obj["geometry"]["coordinates"]
    if n_obj["geometry"]["type"] == "Polygon":
        # Convert to simple MultiPolygon
        n_shape = [n_shape]
    bbox = calculate_bounding_box(n_shape)
    NEIGHBORHOOD_POLYGONS[(n_sname, n_lname)] = (n_shape, bbox)



for row in routes:
    print(f"Updating {row['id']}")
    id = row["id"]
    gpx_file = open(f"{ROUTES_LOCS_DIR}/gpx/{id}.gpx", 'r')

    gpx = gpxpy.parse(gpx_file)

    route_neighborhoods = []
    coarse_route_neighborhoods = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                for (n_name, n_coarse_name), (n_shape, bbox) in NEIGHBORHOOD_POLYGONS.items():
                    if is_point_in_bbox(point.longitude, point.latitude, bbox) and is_point_in_polygon(point.longitude, point.latitude, n_shape):
                        route_neighborhoods.append(n_name)
                        coarse_route_neighborhoods.append(n_coarse_name)

    if len(route_neighborhoods) == 0:
        route_neighborhoods.append("non-Seattle")
        coarse_route_neighborhoods.append("non-Seattle")

    row["start_neighborhood"] = route_neighborhoods[0]
    if row['type'] in ["Loop", "OB"]:
        row["end_neighborhood"] = route_neighborhoods[0]
    elif row['type'] in ["P2P"]:
        row["end_neighborhood"] = route_neighborhoods[-1]
    # hacky, to allow saving list as a csv column
    row["neighborhoods"] = ";".join(sorted(set(route_neighborhoods)))
    row["coarse_neighborhoods"] = ";".join(sorted(set(coarse_route_neighborhoods)))

with open(rcr.ROUTE_DB, "w") as f:
    writer = csv.DictWriter(f, routes[0].keys(), dialect='unix')
    writer.writeheader()
    writer.writerows(routes)
