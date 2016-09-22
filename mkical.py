import json
from icalendar import Calendar, Event
import datetime
import pytz
import math

with open('routedb.json') as f:
    routes = json.load(f)["routes"]

with open('sched.json') as f:
    sched = json.load(f)["sched"]

def lkup(uid):
    for r in routes:
        if r["uid"] == uid:
            return r

def main():
    cal = Calendar()

    for run in sched:
        date = datetime.datetime.strptime(run["date"], "%Y-%m-%d")
        for phase in run["plan"]:
            time = datetime.datetime.strptime(phase["time"], "%H:%M")
            route = lkup(phase["route"])
            name = route["name"].replace(":", "")
            gmap = route["map"]
            dist = route["dist"]

            start = datetime.datetime( date.year
                                     , date.month
                                     , date.day
                                     , time.hour
                                     , time.minute
                                     , 0
                                     , 0
                                     , tzinfo=pytz.timezone('America/Los_Angeles')
                                     )
            end = start + datetime.timedelta(0, 10 * 60 * round(dist))

            e = Event()
            e.add('summary', "%s (%s)" % (name, dist))
            e.add('dtstart', start)
            e.add('dtend', end)
            e.add('description', gmap)
            cal.add_component(e)

    with open('rcc.ics', 'w') as f:
        f.write(cal.to_ical())

main()
