import csv
import os

FIELDS = ['id', 'name', 'dist', 'elev', 'start', 'end', 'type', 'map']
TYPES = ['Loop', 'P2P', 'OB']
LOCS = [
    'Beacon',
    'CapHill',
    'ColCity',
    'CSE',
    'GasWorks',
    'JaysCafe',
    'Locks',
    'MtBaker',
    'Northgate',
    'Roosevelt',
    'SODO',
    'Westlake'
]

# route-db.csv lives in the same directory as this script
data_dir = os.path.dirname(os.path.realpath(__file__))
csv_path = os.path.join(data_dir, 'route-db.csv')
gpx_dir = os.path.join(data_dir, 'gpx')

warnings = False
def warn(msg):
    global warnings
    warnings = True
    print(f"WARNING! {msg}")

def warn_rc(route, msg):
    warn(f"route {route['id']}: {msg}")

def check_route(route):
    # all fields set
    for field in FIELDS:
        if field not in route or route[field].strip() == '':
            warn_rc(route, f"missing '{field}' field")

    # valid type
    if route['type'] not in TYPES:
        warn_rc(route, f"invalid type '{route['type']}'")

    # valid start and end locations
    if route['start'] not in LOCS:
        warn_rc(route, f"invalid start '{route['start']}'")
    if route['end'] not in LOCS:
        warn_rc(route, f"invalid end '{route['end']}'")

    # valid dist and elev
    try:
        assert 0 < float(route['dist'])
    except:
        warn_rc(route, f"invalid dist '{route['dist']}'")
    try:
        assert 0 < float(route['elev'])
    except:
        warn_rc(route, f"invalid elev '{route['elev']}'")

    # every route has a gpx
    gpx_path = os.path.join(gpx_dir, route['id']) + '.gpx'
    if not os.path.isfile(gpx_path):
        warn_rc(route, f"no GPX file at '{gpx_path}'")

# MAIN

# read routes
with open(csv_path, 'r') as f:
    reader = csv.DictReader(f)
    routes = list(reader)

# ensure all route ids unique
ids = set()
for route in routes:
    if route['id'] in ids:
        warn(f"route {route['id']} is not unique")
    ids.add(route['id'])

# check every route
for route in routes:
    check_route(route)

# bail if any warnings
if warnings:
    exit(1)

# sort routes by start and increasing distance
routes.sort(key=lambda x: (x['start'], float(x['dist']), x['end'], x['type'], x['id']))

# write sorted routes back
with open(csv_path, 'w') as f:
    writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
    writer.writeheader()
    for route in routes:
        writer.writerow(route)
