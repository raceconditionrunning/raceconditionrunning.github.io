import json
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
    with open('routedb.json') as f:
        routes = json.load(f)['routes']

    with open('sched.json') as f:
        sched = json.load(f)['sched']

    def lkup(uid):
        for r in routes:
            if r['uid'] == uid:
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
            route = lkup(phase['route'])
            name = route['name']
            gmap = route['map']
            dist = route['dist']

            start = dtstart(date, phase)
            if i < len(phases) - 1:
                end = dtstart(date, phases[i + 1])
            else:
                end = start + timedelta(0, 10 * 60 * round(dist))
            uid = str(start) + '@raceconditionrunning.com'
            uid = uid.translate(None, ' :-,;')
            things.append({ 'summary'     : '%s (%s)' % (name, dist)
                          , 'dtstart'     : start
                          , 'dtend'       : end
                          , 'description' : gmap
                          , 'dtstamp'     : now
                          , 'uid'         : uid
                          })

            # add brunch after other phases
            if i == len(phases) - 1:
                bstart = end
                bend = bstart + timedelta(0, 90 * 60)
                buid = str(bstart) + '@raceconditionrunning.com'
                buid = buid.translate(None, ' :-,;')
                things.append({ 'summary'     : 'Brunch'
                              , 'dtstart'     : bstart
                              , 'dtend'       : bend
                              , 'description' : 'Post-run brunch!'
                              , 'dtstamp'     : now
                              , 'uid'         : buid
                              })

    # add wednesday runs
    d0 = datetime.strptime(sched[0]['date'], '%Y-%m-%d')
    d1 = datetime.strptime(sched[-1]['date'], '%Y-%m-%d')
    delta = d1 - d0
    for i in range(delta.days):
        d = d0 + timedelta(days=i)
        if d.weekday() == 2:
            start = dtstart(d, {'time' : '5:30'})
            end = start + timedelta(0, 60 * 60)
            uid = str(start) + '@raceconditionrunning.com'
            uid = uid.translate(None, ' :-,;')
            things.append({ 'summary'     : 'Burke Run'
                          , 'dtstart'     : start
                          , 'dtend'       : end
                          , 'description' : 'Meet in CSE Atrium'
                          , 'dtstamp'     : now
                          , 'uid'         : uid
                          })

    cal = Calendar()
    for (k, v) in calHeader:
        if v.startswith('http'):
            cal.add(k, vUri(v))
        else:
            cal.add(k, vText(v))

    for x in things:
        e = Event()
        for k, v in x.iteritems():
            if isinstance(v, datetime):
                e.add(k, vDatetime(v))
            elif v.startswith('http'):
                e.add(k, vUri(v))
            else:
                e.add(k, vText(v))
        cal.add_component(e)

    with open('rcc.ics', 'w') as f:
        f.write(cal.to_ical())

main()
