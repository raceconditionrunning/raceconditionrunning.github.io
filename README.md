# Race Condition Running

[![Build Status](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml/badge.svg)](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml)

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

## Building and Developing Locally

You should use virtual environments to isolate dependencies for Python.
  [`uv`](https://github.com/astral-sh/uv) is a great way to simplify dependency
  and virtual environment management, and it enables you to use per-project
  Python versions.

1. Install [`uv`](https://github.com/astral-sh/uv). Run `uv help` to make sure
your installation was successful.
2. Run: `uv sync` and `bundle install`.
3. Install [`entr`](https://github.com/eradman/entr), either via running:
`brew install entr` (for macOS) or `sudo apt install entr`.

### Running Locally

After you've installed the Python (`uv sync` ),
  Ruby (`bundle install`) dependencies and `entr` (see section above for commands),
  run:

> `make serve`

From the root of this directory.
A successful deployment will serve a local instance of `raceconditionrunning.github.io`
on [http://localhost:4000](`localhost:4000`).

The live site is built and deployed by a GitHub action and served by GitHub pages.

### Creating a Schedule

Schedules are YAML files stored in the `_data/schedules/` directory. Each schedule contains a list of **plans**. Check out the [long-run scheduler](https://github.com/raceconditionrunning/run-scheduler) if you'd like to automatically generate a schedule.

#### Plans

A **plan** represents a long run that may be broken into multiple legs. While uncommon, there can be multiple distinct plans on the same day.

Each plan is a dictionary containing:
- `date` - Date in `YYYY-MM-DD` format
- `plan` - List of leg dictionaries (see below)
- `highlight_image` - (Optional) Absolute path to an image displayed inline with the plan
- `notes` - (Optional) String displayed as a note for the plan


##### Plan Legs

Each leg in a plan's `plan` list contains:
- `time` - Start time in 24-hour format (`HH:MM`)
- `route` OR `route_id` - Route information (see Route Options below)

#### Route Options

You can specify routes in two ways:

**Option 1: Reference existing route**
- `route_id` - String key matching a route in `_data/routes.yml`

**Option 2: Inline route definition**
- `route` - Dictionary containing:
  - `name` - Route name (string)
  - `map` - Web map URL (string)
  - `distance_mi` - Distance in miles (float)

#### Cancellations

Both plans and individual legs can include a `cancelled` key:
- Any value (including empty string) causes strikethrough display
- The value content is shown as the cancellation reason

### Adding a Route

Add a GPX file to the `routes/_gpx/` directory. The build will fail with a descriptive error if any route doesn't meet the minimum formatting requirements which get checked by `_bin/make_routes_table.py`. 
  
  * The file's `<gpx>` tag must include the RCR extension: `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Race Condition Running" xmlns:rcr="http://raceconditionrunning.com/extensions">`
  * `<name>` - lowercase, hyphenated name of the route. Ends with `loop` if the route is a loop or `ob` if the route is an out-and-back.
  * `<desc>` - The presentation name of the route, e.g. "Lake Union Loop".
  * You must include an `<extensions>` tag in the `<metadata>` section, with
    `<rcr:last_updated>YYYY-MM-DD</rcr:last_updated>`.

Before you commit changes to a route, run `make normalize-routes-in-place` to ensure the route is formatted correctly.

To supply elevation data, run `make replace-route-elevations` and `make normalize-routes-in-place`.


## Important Files and Folders

- `_bin/mkical.py` generates an iCalendar file for the current schedule.
- Routes are in `_data/routes.yml`.
- The current schedule is in `_data/schedule.yml`. This is a symlink to the current season's schedule in `_data/schedules/`.
- To create a new brunch review, add a new file to the `_brunch-reviews` folder.

## Preparing Images

Use ImageMagick to compress images. Converting to high quality AVIF with a max edge length of 2000 works well:

    mogrify -quality 90 -resize 2000x2000 -format avif -auto-orient *.jpg
