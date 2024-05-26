import rcr
import gpxpy
import os

class MissingRouteError(Exception):
    pass

class GPXParseError(Exception):
    pass

class GPXFormatError(Exception):
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
# <link href="https://raceconditionrunning.com/routes?id={route['id']}">
#   <text>Race Condition Running: {route['name']}</text>
# </link>
def normalize_gpx(lls, path, route):
    hdr = f'''
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Race Condition Running">
  <metadata>
    <name>{route['id']}</name>
    <desc>{route['name']} ({route['dist']} mi)</desc>
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
    
def main():
    routes = rcr.load_route_db()

    def lkup(id):
        for route in routes:
            if route['id'] == id:
                return route
        raise MissingRouteError(f"Could not find route '{id}'")

    for gpx_path in rcr.gpx_paths():
        id = os.path.basename(gpx_path).replace('.gpx', '')
        route = lkup(id)
        lls = gpx_latlons(gpx_path)
        normalize_gpx(lls, gpx_path, route)

if __name__ == '__main__':
    main()