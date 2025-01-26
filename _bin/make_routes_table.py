import pathlib
import sys
from collections import defaultdict

import gis
import rcr
import re
import os

FIELDS = [
    'id',
    'name',
    'start',
    'distance_mi',
    'ascent_m',
    'descent_m',
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
        elif field not in ['map', 'surface', 'deprecated', 'dates_run'] and not route[field]:
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
        assert 0 < float(route['distance_mi'])
    except:
        warn_rc(route, f"invalid distance '{route['distance_mi']}'")
    try:
        assert 0 < float(route['ascent_m'])
    except:
        warn_rc(route, f"invalid elevation up '{route['ascent_m']}'")

    try:
         assert 0 <= float(route['descent_m'])
    except:
        warn_rc(route, f"invalid elevation down '{route['descent_m']}'")

    # every route has a gpx
    gpx_path = os.path.join(rcr.ROUTES_GPX, route['id']) + '.gpx'
    if not os.path.isfile(gpx_path):
        warn_rc(route, f"no GPX file at '{gpx_path}'")


def main():
    route_path = sys.argv[1:-1]
    if len (route_path) == 0:
        print("Usage: make_routes_table.py <route.gpx> ... <output.yml>")
        exit(1)
    elif len(route_path) == 1 and os.path.isdir(route_path[0]):
        route_path = [f for f in pathlib.Path(route_path[0]).glob("*.gpx")]
    outpath = sys.argv[-1]
    if not outpath.endswith('.yml'):
        print("Output file must be a .yml file")
        exit(1)
    routes = [rcr.load_route(pathlib.Path(path)) for path in route_path]
    schedules = rcr.load_schedules()
    locations = rcr.load_loc_db()
    neighborhood_polygons = rcr.load_neighborhoods()
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
        print(f"Processing route {route['id']}")
        route['dates_run'] = dates_routes_run[route['id']]

        # Compute route metrics and fill any blanks
        # This script won't warn you about sketchy results (e.g. manual distances/elevations that are way off the computed values)
        computed = gis.compute_route_metrics(route['track'])
        if 'distance_mi' not in route or not route['distance_mi']:
            route['distance_mi'] = computed['distance_mi']
        if not route['ascent_m']:
            route['ascent_m'] = computed['ascent_m']
        if not route['descent_m']:
            route['descent_m'] = computed['descent_m']
        if not route['type']:
            route['type'] = computed['type']
        if not route['start']:
            nearest_start, start_dist = gis.get_nearest_loc(locations, route['track'].points[0].latitude, route['track'].points[0].longitude)
            route['start'] = nearest_start
        if not route['end']:
            nearest_end, end_dist = computed['end'] = gis.get_nearest_loc(locations, route['track'].points[-1].latitude, route['track'].points[-1].longitude)
            route['end'] = nearest_end

        # Compute route neighborhoods
        route_neighborhoods = []
        coarse_route_neighborhoods = []
        for point in route['track'].points:
            for (n_name, n_coarse_name), (n_shape, bbox) in neighborhood_polygons.items():
                if gis.is_point_in_bbox(point.longitude, point.latitude, bbox) and gis.is_point_in_polygon(
                    point.longitude, point.latitude, n_shape):
                    route_neighborhoods.append(n_name)
                    coarse_route_neighborhoods.append(n_coarse_name)

            if len(route_neighborhoods) == 0:
                route_neighborhoods.append("non-Seattle")
                coarse_route_neighborhoods.append("non-Seattle")

            route["start_neighborhood"] = route_neighborhoods[0]
            route["end_neighborhood"] = route_neighborhoods[-1]
            route["neighborhoods"] = list(sorted(set(route_neighborhoods)))
            route["coarse_neighborhoods"] = list(sorted(set(coarse_route_neighborhoods)))

    # check each route
    for route in routes:
        check_route(route)

    if warnings:
        print("Exiting due to warnings. Please fix and re-run.")
        exit(1)

    # sort routes by start and increasing distance
    routes.sort(key=lambda x: (x['start'].lower(), float(x['distance_mi']), x['end'], x['type'], x['id']))

    # write yaml version
    with open(outpath, 'w') as f:
        # yaml.dump reorders the keys and doesn't put whitespace between routes
        f.write('# AUTOGENERATED - DO NOT EDIT\n\n')
        for route in routes:
            f.write(f"- id: {route['id']}\n")
            f.write(f"  name: \"{route['name']}\"\n")
            f.write(f"  start: \"{route['start']}\"\n")
            if route['last_updated']:
                f.write(f"  last_updated: \"{route['last_updated']}\"\n")
            else:
                f.write(f"  last_updated: null\n")
            f.write(f"  distance_mi: {route['distance_mi']:.1f}\n")
            f.write(f"  ascent_m: {route['ascent_m']:.2f}\n")
            f.write(f"  descent_m: {route['descent_m']:.2f}\n")
            f.write(f"  end: \"{route['end']}\"\n")
            f.write(f"  type: \"{route['type']}\"\n")
            if route['surface']:
                f.write(f"  surface: \"{route['surface']}\"\n")
            else:
                f.write(f"  surface: null\n")
            if route['map']:
                f.write(f"  map: \"{route['map']}\"\n")
            else:
                f.write(f"  map: null\n")
            f.write(f"  dates_run: {route['dates_run']}\n")
            f.write(f"  start_neighborhood: \"{route['start_neighborhood']}\"\n")
            f.write(f"  end_neighborhood: \"{route['end_neighborhood']}\"\n")
            f.write(f"  neighborhoods: {route['neighborhoods']}\n")
            f.write(f"  coarse_neighborhoods: {route['coarse_neighborhoods']}\n")
            if route['notes']:
                f.write(f"  notes: \"{route['notes']}\"\n")
            else:
                f.write(f"  notes: null\n")
            if route['changelog']:
                f.write(f"  changelog:\n")
                for entry in route['changelog']:
                    f.write(f"    - date: {entry['date']}\n")
                    f.write(f"      note: {entry['note']}\n")
            else:
                f.write(f"  changelog: []\n")
            if route['deprecated']:
                f.write(f"  deprecated: true\n")
            f.write(f"  gpx: \"/routes/gpx/{route['id']}.gpx\"\n")
            f.write(f"  geojson: \"/routes/geojson/{route['id']}.geojson\"\n")
            f.write('\n')


if __name__ == '__main__':
    main()
