#!/usr/bin/env python3
import copy

import yaml
from icalendar import Calendar, Event, vText, vDatetime, vUri
from datetime import datetime, timedelta
import pytz
from yaml import Loader

# TODO ical validator complains about this
# possibly due to method:publish ?
rivd = 'refresh-interval;value=duration'

calHeader = lambda name: \
    [ ('version'         , '2.0')
    , ('prodid'          , '-//Race Condition Running//NONSGML Race Condition Running//EN')
    , ('url'             , f'http://raceconditionrunning.com/{name}.ics')
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
        routes = yaml.load(f, Loader=Loader)

    with open('_data/schedule.yml') as f:
        sched = yaml.load(f, Loader=Loader)

    def lkup(uid):
      for r in routes:
        if r ['id'] == uid:
          return r

    def dtstart(date, time):
      time = datetime.strptime(time, '%H:%M')
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
    weekend_runs = []
    for run in sched:
        date = datetime.strptime(run['date'], '%Y-%m-%d')
        phases = run['plan']
        if 'cancelled' in run.keys():
            continue
        for i in range(len(phases)):
            phase = phases[i]
            if 'cancelled' in phase.keys():
                continue
            if 'route_id' in phase.keys():
              route = lkup(phase['route_id'])
            else:
              route = phase['route']

            name = route['name']
            gmap = route['map'] if 'map' in route else ''
            dist = route['dist'] if 'dist' in route else None

            event_name = f'{name} ({dist})' if dist else name

            start = dtstart(date, phase["time"])
            if i < len(phases) - 1:
                end = dtstart(date, phases[i + 1]["time"])
            else:
                delta = timedelta(0, 10 * 60 * round(dist if dist else 3))
                end = start + delta
            uid = str(start) + '@raceconditionrunning.com'
            uid = uid.strip(' :-,;')
            weekend_runs.append({ 'summary'     : event_name
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
                weekend_runs.append({ 'summary'     : 'Brunch'
                              , 'dtstart'     : bstart
                              , 'dtend'       : bend
                              , 'description' : 'Post-run brunch!'
                              , 'dtstamp'     : now
                              , 'uid'         : buid
                              })


    # add weekday runs
    weekday_runs = []
    def previous_tuesday(datetime_date):
        while datetime_date.weekday() != 1:
            datetime_date -= timedelta(1)
        return datetime_date

    def next_tuesday(datetime_date):
        while datetime_date.weekday() != 1:
            datetime_date += timedelta(1)
        return datetime_date

    first_run = min([datetime.strptime(r['date'], '%Y-%m-%d').date() for r in sched])
    start = min(previous_tuesday(datetime.today().date()),
                previous_tuesday(first_run))
    # Roughly memorial day to labor day
    summer_start_date = f"{first_run.year}-W22"
    summer_start_date = datetime.strptime(summer_start_date + '-1', "%Y-W%W-%w")
    summer_end_date = f"{first_run.year}-W36"
    summer_end_date = datetime.strptime(summer_end_date + '-1', "%Y-W%W-%w")
    next_summer_start_date = f"{first_run.year + 1}-W22"
    next_summer_start_date = datetime.strptime(next_summer_start_date + '-1', "%Y-W%W-%w")
    next_summer_end_date = f"{first_run.year + 1}-W36"
    next_summer_end_date = datetime.strptime(next_summer_end_date + '-1', "%Y-W%W-%w")
    block_dates = [summer_start_date, summer_end_date, next_summer_start_date, next_summer_end_date]
    block_is_summer = [True, False, True, False]
    for i, (block_start_date, is_summer) in enumerate(zip(block_dates, block_is_summer)):
        if start < block_start_date.date():
            end_date = block_start_date
            next_start = block_dates[i + 1]
            break

    if is_summer:
        first_block_start_time = "16:40"
        second_block_start_time = "17:25"
    else:
        first_block_start_time = "17:25"
        second_block_start_time = "16:40"


    short_run_block_template = {
        'summary'     : 'Short Run',
        'location'    : 'Meet outside CSE2',
        'description' : 'Usually 4 miles on Tuesday, 2 miles on Wednesday, and 6 miles on Thursday.',
        'dtstamp'     : now,
        'rrule'       : {'FREQ': 'WEEKLY', 'BYDAY': ['TU', 'WE', 'TH']},
    }

    first_block = copy.deepcopy(short_run_block_template)
    start = next_tuesday(dtstart(start, first_block_start_time))
    first_block['dtstart'] = start
    first_block['dtend'] = start + timedelta(0, 60 * 60)
    first_block['rrule']['UNTIL'] = end_date
    first_block['uid'] = 'shortruns_1@raceconditionrunning.com'
    weekday_runs.append(first_block)
    second_block = copy.deepcopy(short_run_block_template)
    start = next_tuesday(dtstart(end_date, second_block_start_time))
    second_block['dtstart'] = start
    second_block['dtend'] = start + timedelta(0, 60 * 60)
    second_block['rrule']['UNTIL'] = next_start
    second_block['uid'] = 'shortruns_2@raceconditionrunning.com'
    weekday_runs.append(second_block)

    def add_header_to_calendar(calendar, header):
        for (k, v) in header:
            if v.startswith('http'):
                calendar.add(k, vUri(v))
            else:
                calendar.add(k, vText(v))

    def add_runs_to_calendar(calendar, runs):
        for x in runs:
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
            calendar.add_component(e)

    full_calendar = Calendar()
    add_header_to_calendar(full_calendar, calHeader("rcc"))
    add_runs_to_calendar(full_calendar, weekday_runs)
    add_runs_to_calendar(full_calendar, weekend_runs)

    weekend_only_calendar = Calendar()
    add_header_to_calendar(weekend_only_calendar, calHeader("rcc_weekends"))
    add_runs_to_calendar(weekend_only_calendar, weekend_runs)

    with open('rcc.ics', 'wb') as f:
        f.write(full_calendar.to_ical())

    with open('rcc_weekends.ics', 'wb') as f:
        f.write(weekend_only_calendar.to_ical())


if __name__ == '__main__':
  main()
