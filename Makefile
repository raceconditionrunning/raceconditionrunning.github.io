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


.PHONY: all schedules routes build serve publish clean

all: schedules routes build

schedules: $(SCHEDULE)
	python3 _bin/check-schedules.py


$(ROUTES_YML): _bin/route-db.py $(ROUTES_GPX)
	python3 $<


routes: $(ROUTES_GPX)
	python3 _bin/route-gis.py

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES_YML)
	rm -f $(ROUTES_GEOJSON)/*.geojson
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
