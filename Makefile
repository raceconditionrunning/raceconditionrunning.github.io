.PHONY: all build serve publish clean

all: build

_data/routes.yml:
	$(MAKE) -C _data routes.yml

rcc.ics: _bin/mkical.py _data/schedule.yml _data/routes.yml
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve: rcc.ics
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	$(MAKE) -C _data clean
	rm -rf _site/ .jekyll-cache/ rcc.ics rcc_weekends.ics
