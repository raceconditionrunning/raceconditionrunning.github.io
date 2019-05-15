# Race Condition Running

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

Routes are in `routedb.json` and the current schedule is in `sched.json`.
Most of the site content and iCal are generated from these files.

NOTE: schedule times should be in 24 hour format.
So "5:30 pm" would be "17:30".

Install dependencies with `pip3 install -r requirements.txt` and
`bundle install`.

To test locally, run `make serve`.

After which the page will be available at [http://localhost:4000](http://localhost:4000).

If you change the schedule, please update the iCal before pushing:
```
  $ make rcc.ics
```

## Notes

You may need a specific version of bundler (?!) which you can install with:
```
  $ gem install bundler -v 1.17.3
```

`watchy` is in npm which you can install with:
```
  $ npm install -g watchy
```
