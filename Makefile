ROUTES   = routes
ROUTE_DB = $(ROUTES)/db.csv

DATA       = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE   = $(DATA)/schedule.yml

.PHONY: all check gis build serve publish clean

all: check gis build

check:
	python3 _bin/check-schedules.py

$(ROUTES_YML): _bin/route-db.py $(ROUTE_DB)
	python3 $<

gis: $(ROUTES_YML)
	python3 _bin/route-gis.py

rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES_YML)
	rm -rf _site/ .jekyll-cache/ rcc.ics rcc_weekends.ics
