ROUTE_RAW_GPX_FILES = $(wildcard routes/_gpx/*.gpx)
ROUTE_GEOJSON_FILES = $(patsubst routes/_gpx/%.gpx, routes/geojson/%.geojson, $(ROUTE_RAW_GPX_FILES))
ROUTES_GPX_NORMALIZED = $(patsubst routes/_gpx/%.gpx, routes/gpx/%.gpx, $(ROUTE_RAW_GPX_FILES))
AGGREGATE_GEOJSON_FILES = routes/geojson/routes.geojson

TRANSIT_DATA = routes/transit_data
TRANSIT_DATA_CSV = $(wildcard routes/transit_data/*.csv)

DATA = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

JEKYLL_FLAGS ?=
URL_BASE_PATH ?=


.PHONY: all build check check-html check-javascript check-schedules clean update-locations normalize-routes serve

all: $(ROUTES_GPX_NORMALIZED) $(ROUTE_GEOJSON_FILES) $(AGGREGATE_GEOJSON_FILES) $(ROUTES_YML) check-schedules rcc.ics build

$(ROUTES_YML): _bin/make_routes_table.py $(ROUTES_GPX_NORMALIZED)
	uv run python3 $< $(ROUTES_GPX_NORMALIZED) $@


routes/geojson/%.geojson: _bin/gpx_to_geojson.py routes/_gpx/%.gpx
	@mkdir -p $(@D)
	uv run python3 $< --input routes/_gpx/$*.gpx --output $@

# Batch convert; use when building from scratch (e.g. CI)
convert-routes:
	@mkdir -p routes/geojson
	uv run python3 _bin/gpx_to_geojson.py --input $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))\
	 	--output $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(patsubst %.gpx, routes/geojson/%.geojson, $(notdir $(raw))))


# All routes in one file
routes/geojson/routes.geojson: _bin/merge_geojson.py $(ROUTE_GEOJSON_FILES)
	uv run python3 $< $(ROUTE_GEOJSON_FILES) $@

routes/gpx/%.gpx: _bin/normalize_gpx.py routes/_gpx/%.gpx
	@mkdir -p $(@D)
	uv run python3 $< --input routes/_gpx/$*.gpx --output routes/gpx/$*.gpx

# Batch normalize; use when building from scratch (e.g. CI)
normalize-routes:
	@mkdir -p routes/gpx
	uv run python3 _bin/normalize_gpx.py --input $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))\
		--output $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(patsubst routes/_gpx/%, routes/gpx/%,$(raw)))

# Use this to standardize format when adding a new route or updating an existing one
normalize-routes-in-place:
	@mkdir -p routes/gpx
	uv run python3 _bin/normalize_gpx.py --input $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))\
		--output $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))

# Use this when adding a new GPX that doesn't have elevation data
replace-route-elevations:
	uv run python3 _bin/replace_route_elevations.py --input $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))\
                                                    		--output $(foreach raw, $(ROUTE_RAW_GPX_FILES),$(raw))

$(TRANSIT_DATA):
	_bin/fetch_transit_data.sh

update-locations: _bin/update_location_transit.py $(TRANSIT_DATA_CSV) $(TRANSIT_DATA)
	uv run python3 $<

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(ROUTES_YML)
	uv run python3 $<

build: rcc.ics $(ROUTES_YML) $(ROUTE_GEOJSON_FILES) $(AGGREGATE_GEOJSON_FILES)
	bundle exec jekyll build $(JEKYLL_FLAGS)

check-images: _bin/check_images.sh
	$< ./_site

check-html:
	bundle exec htmlproofer ./_site \
	  --only-4xx \
	  --assume-extension .html \
	  --no-enforce-https \
	  --ignore-missing-alt \
	  --ignore-urls '/fonts.googleapis.com/,/fonts.gstatic.com/' \
	  --swap-urls "https?\:\/\/raceconditionrunning\.com:,^$(URL_BASE_PATH):" \
	  --cache '{ "timeframe": { "external": "30d" } }'

check-javascript:
	uv run python3 _bin/check_javascript.py _site

check-schedules: $(SCHEDULE)
	uv run python3 _bin/check-schedules.py

check: check-images check-html check-javascript check-schedules

route-previews-check:
	_bin/manage_route_preview_cache.sh

route-previews-generate:
	uv run python _bin/generate_route_images.py $(if $(URL_BASE_PATH),--base-path $(URL_BASE_PATH),)

route-previews-generate-incremental:
	@if [ -f .route-preview-cache-changed-files ] && [ -s .route-preview-cache-changed-files ]; then \
		echo "Generating images for changed routes only..."; \
		uv run python _bin/generate_route_images.py $(if $(URL_BASE_PATH),--base-path $(URL_BASE_PATH),) --specific-files $$(cat .route-preview-cache-changed-files); \
		_bin/manage_route_preview_cache.sh update; \
	else \
		echo "No changed routes found, skipping image generation"; \
	fi


serve: rcc.ics $(ROUTES_YML) $(ROUTE_GEOJSON_FILES) $(AGGREGATE_GEOJSON_FILES)
	ls _config.yml | entr -r bundle exec jekyll serve --watch --drafts --host=0.0.0.0 $(JEKYLL_FLAGS)

clean:
	rm -f $(ROUTES_YML)
	rm -rf routes/geojson/ routes/gpx/
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
