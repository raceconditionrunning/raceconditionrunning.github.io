import json
import os
import pathlib
import re
from typing import List

import gpxpy
import yaml

from gis import calculate_bounding_box


class GPXParseError(Exception):
    pass

class GPXFormatError(Exception):
    pass

LOOP_ID_RE = re.compile(r'-loop(-\d\d)?$')
OB_ID_RE = re.compile(r'-ob?$')
LOOP_NAME_RE = re.compile(r' Loop( \d\d)?$')

ROOT = pathlib.Path(os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

# key directories
DATA = ROOT / '_data'
SCHEDULES =  ROOT / '_data' / 'schedules'
ROUTES = ROOT / 'routes'
# These are "raw" routes, not directly served on the site thanks to _ prefix
ROUTES_GPX =  ROUTES / '_gpx'
NEIGHBORHOOD_FILE = ROUTES / "neighborhoods.geojson"

for path in [ROOT, DATA, ROUTES , ROUTES_GPX]:
  if not os.path.isdir(path):
    print(f"Error: no such directory '{path}'")
    exit(1)

# key files
LOC_DB = os.path.join(ROUTES, 'locations.geojson')

for path in [LOC_DB]:
  if not os.path.isfile(path):
    print(f"Error: no such file '{path}'")
    exit(1)


def load_neighborhoods():
    polygons = {}
    with open(NEIGHBORHOOD_FILE) as f:
        gj = json.load(f)

    for n_obj in gj['features']:
        n_lname = n_obj["properties"]["L_HOOD"]
        n_sname = n_obj["properties"]["S_HOOD"]
        n_shape = n_obj["geometry"]["coordinates"]
        if n_obj["geometry"]["type"] == "Polygon":
            # Convert to simple MultiPolygon
            n_shape = [n_shape]
        bbox = calculate_bounding_box(n_shape)
        polygons[(n_sname, n_lname)] = (n_shape, bbox)
    return polygons


def load_route(path):
    with open(path, 'r') as f:
        try:
            with open(path, 'r') as f:
                reader = gpxpy.parse(f)
        except Exception as e:
            raise GPXParseError(f"Could not parse '{path}'\n{e}. Make sure rcr extension is specified.")

        # Recursively strip `{<extension_url}:` prefix from metadata keys. Nesting only used for changelog right now
        def strip_rcr_prefix(item_list):
            if len(item_list) == 0:
                return item_list.text
            return [(item.tag.split('}')[1], strip_rcr_prefix(item)) for item in item_list]
        metadata_entries = strip_rcr_prefix(reader.metadata_extensions)
        metadata = {}
        # Changelog will be multiset of ('change, <dict>) tuples
        for i, (key, value) in enumerate(metadata_entries):
            if key == 'changelog':
                changes = []
                for _, change in value:
                    changes.append(dict(change))
                metadata['changelog'] = changes
                # Sort by date
                metadata['changelog'].sort(key=lambda x: x['date'])
            else:
                metadata[key] = value

        track = None
        if len(reader.tracks) == 1 and len(reader.tracks[0].segments) == 1:
            track = reader.tracks[0]

        if len(reader.routes) == 1:
            track = reader.routes[0]

        if not track:
            raise GPXFormatError(f"Bogus number of tracks in:\n{path}")

        if not track.description:
            raise GPXFormatError(f"Track description (<desc>) is empty in:\n{path}")
        extracted_distance = None
        try:
            extracted_distance = float(track.description.split("(")[1].split("mi)")[0].strip())
        except (ValueError, IndexError):
            raise GPXFormatError(f"Could not extract distance from track description in:\n{path}. Should be in format 'Description (X mi)'")

        ascent = metadata.get('ascent', None)
        if ascent:
            ascent = float(ascent)
        descent = metadata.get('descent', None)
        if descent:
            descent = float(descent)
        type = None
        if OB_ID_RE.search(path.stem):
            type = "OB"
        elif LOOP_ID_RE.search(path.stem):
            type = "Loop"
        elif path.stem.startswith("p2p"):
            type = "P2P"
        route = {
            'id': path.stem,
            'name': metadata.get('name', track.description.split("(")[0].strip()),
            'last_updated': metadata.get('last_updated', None),
            'distance_mi': metadata.get('distance', extracted_distance),
            'ascent_m': ascent,
            'descent_m': descent,
            'map': metadata.get('map', None),
            'type': metadata.get('type', type),
            'surface': metadata.get('surface', None),
            'track': track.segments[0],
            'path': path,
            'start': metadata.get('start', None),
            'end': metadata.get('end', None),
            'deprecated': metadata.get('deprecated', None),
            'changelog': metadata.get('changelog', None),
            'notes': metadata.get('notes', None),
        }
        return route

def load_routes():
    # Open each GPX file, read metadata, and store in a dictionary
    routes = []
    for path in gpx_paths():
        routes.append(load_route(path))
    return routes

def load_loc_db():
    with open(LOC_DB, 'r') as f:
        locs = json.load(f)["features"]
        for loc in locs:
            loc["lat"] = loc["geometry"]["coordinates"][1]
            loc["lon"] = loc["geometry"]["coordinates"][0]
            del loc["geometry"]
            del loc["type"]
            for prop in loc["properties"]:
                loc[prop] = loc["properties"][prop]
            del loc["properties"]

    return locs

def save_loc_db(locs):
    with open(LOC_DB, 'w') as f:
        as_geojson = []
        for loc in locs:
            geometry = {
                "type": "Point",
                "coordinates": [loc["lon"], loc["lat"]]
            }
            properties = {prop: loc[prop] for prop in loc if prop not in ["lat", "lon", "type"]}
            as_geojson.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": properties
            })
        json.dump({"type": "FeatureCollection", "features": as_geojson}, f, indent=2)

def gpx_paths():
  paths = ROUTES_GPX.glob('*.gpx')
  return sorted(paths)

def schedule_paths() -> List[pathlib.Path]:
    season_order = {"winter": 1, "spring": 2, "summer": 3, "autumn": 4}
    def sort_key(path: pathlib.Path):
        year, season = path.stem.split("-")
        return (int(year), season_order[season])

    # Get all .yml files in the schedules directory in chronological order
    paths = SCHEDULES.glob("*.yml")
    return sorted(paths, key=sort_key)

def load_schedules() -> dict[str, dict]:
    schedules = {}
    for path in schedule_paths():
        with open(path, 'r') as f:
            schedules[path.stem] = yaml.safe_load(f)
    return schedules