.PHONY: all build serve publish clean

all: build

rcc.ics: _bin/mkical.py sched.json routedb.json
	python3 $<

build: rcc.ics
	bundle exec jekyll build

serve:
	watchy -w _config.yml -- bundle exec jekyll serve --watch --drafts --host=0.0.0.0

publish: clean build
	# First, check to make sure the repo
	# TODO: check for files not in git index
	git diff --quiet && git diff --cached --quiet
	# Next, clean out the submodules
	git submodule deinit -f .
	git checkout -b master
	git add -f _site/
	git commit -m "Publishing site on `date "+%Y-%m-%d %H:%M:%S"`"
	rm cv.pdf
	git filter-branch -f --subdirectory-filter _site/
	git push -f origin master:master
	git checkout source
	git branch -D master
	git branch -d -r origin/master
	git update-ref -d refs/original/refs/heads/master

clean:
	# Delete build files
	rm -rf _site/ rcc.ics
	# Delete master branch
	# git branch -D master >/dev/null 2>&1 || true
