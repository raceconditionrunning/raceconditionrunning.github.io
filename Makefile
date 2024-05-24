ROUTES     = routes
ROUTES_CSV = $(ROUTES)/db.csv

DATA       = _data
ROUTES_YML = $(DATA)/routes.yml
SCHEDULE   = $(DATA)/schedule.yml

.PHONY: all build serve publish clean

all: build

$(ROUTES_YML): _bin/route-db.py $(ROUTES_CSV)
	python3 $< $(PWD)

rcc.ics: _bin/mkical.py $(SCHEDULE) $(ROUTES_YML)
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -f $(ROUTES_YML)
	rm -rf _site/ .jekyll-cache/ rcc.ics rcc_weekends.ics
