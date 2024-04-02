import csv
import os

FIELDS = ['id', 'name', 'dist', 'elev', 'start', 'end', 'type', 'map']
TYPES = ['Loop', 'P2P', 'OB']

# route-db.csv lives in the same directory as this script
data_dir = os.path.dirname(os.path.realpath(__file__))
csv_path = os.path.join(data_dir, 'route-db.csv')
gpx_dir = os.path.join(data_dir, 'gpx')

# read routes
with open(csv_path, 'r') as f:
    reader = csv.DictReader(f)
    routes = list(reader)

# ensure all fields set for all routes
for route in routes:
    for field in FIELDS:
        if field not in route:
            print(f"WARNING: route {route['id']} has no field {field}")
    if route['type'] not in TYPES:
        print(f"WARNING: route {route['id']} has invalid type {route['type']}")

# ensure every route has a gpx
for route in routes:
    gpx_path = os.path.join(gpx_dir, route['id']) + '.gpx'
    if not os.path.isfile(gpx_path):
        print(f"WARNING: route {route['id']} has no GPX file at {gpx_path}")

# sort routes
routes.sort(key=lambda x: (x['start'], x['dist'], x['end'], x['type'], x['id']))

# write sorted routes back
with open(csv_path, 'w') as f:
    writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
    writer.writeheader()
    for route in routes:
        writer.writerow(route)
