# Race Condition Running

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

Routes are in `routedb.json` and the current schedule is in `sched.json`.
Most of the site content and iCal are generated from these files.

To test locally, you can start a small Python webserver for this directory:
```
  $ python test-server.py
```
After which the page will be available at [http://localhost:8000](http://localhost:8000).

If you change the schedule, please update the iCal before pushing:
```
  $ python mkical.py
```
Note that this requires the [icalendar](http://icalendar.readthedocs.io/en/latest/) package.
