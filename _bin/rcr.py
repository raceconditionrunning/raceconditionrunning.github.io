import os
import csv
import pathlib
from typing import List, Dict
import yaml

ROOT = pathlib.Path(os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

# key directories
DATA = ROOT / '_data'
SCHEDULES =  ROOT / '_data' / 'schedules'
ROUTES = ROOT / 'routes'
ROUTES_GPX =  ROUTES / 'gpx'
ROUTES_GEOJSON =  ROUTES / 'geojson'

for path in [ROOT, DATA, ROUTES , ROUTES_GPX]:
  if not os.path.isdir(path):
    print(f"Error: no such directory '{path}'")
    exit(1)

# key files
ROUTE_DB = os.path.join(ROUTES, 'routes.csv')
LOC_DB = os.path.join(ROUTES, 'locs.csv')

for path in [ROUTE_DB, LOC_DB]:
  if not os.path.isfile(path):
    print(f"Error: no such file '{path}'")
    exit(1)

def load_route_db():
    with open(ROUTE_DB, 'r') as f:
        reader = csv.DictReader(f, dialect='unix')
        return list(reader)

def load_loc_db():
   with open(LOC_DB, 'r') as f:
       reader = csv.DictReader(f, dialect='unix')
       return list(reader)

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

def load_schedules():
    schedules = {}
    for path in schedule_paths():
        with open(path, 'r') as f:
            schedules[path.stem] = yaml.safe_load(f)
    return schedules