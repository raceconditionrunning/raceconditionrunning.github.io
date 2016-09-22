import json
from icalendar import Calendar, Event, vText, vDatetime, vUri
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
    cal.add('prodid', vText('rcc.ics'))
    cal.add('version', vText('2.0'))
    cal.add('X-LIC-LOCATION', vText('America/Los_Angeles'))
    cal.add('X-WR-$CALNAME', vText('Race Condition Running'))
    cal.add('X-WR-TIMEZONE', vText('America/Los_Angeles'))

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
            e.add('summary', vText("%s (%s)" % (name, dist)))
            e.add('dtstart', vDatetime(start))
            e.add('dtend', vDatetime(end))
            e.add('description', vUri(gmap))
            cal.add_component(e)

    with open('rcc.ics', 'w') as f:
        f.write(cal.to_ical())

main()
