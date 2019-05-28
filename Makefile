.PHONY: all build serve publish clean

all: build

rcc.ics: _bin/mkical.py _data/schedule.yml _data/routes.yml
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve:
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

clean:
	rm -rf _site/
