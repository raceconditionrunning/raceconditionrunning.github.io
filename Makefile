ROUTES = routes
ROUTE_GEOJSON = $(ROUTES)/geojson
ROUTE_GPX = $(ROUTES)/gpx
ROUTE_RAW_GPX_FILES := $(wildcard $(ROUTES)/_gpx/*.gpx)
NEIGHBORHOODS = $(ROUTES)/neighborhoods.geojson
NEIGHBORHOODS_URL="https://hub.arcgis.com/api/v3/datasets/b4a142f592e94d39a3bf787f3c112c1d_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"

TRANSIT_DATA = $(ROUTES)/transit_data
TRANSIT_DATA_CSV = $(wildcard $(ROUTES)/transit_data/*.csv)

DATA = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

JEKYLL_FLAGS ?=
URL_BASE_PATH ?=


.PHONY: all build check check-html check-javascript check-schedules clean locations serve

all: $(ROUTES_YML) $(ROUTE_GEOJSON) check-schedules rcc.ics build


$(ROUTES_YML): _bin/route-db.py $(ROUTE_RAW_GPX_FILES)
	python3 $<

$(NEIGHBORHOODS):
	@wget -c $(NEIGHBORHOODS_URL) -O $@

# This target only looks at the "routes/geojson" directory modification time. Clean and rebuild when changing gpx files
$(ROUTE_GEOJSON): $(ROUTE_RAW_GPX_FILES) $(NEIGHBORHOODS)
	python3 _bin/route-gis.py

$(TRANSIT_DATA):
	_bin/fetch_transit_data.sh

locations: $(TRANSIT_DATA_CSV) $(TRANSIT_DATA) $(NEIGHBORHOODS)
	python3 _bin/update_location_transit.py

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics $(ROUTE_GEOJSON) $(ROUTES_YML)
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

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES_YML)
	rm -rf $(ROUTE_GEOJSON) $(ROUTE_GPX)
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
