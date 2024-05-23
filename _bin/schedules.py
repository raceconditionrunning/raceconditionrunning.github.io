import csv
import yaml
import os
import sys

warnings = False
def warn(msg):
    global warnings
    warnings = True
    print(f"WARNING! {msg}")

def warn_sc(path, msg):
    warn(f"schedule {path}: {msg}")

def check_schedule(path, route_ids):
    # read schedule
    with open(path, 'r') as f:
        schedule = yaml.safe_load(f)

    for entry in schedule:
        if 'plan' not in entry:
            warn_sc(path, "missing plan")
            continue
        
        for phase in entry['plan']:
          # check route id valid if present
          if 'route_id' in phase:
              if type(phase['route_id']) != str:
                  warn_sc(path, "route_id must be a string")
                  continue

              if phase['route_id'] not in route_ids:
                  warn_sc(path, f"unknown route_id '{phase['route_id']}'")

def main():
    # get args
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <data_dir>")
        exit(1)

    data_dir = sys.argv[1]
    if not os.path.isdir(data_dir):
        print(f"Error: no such directory '{data_dir}'")
        exit(1)

    csv_path = os.path.join(data_dir, 'route-db.csv')
    if not os.path.isfile(csv_path):
        print(f"Error: no route-db.csv at '{csv_path}'")
        exit(1)

    schedules_dir = os.path.join(data_dir, 'schedules')
    if not os.path.isdir(schedules_dir):
        print(f"Error: no schedules directory at '{schedules_dir}'")
        exit(1)

    # read routes
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f, dialect='unix')
        routes = list(reader)

    # get set of route ids
    route_ids = set()
    for route in routes:
        route_ids.add(route['id'])

    # check schedules
    for quarter in sorted(os.listdir(schedules_dir)):
        if not quarter.endswith('.yml'):
            continue
        path = os.path.join(schedules_dir, quarter)
        check_schedule(path, route_ids)

    # TODO compute schedule stats (e.g., route frequency)

if __name__ == '__main__':
    main()
