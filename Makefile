# Makefile for the Race Condition Running website

# key directories
DATA   = _data
ROUTES = routes

# route files and derived versions (normalized GPX and GeoJSON)
ROUTES_RAW_GPX = $(wildcard $(ROUTES)/_gpx/*.gpx)
ROUTES_NORMGPX = $(patsubst $(ROUTES)/_gpx/%.gpx, $(ROUTES)/gpx/%.gpx,         $(ROUTES_RAW_GPX))
ROUTES_GEOJSON = $(patsubst $(ROUTES)/_gpx/%.gpx, $(ROUTES)/geojson/%.geojson, $(ROUTES_RAW_GPX))

# single GeoJSON file with all routes
AGG_ALL_ROUTES_GEOJSON = $(ROUTES)/geojson/routes.geojson

TRANSIT_DATA = routes/transit_data
TRANSIT_DATA_CSV = $(wildcard routes/transit_data/*.csv)

ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

JEKYLL_FLAGS  ?=
URL_BASE_PATH ?=


###########################################################################
# BUILDING AND SERVING THE SITE
###########################################################################

# default target: build everything
.PHONY: all
all: check-schedules build

# build the site
.PHONY: build
build: $(ROUTES_NORMGPX) \
       $(ROUTES_GEOJSON) \
       $(ROUTES_YML) \
       rcc.ics \
       $(AGG_ALL_ROUTES_GEOJSON)
	bundle exec jekyll build $(JEKYLL_FLAGS)

# build main "routes database" YAML file from all normalized route GPX files
$(ROUTES_YML): _bin/make_routes_table.py $(ROUTES_NORMGPX)
	uv run python3 $< $(ROUTES_NORMGPX) $@

# generate ical from schedule YAML, also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(ROUTES_YML)
	uv run python3 $<

# serve the site locally with auto-rebuild on changes
.PHONY: serve
serve: $(ROUTES_NORMGPX) \
       $(ROUTES_GEOJSON) \
       $(ROUTES_YML) \
       rcc.ics \
       $(AGG_ALL_ROUTES_GEOJSON)
	ls _config.yml | entr -r bundle exec jekyll serve --watch --drafts --host=0.0.0.0 $(JEKYLL_FLAGS)


###########################################################################
# LINTING
###########################################################################

# run all checks
.PHONY: check
check: check-schedules \
       check-images \
       check-html \
       check-javascript

# check that schedule file is valid
.PHONY: check-schedules
check-schedules:
	uv run python3 _bin/check-schedules.py

# check that no images are too big
.PHONY: check-images
check-images: _bin/check_images.sh
	$< ./_site

# use htmlproofer to check for broken links, etc
.PHONY: check-html
check-html:
	bundle exec htmlproofer ./_site \
	  --only-4xx \
	  --assume-extension .html \
	  --no-enforce-https \
	  --ignore-missing-alt \
	  --ignore-urls '/fonts.googleapis.com/,/fonts.gstatic.com/' \
	  --swap-urls "https?\:\/\/raceconditionrunning\.com:,^$(URL_BASE_PATH):" \
	  --cache '{ "timeframe": { "external": "30d" } }'

# check that JavaScript files pass linting
.PHONY: check-javascript
check-javascript:
	uv run python3 _bin/check_javascript.py _site



###########################################################################
# ROUTE MUNGING
###########################################################################

# normalize individual raw GPX route files
routes/gpx/%.gpx: _bin/normalize_gpx.py routes/_gpx/%.gpx
	@mkdir -p routes/gpx
	uv run python3 $< \
	  --input  routes/_gpx/$*.gpx \
	  --output routes/gpx/$*.gpx

# batch normalize all raw GPX route files (used in Github Actions)
.PHONY: normalize-routes
normalize-routes: _bin/normalize_gpx.py
	@mkdir -p routes/gpx
	uv run python3 $< \
	  --input  $(foreach raw, $(ROUTES_RAW_GPX), $(raw)) \
	  --output $(foreach raw, $(ROUTES_RAW_GPX), $(patsubst routes/_gpx/%, routes/gpx/%, $(raw)))

# convert individual raw GPX route files to GeoJSON
routes/geojson/%.geojson: _bin/gpx_to_geojson.py routes/_gpx/%.gpx
	@mkdir -p routes/geojson
	uv run python3 $< \
	  --input  routes/_gpx/$*.gpx \
	  --output routes/geojson/$*.geojson

# batch convert all raw GPX route files to GeoJSON (used in Github Actions)
.PHONY: convert-routes
convert-routes: _bin/gpx_to_geojson.py
	@mkdir -p routes/geojson
	uv run python3 $< \
	  --input  $(foreach raw, $(ROUTES_RAW_GPX), $(raw)) \
	  --output $(foreach raw, $(ROUTES_RAW_GPX), $(patsubst %.gpx, routes/geojson/%.geojson, $(notdir $(raw))))

# combine all individual route GeoJSON files into a single GeoJSON file
$(AGG_ALL_ROUTES_GEOJSON): _bin/merge_geojson.py $(ROUTES_GEOJSON)
	@mkdir -p routes/geojson
	uv run python3 $< \
	  --inputs $(ROUTES_GEOJSON) \
	  --output $(AGG_ALL_ROUTES_GEOJSON)

# Use this to standardize format when adding a new route or updating an existing one
normalize-routes-in-place: _bin/normalize_gpx.py
	uv run python3 $< \
	  --input  $(foreach raw, $(ROUTES_RAW_GPX), $(raw)) \
	  --output $(foreach raw, $(ROUTES_RAW_GPX), $(raw))

# Use this when adding a new GPX that doesn't have elevation data
replace-route-elevations: _bin/replace_route_elevations.py
	uv run python3 $< \
	  --input  $(foreach raw, $(ROUTES_RAW_GPX), $(raw)) \
	  --output $(foreach raw, $(ROUTES_RAW_GPX), $(raw))


###########################################################################
# ROUTE PREVIEW IMAGE MANAGEMENT
###########################################################################

.PHONY: route-previews-generate
route-previews-generate:
	uv run python _bin/generate_route_images.py $(if $(URL_BASE_PATH),--base-path $(URL_BASE_PATH),)

.PHONY: route-previews-generate-incremental
route-previews-generate-incremental:
	@if [ -f .route-preview-cache-changed-files ] && [ -s .route-preview-cache-changed-files ]; then \
		echo "Generating images for changed routes only..."; \
		uv run python _bin/generate_route_images.py $(if $(URL_BASE_PATH),--base-path $(URL_BASE_PATH),) --specific-files $$(cat .route-preview-cache-changed-files); \
		_bin/manage_route_preview_cache.sh update; \
	else \
		echo "No changed routes found, skipping image generation"; \
	fi

# check that route preview images are up to date
.PHONY: route-previews-check
route-previews-check:
	_bin/manage_route_preview_cache.sh


###########################################################################
# TRANSIT AND LOCATIONS MUNGING
###########################################################################

$(TRANSIT_DATA):
	_bin/fetch_transit_data.sh

.PHONY: update-locations
update-locations: _bin/update_location_transit.py $(TRANSIT_DATA_CSV) $(TRANSIT_DATA)
	uv run python3 $<


###########################################################################
# CLEANUP
###########################################################################

.PHONY: clean
clean:
	rm -rf $(ROUTES)/gpx/
	rm -rf $(ROUTES)/geojson/
	rm -f $(ROUTES_YML)
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
