import rcr
import gpxpy
import json
import os

class GPXParseError(Exception):
    pass

class GPXFormatError(Exception):
    pass

class RogueRouteError(Exception):
    pass

# expect either 1 track with 1 segment or 1 route
def gpx_latlons(path):
    try:
      with open(path, 'r') as f:
          gpx = gpxpy.parse(f)
    except Exception as e:
        raise GPXParseError(f"Could not parse '{path}'\n{e}")

    if len(gpx.tracks) == 1 and len(gpx.tracks[0].segments) == 1:
        return gpx.tracks[0].segments[0].points
    
    if len(gpx.routes) == 1:
        return gpx.routes[0].points
    
    raise GPXFormatError(f"Bogus number of tracks in:\n{path}")

# TODO
# <keywords>{route['type']}, {route['start']}, {route['end']}</keywords> (also do surface type)
def normalize_gpx(lls, path, route):
    hdr = f'''
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Race Condition Running">
  <metadata>
    <name>{route['id']}</name>
    <desc>{route['name']} ({route['dist']} mi)</desc>
    <link href="https://raceconditionrunning.com/routes/{route['id']}">
      <text>Race Condition Running: {route['name']}</text>
    </link>
    <author>
      <name>Race Condition Running</name>
      <link href="https://raceconditionrunning.com">
        <text>Race Condition Running</text>
      </link>
    </author>
  </metadata>
  <trk>
    <name>{route['id']}</name>
    <desc>{route['name']} ({route['dist']} mi)</desc>
    <trkseg>
'''.lstrip()

    with open(path, 'w') as f:
        f.write(hdr)
        for ll in lls:
            f.write(f'      <trkpt lat="{ll.latitude}" lon="{ll.longitude}"/>\n')
        f.write('    </trkseg>\n')
        f.write('  </trk>\n')
        f.write('</gpx>\n')

def route_geojson(lls, route):
    return {
        'type': 'Feature',
        'properties': {
            'id': route['id'],
            'name': route['name'],
            'start': route['start'],
            'dist': route['dist'],
            'up': route['up'],
            'down': route['down'],
            'end': route['end'],
            'type': route['type'],
            'surface': route['surface'],
            'map': route['map'],
            'deprecated': route['deprecated'] == 'true',
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': [[ll.longitude, ll.latitude] for ll in lls],
        },
    }

def main():
    seen = set()
    all_gjs = []

    routes = rcr.load_route_db()
    for route in routes:
        seen.add(route['id'])

        # get latitudes and longitudes from this route's gpx file then normalize it
        gpx_path = os.path.join(rcr.ROUTES_GPX, route['id']) + '.gpx'
        lls = gpx_latlons(gpx_path)
        normalize_gpx(lls, gpx_path, route)

        # generate geojson file, overwriting if it already exists
        gj_path = os.path.join(rcr.ROUTES_GEOJSON, route['id']) + '.geojson'
        gj = route_geojson(lls, route)
        with open(gj_path, 'w') as f:
            json.dump(gj, f, indent=2)
        all_gjs.append(gj)

    # generate a merged geojson of all routes
    all_gj_path = os.path.join(rcr.ROUTES_GEOJSON, 'routes.geojson')
    all_gj = {
        'type': 'FeatureCollection',
        'features': all_gjs,
    }
    with open(all_gj_path, 'w') as f:
        json.dump(all_gj, f, indent=2)

    # check to see if there are any extra gpx files
    for gpx_path in rcr.gpx_paths():
        id = os.path.basename(gpx_path).replace('.gpx', '')
        if id not in seen:
            raise RogueRouteError(f"Extra GPX file at '{gpx_path}'")

if __name__ == '__main__':
    main()
