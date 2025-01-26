import argparse
import json
import pathlib
import rcr

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
            'last_updated': route.get('last_updated', None),
            'changelog': route.get('changelog', None),
            'notes': route.get('notes', None),
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': [point_to_list(ll) for ll in route['track'].points],
        },
    }

# Whitespace characters end up being around half the file size if we do normal indentation for coordinates arrays
def dump_geojson_with_compact_geometry(geojson, f):
    # Create a copy of the feature without the geometry
    feature_copy = geojson.copy()
    geometry = feature_copy.pop('geometry')

    # Dump the feature without geometry
    f.write(json.dumps(feature_copy, indent=2)[:-2])  # Remove the closing `}` of the feature

    # Add the compact geometry inside the feature
    compact_geometry = json.dumps(geometry, separators=(',', ':'))
    f.write(f', "geometry":{compact_geometry}\n}}')


def main():
    parser = argparse.ArgumentParser(description="Convert RCR Route GPX to GeoJSON.")
    parser.add_argument("--input", required=True, nargs="+", help="Input GPX file(s).")
    parser.add_argument("--output", required=True, nargs="+", help="Output GPX file(s).")
    args = parser.parse_args()

    if len(args.input) != len(args.output):
        raise ValueError("The number of inputs must match the number of outputs.")

    for inpath, outpath in zip(args.input, args.output):
        route = rcr.load_route(pathlib.Path(inpath))
        with open(outpath, 'w') as f:
            dump_geojson_with_compact_geometry(route_geojson(route), f)


if __name__ == '__main__':
    main()
