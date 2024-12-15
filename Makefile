ROUTE_RAW_GPX_FILES = $(wildcard routes/_gpx/*.gpx)
ROUTE_GEOJSON_FILES = $(patsubst routes/_gpx/%.gpx, routes/geojson/%.geojson, $(ROUTE_RAW_GPX_FILES))
ROUTES_GPX_NORMALIZED = $(patsubst routes/_gpx/%.gpx, routes/gpx/%.gpx, $(ROUTE_RAW_GPX_FILES))
NEIGHBORHOODS = routes/neighborhoods.geojson
NEIGHBORHOODS_URL="https://hub.arcgis.com/api/v3/datasets/b4a142f592e94d39a3bf787f3c112c1d_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"

TRANSIT_DATA = routes/transit_data
TRANSIT_DATA_CSV = $(wildcard routes/transit_data/*.csv)

DATA = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

JEKYLL_FLAGS ?=
URL_BASE_PATH ?=


.PHONY: all build check check-html check-javascript check-schedules clean update-locations normalize-routes serve

all: $(ROUTES_GPX_NORMALIZED) $(ROUTE_GEOJSON_FILES) $(ROUTES_YML) check-schedules rcc.ics build

$(NEIGHBORHOODS):
	@wget -c $(NEIGHBORHOODS_URL) -O $@

$(ROUTES_YML): _bin/make_routes_table.py $(ROUTES_GPX_NORMALIZED)
	python3 $< $(ROUTES_GPX_NORMALIZED) $@


routes/geojson/%.geojson: _bin/gpx_to_geojson.py routes/_gpx/%.gpx $(NEIGHBORHOODS)
	@mkdir -p $(@D)
	python3 $< routes/_gpx/$*.gpx $@

# Batch convert; use when building from scratch (e.g. CI)
convert-routes:
	@mkdir -p routes/geojson
	python3 _bin/gpx_to_geojson.py $(foreach raw, $(ROUTE_RAW_GPX_FILES), $(raw) $(patsubst %.gpx, routes/geojson/%.geojson, $(notdir $(raw))))


# All routes in one file
routes/geojson/routes.geojson: _bin/merge_geojson.py $(ROUTE_GEOJSON_FILES)
	python3 $< $(ROUTE_GEOJSON_FILES) $@

routes/gpx/%.gpx: _bin/normalize_gpx.py routes/_gpx/%.gpx
	@mkdir -p $(@D)
	python3 $< routes/_gpx/$*.gpx routes/gpx/$*.gpx

# Batch normalize; use when building from scratch (e.g. CI)
normalize-routes:
	@mkdir -p routes/gpx
	python3 _bin/normalize_gpx.py $(foreach raw, $(ROUTE_RAW_GPX_FILES), $(raw) $(patsubst routes/_gpx/%, routes/gpx/%,$(raw)))

$(TRANSIT_DATA):
	_bin/fetch_transit_data.sh

update-locations: _bin/update_location_transit.py $(TRANSIT_DATA_CSV) $(TRANSIT_DATA) $(NEIGHBORHOODS)
	python3 $<

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(ROUTES_YML)
	python3 $<

build: rcc.ics $(ROUTES_YML) $(ROUTE_GEOJSON_FILES)
	bundle exec jekyll build $(JEKYLL_FLAGS)

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
	python3 _bin/check_javascript.py _site

check-schedules: $(SCHEDULE)
	python3 _bin/check-schedules.py

check: check-html check-javascript check-schedules

serve: rcc.ics $(ROUTES_YML) $(ROUTE_GEOJSON_FILES)
	ls _config.yml | entr -r bundle exec jekyll serve --watch --drafts --host=0.0.0.0 $(JEKYLL_FLAGS)

clean:
	rm -f $(ROUTES_YML)
	rm -rf routes/geojson/ routes/gpx/
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
