import re

import rcr
import yaml

warnings = False
def warn(msg):
    global warnings
    warnings = True
    print(f"WARNING! {msg}")

def warn_sc(path, msg):
    warn(f"schedule {path}: {msg}")

def check_schedule(schedule, route_ids):
    for entry in schedule:
        if 'plan' not in entry:
            warn_sc(entry, "missing plan")
            continue

        if re.match(r'\d{4}-\d{2}-\d{2}', entry['date']) is None:
            # Dates in ISO 8601 should be zero padded
            warn_sc(entry, "date must be in format 'YYYY-MM-DD'")

        for phase in entry['plan']:
          if 'route_id' in phase:
              if type(phase['route_id']) != str:
                  warn_sc(entry, "route_id must be a string")
                  continue

              if phase['route_id'] not in route_ids:
                  warn_sc(entry, f"unknown route_id '{phase['route_id']}'")

def main():
    routes = rcr.load_routes()
    route_ids = set([route['id'] for route in routes])
    for _, schedule in rcr.load_schedules().items():
        check_schedule(schedule, route_ids)

    if warnings:
        exit(1)

if __name__ == '__main__':
    main()
