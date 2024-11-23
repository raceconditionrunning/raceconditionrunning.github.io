from collections import defaultdict

import rcr
import csv
import json
import re
import os

FIELDS = [
    'id',
    'name',
    'start',
    'dist',
    'up',
    'down',
    'end',
    'type',
    'surface',
    'map',
    'dates_run',
    'deprecated',
    'neighborhoods',
    'coarse_neighborhoods',
    'start_neighborhood',
    'end_neighborhood',
]

TYPES = ['Loop', 'P2P', 'OB']
SURFACES = ['Road', 'Trail', 'Mixed']

# TODO make a similar loc-db.py script to check and normalize that table too
LOCS = [loc['id'] for loc in rcr.load_loc_db()]

# loop id and name conventions
LOOP_ID_RE = re.compile(r'-loop(-\d\d)?$')
LOOP_NAME_RE = re.compile(r' Loop( \d\d)?$')

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
        if field not in route:
            warn_rc(route, f"missing '{field}' field")
        # TODO: eventually down and surface should also be non-blank
        #elif field != 'deprecated' and route[field].strip() == '':
        elif field not in ['down', 'surface', 'deprecated', 'dates_run'] and route[field].strip() == '':
            warn_rc(route, f"blank '{field}' field")

    # valid type
    if route['type'] not in TYPES:
        warn_rc(route, f"invalid type '{route['type']}'")

    # TODO eventually all routes should have a valid surface
    # valid surface
    # if route['surface'] not in SURFACES:
    #     warn_rc(route, f"invalid surface '{route['surface']}'")

    # check id and name conventions for type
    if route['type'] == 'Loop':
        if not LOOP_ID_RE.search(route['id']):
            warn_rc(route, f"Loop route ids should end with '-loop' or '-loop-NN'")
        if not LOOP_NAME_RE.search(route['name']):
            warn_rc(route, f"Loop route name should end with ' Loop' or ' Loop NN'")
    if route['type'] == 'OB':
        if not route['id'].endswith('-ob'):
            warn_rc(route, f"OB route ids should end with '-ob'")
        if not route['name'].startswith('OB: '):
            warn_rc(route, f"OB route name should start with 'OB: '")

    # check start and end wrt to type
    if route['type'] in ['Loop', 'OB']:
        if route['start'] != route['end']:
            warn_rc(route, f"start and end must match for a {route['type']} route")
    if route['type'] == 'P2P':
        if route['start'] == route['end']:
            warn_rc(route, f"start and end must differ for P2P route")

    # valid start and end locations
    if route['start'] not in LOCS:
        warn_rc(route, f"invalid start '{route['start']}'")
    if route['end'] not in LOCS:
        warn_rc(route, f"invalid end '{route['end']}'")

    # valid dist, up, and down
    try:
        assert 0 < float(route['dist'])
    except:
        warn_rc(route, f"invalid distance '{route['dist']}'")
    try:
        assert 0 < float(route['up'])
    except:
        warn_rc(route, f"invalid elevation up '{route['up']}'")
    # TODO: eventually down should also be non-blank
    # try:
    #     assert 0 <= float(route['down'])
    # except:
    #     warn_rc(route, f"invalid elevation down '{route['down']}'")

    # valid deprecation
    if route['deprecated'].lower() in ['f', 'false']:
        route['deprecated'] = ''
    if route['deprecated'].lower() in ['t', 'true']:
        route['deprecated'] = 'true'
    if route['deprecated'] not in ['', 'true']:
        warn_rc(route, f"invalid deprecated status '{route['deprecated']}'")

    # every route has a gpx
    gpx_path = os.path.join(rcr.ROUTES_GPX, route['id']) + '.gpx'
    if not os.path.isfile(gpx_path):
        warn_rc(route, f"no GPX file at '{gpx_path}'")

def main():
    routes = rcr.load_route_db()
    schedules = rcr.load_schedules()

    dates_routes_run = defaultdict(list)
    for schedule in schedules.values():
        for entry in schedule:
            if not 'plan' in entry:
                continue
            for phase in entry['plan']:
                if 'route_id' in phase:
                    dates_routes_run[phase['route_id']].append(entry['date'])

    # ensure all route ids unique
    ids = set()
    for route in routes:
        if route['id'] in ids:
            warn(f"route {route['id']} is not unique")
        ids.add(route['id'])

    for route in routes:
        route['dates_run'] = dates_routes_run[route['id']]

    # check each route
    for route in routes:
        check_route(route)

    if warnings:
        print("Exiting due to warnings. Please fix and re-run.")
        exit(1)

    # sort routes by start and increasing distance
    routes.sort(key=lambda x: (x['start'].lower(), float(x['dist']), x['end'], x['type'], x['id']))

    # write sorted routes back
    with open(rcr.ROUTE_DB, 'w') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, dialect='unix')
        writer.writeheader()
        for route in routes:
            writer.writerow(route)

    # write yaml version
    yml_path = os.path.join(rcr.DATA, 'routes.yml')
    with open(yml_path, 'w') as f:
        f.write('# AUTOGENERATED - DO NOT EDIT\n\n')
        for route in routes:
            f.write(f"- id: {route['id']}\n")
            f.write(f"  name: \"{route['name']}\"\n")
            f.write(f"  start: \"{route['start']}\"\n")
            f.write(f"  dist: {route['dist']}\n")
            f.write(f"  up: {route['up']}\n")
            f.write(f"  down: {route['down']}\n")
            f.write(f"  end: \"{route['end']}\"\n")
            f.write(f"  type: \"{route['type']}\"\n")
            f.write(f"  surface: \"{route['surface']}\"\n")
            f.write(f"  map: \"{route['map']}\"\n")
            f.write(f"  dates_run: {route['dates_run']}\n")
            f.write(f"  gpx: \"/routes/gpx/{route['id']}.gpx\"\n")
            f.write(f"  geojson: \"/routes/geojson/{route['id']}.geojson\"\n")
            if route['deprecated']:
                f.write(f"  deprecated: true\n")
            f.write('\n')

    # write json version
    json_path = os.path.join(rcr.ROUTES, 'routes.json')
    with open(json_path, 'w') as f:
        json.dump(routes, f, indent=2)

if __name__ == '__main__':
    main()
