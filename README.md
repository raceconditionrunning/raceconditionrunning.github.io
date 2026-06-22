# Race Condition Running

[![Build Status](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml/badge.svg)](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml)

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

## Building and Developing Locally


### Prerequisites

We have both ruby and python requirements. The versions for each are in the `.ruby-version` and `.python-version` files in the root of this directory. If you have both set up already, you can skip these two commands, but if you don't, you'll need to install them.

#### Installing Ruby and Python
For Ruby:
```sh
brew install rbenv ruby-build
rbenv install -l
rbenv install 3.2.3               ## check .ruby-version for version
gem update --system               ## only if needed
```

For Python:
```sh
brew install pyenv pyenv-virtualenv
pyenv install -l
pyenv install 3.10.11             ## check .python-version for version
```

#### Installing Dependencies

You then need to install the python and ruby dependencies.  For Python, we're going to use `uv` to manage the virtual environment. [`uv`](https://github.com/astral-sh/uv) is a great way to simplify dependency and virtual environment management, and it enables you to use per-project Python versions.

1. Install [`uv`](https://github.com/astral-sh/uv). Run `uv help` to make sure
your installation was successful.
2. Run dependency installation: `uv sync` for python dependencies and `bundle install` for ruby dependencies.
3. Install [`entr`](https://github.com/eradman/entr), either via running:
`brew install entr` (for macOS) or `sudo apt install entr`.

### Running Locally

After installing the dependencies, you can build and serve the site locally:

> `make serve`

A successful deployment will serve a local instance of `raceconditionrunning.github.io`
on [http://localhost:4000](`localhost:4000`).

When a push is made to the main branch of this github repo, the live website is built and deployed by a GitHub action and served by GitHub pages.

## Creating a Schedule

Schedules are YAML files stored in the `_data/schedules/` directory and are named with the format `<YY>-<season>.yml`. Each schedule contains a list of **plans**. Check out the [long-run scheduler](https://github.com/raceconditionrunning/run-scheduler) if you'd like to automatically generate a draft schedule.

The current schedule is symlinked from `_data/schedule.yml`.
To update the symlink (e.g., whenever a new quarter schedule is published),
  run:

```sh
% ln -sf <path_to_new_schedule> _data/schedule.yml
```

### Plans

A **plan** represents a long run consisting of one or more **legs**. While uncommon, there can be multiple distinct plans on the same day.

Each plan is a dictionary containing:
- `date` - Date in `YYYY-MM-DD` format
- `plan` - List of leg dictionaries (see below)
- `highlight_image` - (Optional) Absolute path to an image displayed inline with the plan
- `notes` - (Optional) String displayed as a note for the plan
- `organized-event` - (Optional) Boolean indicating whether the plan is an organized event

#### Plan Legs

Each leg in a plan's `plan` list contains:
- `time` - Start time in 24-hour format (`HH:MM`)
- `route` OR `route_id` - Route information (see Route Options below)

#### Example plans
```yaml
- date: "2026-06-27"
  plan:
    - time: "8:30"
      route_id: cse-lwb-cc
      notes: run in reverse (Columbia City to CSE)
    - time: "10:00"
      route_id: cse-lake-union-westlake

- date: '2026-06-06'
  organized-event: true
  plan:
    - time: '8:00'
      route:
        name: Drumheller Marathon and Half-marathon
        map: /drumheller-marathon-26/
        distance_mi: 26.2
      highlight-image: /img/dm26/og-banner.jpg
```


### Route Options

You can specify routes in two ways:

**Option 1: Reference defined route**
- `route_id` - String key matching a route in `_data/routes.yml`

**Option 2: Inline route definition**
- `route` - Dictionary containing:
  - `name` - Route name (string)
  - `map` - Web map URL (string)
  - `distance_mi` - Distance in miles (float)

You can follow the instructions in the [Adding a Route](#adding-a-route) section to add a new route to `_data/routes.yml` and then use Option 1 above.
When a route hasn't been chosen yet, omit `route_id` and either leave out `route` entirely or include an inline `route` with just `name:TBD`. The schedule layout will render these entries with a "TBD" placeholder.
Example TBD schedule entry:

```yaml
- date: 2024-07-14
  plan:
    - time: "08:30"
      route:
        name: TBD
```

### Cancellations

Both plans and individual legs can include a `cancelled` key. Any value for `cancelled`, including empty string, causes strikethrough display. The value is shown as the cancellation reason.

## Adding a Route

To add a new route, you must add a GPX file to the `routes/_gpx/` directory. This new `<route-name>.gpx` file must follow our formatting requirments, else the build will fail with a descriptive error. These requirements are checked by `_bin/make_routes_table.py` and are listed here by tag:

  * `<gpx>` - must include the RCR extension: `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Race Condition Running" xmlns:rcr="http://raceconditionrunning.com/extensions">`
  * `<name>` - lowercase, hyphenated name of the route. Ends with `loop` if the route is a loop or `ob` if the route is an out-and-back.
  * `<desc>` - The presentation name of the route, e.g. "Lake Union Loop".
  * `<metadata>` -- must include an `<extensions>` tag in this section, with
    `<rcr:last_updated>YYYY-MM-DD</rcr:last_updated>`.

Open any of he existing GPX files in `routes/_gpx/` to see examples of these tags.

Before you commit changes to a route, run `make normalize-routes-in-place` to ensure the route is formatted correctly.

If your `.gpx` file is missing elevation information, run `make replace-route-elevations` and `make normalize-routes-in-place`.

If your route starts or ends at a new location, add a new feature to the `routes/locations.json` file.

### Typical workflow for adding routes

First, you need to have the route defined somehow. If you are inheriting a GPX file from another trusted source, you can skip this step.
If this is a new route, you can draft it with [OnTheGoMap](https://onthegomap.com).
Please be careful when making new routes!
Pay attention to the exact areas the route runs through, sidewalk quality, traffic speed and noise, neighborhood density, and other factors. Think carefully whether the route is actually runnable and safe, and where there might be alternatives.
For example, most routes with long stretches on the shoulder of a busy road would not be sufficiently safe.
Use Street View on [Google Maps](https://www.google.com/maps/) scope out a run.

With the route now defined, there are two ways to generate and re-format route GPX files, which we detail below: the **automated script** or the **manual workflow**. Both should result in near-equivalent GPX files. If you

After generating each route, you can run `make serve` to check that the route was generated locally and the site looks right. (Follow the instructions for `Building and Developing Locally` first, if you haven't already.)

If you are making more than one route, batch all of your commits and only push once. The CI build is somewhat slow.

#### Option A: Using `import_route.py`

`_bin/import_route.py` automates the entire route import process — fetching coordinates, adding elevation data, and writing a correctly formatted GPX file. It can accept an OnTheGoMap url or a GPX file.

**From an OnTheGoMap URL** (share link or full URL):

```sh
uv run python3 _bin/import_route.py \
  --url "https://onthegomap.com/s/ke0cnl2r" \     # can be share version (shown) or long version
  --id cse-sobel-mercer-island \
  --name "CSE, South Bellevue, Mercer Island"
```

**From an existing GPX file** (e.g. exported from OnTheGoMap, Strava, etc.):

```sh
uv run python3 _bin/import_route.py \
  --gpx ~/Downloads/my-route.gpx \
  --id my-new-route-loop \
  --name "My New Route"
```

The script will:
1. Extract track points from the URL or the GPX file
2. Fetch missing elevation data from [USGS 3DEP](https://epqs.nationalmap.gov/) (~10m resolution, with [Open-Meteo](https://open-meteo.com/) fallback)
3. Write a GPX file to `routes/_gpx/<id>.gpx` with all required RCR metadata
4. Run `normalize_gpx.py` to finalize the file (computes ascent, detects start/end locations)

Additional flags:
- `--map-url URL` — override the `rcr:map` value (auto-generated as a short OnTheGoMap link if omitted)
- `--overwrite-elevation` — replace existing elevation data when importing a GPX file
- `--skip-normalize` — skip the normalization step

Extraction from a URL relies on the structure currently used by OnTheGoMap. Specifically, OnTheGoMap full (non-share) URLs include an `r2` query parameter with a polyline encoding the full route. The script will fail if OnTheGoMap changes their URL structure.

#### Option B: Manual workflow

1. Go to the hamburger menu at the top-right corner of [OnTheGoMap](https://onthegomap.com) and select "Export as GPX". Save the "shortened link" of the route for later use in Step 4 for `rcr:map`).

2. Move the GPX file to `routes/_gpx` and give it a name based on its type (e.g., out-and-back, point-to-point, loop, etc.) and where it starts and what main areas it goes through. If the route is a loop, put `-loop` and if it is an out-and-back, put `-ob` at the end.

3. Edit the GPX (which is just XML) like so: from any existing route in `routes/_gpx`, take all the content down to the `<trkseg>` tag and replace all the content in the original GPX file up until the start of `<trkseg>` with it. Then modify the fields specific to the route. This includes:
      * metadata `name` (same as GPX file name)
      * metadata `desc`
      * metadata `link` including `text`
      * Only `rcr:map` and `rcr:last_updated` under `extensions`
      * track `name` (same as GPX file name)
      * track `desc`

4. Run `./_bin/gpx-inplace-fixup.sh routes/_gpx/recently-added-route.gpx` to add elevation data to the route. Make sure you have python installed since this script invokes other python scripts.


## Project Structure

```
.
├── _bin/                        # Build and utility scripts
│   ├── import_route.py          # Import routes from OnTheGoMap or GPX files
│   ├── normalize_gpx.py         # Normalize GPX files (metrics, locations)
│   ├── replace_route_elevations.py
│   ├── gpx-inplace-fixup.sh     # Chains elevation → surface → normalize
│   ├── mkical.py                # Generate iCal feed from schedule
│   ├── make_routes_table.py     # Generate _data/routes.yml from GPX files
│   ├── make_schedules_table.py  # Generate _data/schedules_table.yml
│   ├── rcr.py                   # Shared library (route loading, paths)
│   └── gis.py                   # Geo utilities (distance, ascent, locations)
├── _brunch-reviews/             # Brunch review posts (add a file to create one)
├── _data/
│   ├── schedule.yml             # Symlink → current season's schedule
│   ├── schedules/               # Per-season schedule YAML files
│   ├── routes.yml               # Generated route index (do not edit by hand)
│   └── locations.json           # Generated from routes/locations.geojson
├── _layouts/                    # Jekyll page templates
├── _includes/                   # Jekyll partial templates
├── routes/
│   ├── _gpx/                    # GPX files for existing routes
│   ├── locations.geojson        # Start/end location definitions
│   └── geojson/                 # Generated GeoJSON (do not edit by hand)
├── utils/
│   └── onthegomap.py            # OnTheGoMap URL/GPX conversion utilities
├── pages/                       # Static site pages
├── img/                         # Site images
├── Makefile                     # Build targets (serve, normalize, etc.)
├── _config.yml                  # Jekyll configuration
└── pyproject.toml               # Python dependencies (managed by uv)
```

## Preparing Images

Use ImageMagick to compress images. Converting to high quality AVIF with a max edge length of 2000 works well:

    mogrify -quality 90 -resize 2000x2000 -format avif -auto-orient *.jpg
