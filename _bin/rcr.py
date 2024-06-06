import os
import csv

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), '..'))

# key directories
DATA = os.path.join(ROOT, '_data')
SCHEDULES = os.path.join(ROOT, '_data', 'schedules')
ROUTES = os.path.join(ROOT, 'routes')
ROUTES_GPX = os.path.join(ROUTES, 'gpx')
ROUTES_GEOJSON = os.path.join(ROUTES, 'geojson')
LOCS = os.path.join(ROOT, 'locs')

for path in [ROOT, DATA, ROUTES, ROUTES_GPX]:
  if not os.path.isdir(path):
    print(f"Error: no such directory '{path}'")
    exit(1)

# key files
ROUTE_DB = os.path.join(ROOT, 'routes', 'db.csv')
LOC_DB = os.path.join(ROOT, 'locs', 'db.csv')

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
  paths = []
  for gpx in os.listdir(ROUTES_GPX):
    if gpx.endswith('.gpx'):
      path = os.path.join(ROUTES_GPX, gpx)
      paths.append(path)
  return sorted(paths)

def schedule_paths():
  paths = []
  for quarter in os.listdir(SCHEDULES):
      if quarter.endswith('.yml'):
          path = os.path.join(SCHEDULES, quarter)
          paths.append(path)
  return sorted(paths)
