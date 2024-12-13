import gis
import rcr
import json


class RogueRouteError(Exception):
    pass


# TODO
# <keywords>{route['type']}, {route['start']}, {route['end']}</keywords> (also do surface type)
def normalize_gpx(lls, path, route):
    extensions = [
        f"<rcr:ascent>{round(route['ascent_m'])}</rcr:ascent>" if route['ascent_m'] else '',
        f"<rcr:descent>{round(route['descent_m'])}</rcr:descent>" if route['descent_m'] else '',
        f"<rcr:surface>{route['surface']}</rcr:surface>" if route['surface'] else '',
        f"<rcr:start>{route['start']}</rcr:start>" if 'start' in route and route.get('start', None) else '',
        f"<rcr:end>{route['end']}</rcr:end>" if 'end' in route and route.get("end", None) else '',
        f'<rcr:deprecated>true</rcr:deprecated>' if 'deprecated' in route and route.get('deprecated', None) == 'true' else '',
        f'<rcr:map>{route["map"]}</rcr:map>' if 'map' in route and route['map'] else '',
    ]
    extensions = '\n'.join([f'      {ext}' for ext in extensions if ext])
    hdr = f'''
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Race Condition Running" xmlns:rcr="http://raceconditionrunning.com/extensions">
  <metadata>
    <name>{route['id']}</name>
    <desc>{route['name']} ({route['distance_mi']:.1f} mi)</desc>
    <link href="https://raceconditionrunning.com/routes/{route['id']}">
      <text>Race Condition Running: {route['name']}</text>
    </link>
    <author>
      <name>Race Condition Running</name>
      <link href="https://raceconditionrunning.com">
        <text>Race Condition Running</text>
      </link>
    </author>
    <extensions>
{ extensions }
    </extensions>
  </metadata>
  <trk>
    <name>{route['id']}</name>
    <desc>{route['name']} ({route['distance_mi']:.1f} mi)</desc>
    <trkseg>
'''.lstrip()

    with open(path, 'w') as f:
        f.write(hdr)
        for ll in lls:
            if ll.elevation:
                f.write(f'      <trkpt lat="{ll.latitude}" lon="{ll.longitude}">')
                # Round elevation to 2 decimal places
                f.write(f'<ele>{ll.elevation:.2f}</ele>')
                f.write('</trkpt>\n')
            else:
                f.write(f'      <trkpt lat="{ll.latitude}" lon="{ll.longitude}"/>\n')
        f.write('    </trkseg>\n')
        f.write('  </trk>\n')
        f.write('</gpx>\n')

def route_geojson(route):
    def point_to_list(point):
        if point.elevation:
            return [point.longitude, point.latitude, point.elevation]
        return [point.longitude, point.latitude]
    return {
        'type': 'Feature',
        'properties': {
            'id': route['id'],
            'name': route['name'],
            'start': route.get('start', None),
            'distance_mi': route['distance_mi'],
            'ascent_m': route['ascent_m'],
            'descent_m': route['descent_m'],
            'end': route.get('end', None),
            'surface': route['surface'],
            'map': route['map'],
            'deprecated': route.get("deprecated") == True,
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': [point_to_list(ll) for ll in route['track'].points],
        },
    }


def main():
    seen = set()
    all_gjs = []
    routes = rcr.load_routes()
    locs = rcr.load_loc_db()
    for route in routes:
        seen.add(route['id'])

        if route['path'].name != f"{route['id']}.gpx":
            raise RogueRouteError(f"Route path mismatch: {route['path']} vs {route['id']}.gpx")

        normalize_gpx(route["track"].points, route['path'], route)

        computed = gis.compute_route_metrics(route["track"])
        if route['distance_mi'] and abs(computed['distance_mi'] - float(route['distance_mi'])) > 0.1:
            print(f"WARNING! {route['id']} distance mismatch: {computed['distance_mi']:.1f} vs {route['distance_mi']:.1f}")
        if route["ascent_m"] and abs(computed['ascent_m'] - float(route['ascent_m'])) > 30:
            print(f"WARNING! {route['id']} ascent mismatch: {computed['ascent_m']:.0f} vs {route['ascent_m']:.0f}")
        if route["descent_m"] and abs(computed['descent_m'] - float(route['descent_m'])) > 30:
            print(f"WARNING! {route['id']} descent mismatch: {computed['descent_m']:.0f} vs {route['descent_m']:.0f}")


        lls = route["track"].points
        computed_start = gis.get_nearest_loc(locs, lls[0].latitude, lls[0].longitude)
        computed_end = gis.get_nearest_loc(locs, lls[-1].latitude, lls[-1].longitude)
        if computed_start[1] > 0.15:
            print(f"WARNING! {route['id']} distant from start loc: {computed_start[1]:.2f}")
        if computed_end[1] > 0.15:
            print(f"WARNING! {route['id']} distant from end loc: {computed_end[1]:.2f}")
        if route.get("start", None) and route["start"] != computed_start[0]:
            print(f"WARNING! {route['id']} start mismatch: {route['start']} vs {computed_start[0]}")
        if route.get("end", None) and route["end"] != computed_end[0]:
            print(f"WARNING! {route['id']} end mismatch: {route['end']} vs {computed_end[0]}")
        route["start"] = route["start"] if route["start"] else computed_start[0]
        route["end"] = route["end"] if route["end"] else computed_end[0]
        # generate geojson file, overwriting if it already exists
        gj_path = os.path.join(rcr.ROUTES_GEOJSON, route['id']) + '.geojson'
        gj = route_geojson(route)
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



if __name__ == '__main__':
    main()
