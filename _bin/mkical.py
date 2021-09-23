#!/usr/bin/env python3

import yaml
from icalendar import Calendar, Event, vText, vDatetime, vUri
from datetime import datetime, timedelta
import pytz


# TODO ical validator complains about this
# possibly due to method:publish ?
rivd = 'refresh-interval;value=duration'

calHeader = \
    [ ('version'         , '2.0')
    , ('prodid'          , '-//Race Condition Running//NONSGML Race Condition Running//EN')
    , ('url'             , 'http://raceconditionrunning.com/rcc.ics')
    , ('name'            , 'Race Condition Running')
    , ('x-wr-calname'    , 'Race Condition Running')
    , ('description'     , 'Race Condition Running')
    , ('x-wr-caldesc'    , 'Race Condition Running')
    , ('timezone-id'     , 'America/Los_Angeles')
    , ('x-wr-timezone'   , 'America/Los_Angeles')
    , (rivd              , 'PT12H')
    , ('x-published-ttl' , 'PT12H')
    , ('calscale'        , 'GREGORIAN')
    , ('method'          , 'PUBLISH')
    ]


def main():
    with open('_data/routes.yml') as f:
        routes = yaml.load(f)

    with open('_data/schedule.yml') as f:
        sched = yaml.load(f)

    def lkup(uid):
      for r in routes:
        if r ['id'] == uid:
          return r

    def dtstart(date, phase):
      time = datetime.strptime(phase['time'], '%H:%M')
      return datetime( date.year
                     , date.month
                     , date.day
                     , time.hour
                     , time.minute
                     , 0
                     , 0
                     , tzinfo=pytz.timezone('America/Los_Angeles')
                     )

    # ics timestamps must be utc
    now = datetime.now(pytz.utc)

    # NOTE: assumes events back-to-back on single day
    things = []
    for run in sched:
        date = datetime.strptime(run['date'], '%Y-%m-%d')
        phases = run['plan']
        for i in range(len(phases)):
            phase = phases[i]

            if 'route_id' in phase.keys():
              route = lkup(phase['route_id'])
            else:
              route = phase['route']

            name = route['name']
            gmap = route['map'] if 'map' in route else ''
            dist = route['dist'] if 'dist' in route else None

            event_name = f'{name} ({dist})' if dist else name

            start = dtstart(date, phase)
            if i < len(phases) - 1:
                end = dtstart(date, phases[i + 1])
            else:
                delta = timedelta(0, 10 * 60 * round(dist if dist else 3))
                end = start + delta
            uid = str(start) + '@raceconditionrunning.com'
            uid = uid.strip(' :-,;')
            things.append({ 'summary'     : event_name
                          , 'dtstart'     : start
                          , 'dtend'       : end
                          , 'description' : gmap
                          , 'dtstamp'     : now
                          , 'uid'         : uid
                          })

            # add brunch after other phases
            if i == len(phases) - 1 and dist > 0:
                bstart = end
                bend = bstart + timedelta(0, 90 * 60)
                buid = str(bstart) + '@raceconditionrunning.com'
                buid = buid.strip(' :-,;')
                things.append({ 'summary'     : 'Brunch'
                              , 'dtstart'     : bstart
                              , 'dtend'       : bend
                              , 'description' : 'Post-run brunch!'
                              , 'dtstamp'     : now
                              , 'uid'         : buid
                              })

    # add Tuesday and Thursday runs
    start = dtstart(datetime.strptime("2015-01-06", '%Y-%m-%d'),
                    {'time' : '16:40'})
    end = start + timedelta(0, 60 * 60)
    uid = 'shortruns@raceconditionrunning.com'
    things.append({
        'summary'     : 'Short Run',
        'dtstart'     : start,
        'dtend'       : end,
        'location'    : 'Meet in CSE1 atrium',
        'description' : 'Usually 4 miles on Tuesday, 2 miles on Wednesday, and 6 miles on Thursday.',
        'dtstamp'     : now,
        'uid'         : uid,
        'rrule'       : {'FREQ': 'WEEKLY', 'BYDAY': ['TU', 'WE', 'TH']}
    })

    cal = Calendar()
    for (k, v) in calHeader:
        if v.startswith('http'):
            cal.add(k, vUri(v))
        else:
            cal.add(k, vText(v))

    for x in things:
        e = Event()
        for k, v in x.items():
            if isinstance(v, datetime):
                e.add(k, vDatetime(v))
            elif isinstance(v, str) and v.startswith('http'):
                e.add(k, vUri(v))
            elif k.lower() == 'rrule': # XXX: ugly hack
                e.add(k, v)
            else:
                e.add(k, vText(v))
        cal.add_component(e)

    with open('rcc.ics', 'wb') as f:
        f.write(cal.to_ical())


if __name__ == '__main__':
  main()
