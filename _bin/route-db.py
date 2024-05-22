import csv
import os
import sys

FIELDS = ['id', 'name', 'start', 'dist', 'elev', 'end', 'type', 'map', 'deprecated']
TYPES = ['Loop', 'P2P', 'OB']
LOCS = [
    'Alki',
    'Beacon',
    'BellDtwn',
    'CapHill',
    'CID',
    'ColCity',
    'ColmanPark',
    'CSE',
    'GasWorks',
    'GreenLake',
    'JaysCafe',
    'Locks',
    'Magnuson',
    'Marymoor',
    'MerSlough',
    'Miller',
    'MtBaker',
    'Northgate',
    'PacPav',
    'RedTech',
    'Roosevelt',
    'Seward',
    'SoBell',
    'SoDisco',
    'SODO',
    'WashPark',
    'Westlake',
    'WoodCafe'
]

warnings = False
def warn(msg):
    global warnings
    warnings = True
    print(f"WARNING! {msg}")

def warn_rc(route, msg):
    warn(f"route {route['id']}: {msg}")

def check_route(route, gpx_dir):
    # all fields set
    for field in FIELDS:
        if field not in route:
            warn_rc(route, f"missing '{field}' field")
        elif field != 'deprecated' and route[field].strip() == '':
            warn_rc(route, f"blank '{field}' field")

    # valid type
    if route['type'] not in TYPES:
        warn_rc(route, f"invalid type '{route['type']}'")

    # sanity start and end wrt to type
    if route['type'] in ['Loop', 'OB']:
        if route['start'] != route['end']:
            warn_rc(route, f"start and end must match for {route['type']} type")
    if route['type'] == 'P2P':
        if route['start'] == route['end']:
            warn_rc(route, f"start and end must differ for P2P type")

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

    # valid deprecation
    if route['deprecated'] not in ['', 'T']:
        warn_rc(route, f"invalid deprecated status '{route['deprecated']}'")

    # every route has a gpx
    gpx_path = os.path.join(gpx_dir, route['id']) + '.gpx'
    if not os.path.isfile(gpx_path):
        warn_rc(route, f"no GPX file at '{gpx_path}'")

def main():
    # get args
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <data_dir>")
        exit(1)

    data_dir = sys.argv[1]
    if not os.path.isdir(data_dir):
        print(f"Error: no such directory '{data_dir}'")
        exit(1)

    csv_path = os.path.join(data_dir, 'route-db.csv')
    if not os.path.isfile(csv_path):
        print(f"Error: no route-db.csv at '{csv_path}'")
        exit(1)

    gpx_dir = os.path.join(data_dir, 'gpx')
    if not os.path.isdir(gpx_dir):
        print(f"Error: no gpx directory at '{gpx_dir}'")
        exit(1)

    # read routes
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f, dialect='unix')
        routes = list(reader)

    # ensure all route ids unique
    ids = set()
    for route in routes:
        if route['id'] in ids:
            warn(f"route {route['id']} is not unique")
        ids.add(route['id'])

    # check every route
    for route in routes:
        check_route(route, gpx_dir)

    # bail if any warnings
    if warnings:
        print("Exiting due to warnings - please fix and re-run.")
        exit(1)

    # sort routes by start and increasing distance
    routes.sort(key=lambda x: (x['start'].lower(), float(x['dist']), x['end'], x['type'], x['id']))

    # write sorted routes back
    with open(csv_path, 'w') as f:
        writer = csv.DictWriter(f, fieldnames=reader.fieldnames, dialect='unix')
        writer.writeheader()
        for route in routes:
            writer.writerow(route)

    # output yaml version as well
    yml_path = os.path.join(data_dir, 'route-db.yml')
    with open(yml_path, 'w') as f:
        f.write('# AUTOGENERATED - DO NOT EDIT\n\n')
        for route in routes:
            f.write(f"- id: {route['id']}\n")
            f.write(f"  name: \"{route['name']}\"\n")
            f.write(f"  start: \"{route['start']}\"\n")
            f.write(f"  dist: {route['dist']}\n")
            f.write(f"  elev: {route['elev']}\n")
            f.write(f"  end: \"{route['end']}\"\n")
            f.write(f"  type: \"{route['type']}\"\n")
            f.write(f"  map: \"{route['map']}\"\n")
            f.write('\n')

if __name__ == '__main__':
    main()
