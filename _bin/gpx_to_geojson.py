import json
import pathlib
import sys
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
    if len(sys.argv) == 2:
        input_files = [sys.argv[1]]
        output_files = [sys.argv[1]]
    elif len(sys.argv) < 3 or len(sys.argv) % 2 != 1:
        raise ValueError("Usage: gpx_to_geojson.py <input> <output> ...")
    else:
        input_files = sys.argv[1:][::2]
        output_files = sys.argv[2:][::2]
    for inpath, outpath in zip(input_files, output_files):
        route = rcr.load_route(pathlib.Path(inpath))
        with open(outpath, 'w') as f:
            dump_geojson_with_compact_geometry(route_geojson(route), f)


if __name__ == '__main__':
    main()
