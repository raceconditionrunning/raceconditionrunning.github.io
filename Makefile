DATA          = _data
ROUTES        = $(DATA)/routes.yml
ROUTE_DB_CSV  = $(DATA)/route-db.csv
ROUTE_DB_YML  = $(DATA)/route-db.yml
SCHEDULE      = $(DATA)/schedule.yml

.PHONY: all build serve publish clean

all: build

$(ROUTE_DB_YML): _bin/route-db.py $(ROUTE_DB_CSV)
	python3 $< $(DATA)

$(ROUTES): $(ROUTE_DB_YML)
	# TODO jekyll needs a .yml that has a different name than the .csv
	cp $(ROUTE_DB_YML) $(ROUTES)

rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES)
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES) $(ROUTE_DB_YML)
	rm -rf _site/ .jekyll-cache/ rcc.ics rcc_weekends.ics
