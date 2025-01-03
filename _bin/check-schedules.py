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

def check_schedule_dates_ordered(schedules):
    last_date = None
    previous_set = set()
    for path, schedule in schedules.items():
        # Quarter schedules can have multiple entries with the same date, but quarters should be disjoint
        schedule_date_set = set([entry['date'] for entry in schedule])
        if previous_set.intersection(schedule_date_set):
            warn_sc(path, "schedule contains date from previous schedule")
        previous_set = schedule_date_set
        for entry in schedule:
            date = entry['date']
            if last_date is not None and date < last_date:
                warn_sc(path, f"date '{date}' is not in chronological order")
            last_date = date


def main():
    routes = rcr.load_routes()
    route_ids = set([route['id'] for route in routes])
    schedules = rcr.load_schedules()
    for _, schedule in schedules.items():
        check_schedule(schedule, route_ids)

    check_schedule_dates_ordered(schedules)

    if warnings:
        exit(1)

if __name__ == '__main__':
    main()
