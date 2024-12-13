ROUTES = routes
ROUTES_GEOJSON = $(ROUTES)/geojson
ROUTES_GPX := $(wildcard $(ROUTES)/gpx/*.gpx)
TRANSIT_DATA = $(ROUTES)/transit_data
TRANSIT_DATA_CSV = $(wildcard $(ROUTES)/transit_data/*.csv)

DATA = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

JEKYLL_FLAGS ?=
URL_BASE_PATH ?=


.PHONY: all check-schedules routes build serve publish clean

all: check-schedules rcc.ics build


$(ROUTES_YML): _bin/route-db.py $(ROUTES_GPX)
	python3 $<


routes: $(ROUTES_GPX)
	python3 _bin/route-gis.py

$(TRANSIT_DATA):
	_bin/fetch_transit_data.sh

locations: $(TRANSIT_DATA_CSV) $(TRANSIT_DATA)
	python3 _bin/update_location_transit.py

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics
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
	rm -f $(ROUTES_GEOJSON)/*.geojson
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
