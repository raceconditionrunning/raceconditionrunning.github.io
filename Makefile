ROUTES = routes
ROUTE_DB = $(ROUTES)/routes.csv
ROUTES_JSON = $(ROUTES)/routes.json
ROUTES_GEOJSON = $(ROUTES)/geojson

DATA = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE = $(DATA)/schedule.yml

.PHONY: all check gis build serve publish clean

all: check gis build

check:
	python3 _bin/check-schedules.py

# also generates $(ROUTES_JSON)
$(ROUTES_YML): _bin/route-db.py $(ROUTE_DB)
	python3 $<

# populates $(ROUTES_GEOJSON)
gis: $(ROUTES_YML)
	python3 _bin/route-gis.py

# also generates rcc_weekends.ics
rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES_YML) $(ROUTES_JSON)
	rm -f $(ROUTES_GEOJSON)/*.geojson
	rm -f rcc.ics rcc_weekends.ics
	rm -rf _site/ .jekyll-cache/
