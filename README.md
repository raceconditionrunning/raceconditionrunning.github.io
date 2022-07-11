# Race Condition Running

[![Build Status](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml/badge.svg)](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml)

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

Install dependencies with `pip3 install -r requirements.txt` and
`bundle install`.

To test locally, run `make serve` (requires `watchy`; install with
`npm install -g watchy`), after which the page will be available at
[http://localhost:4000](http://localhost:4000).

The entire site is built by `_bin/mkical.py` and Jekyll; the live site is built
and deployed by a GitHub action and served by GitHub pages.

## Important Files and Folders

- Routes are in `_data/routes.yml`.
- The current schedule is in `_data/schedule.yml`.  
  NOTE: Schedule times should be in 24 hour format. So "5:30 pm" would be
  "17:30".
- To create a new brunch review, add a new file to the `_brunch-reviews` folder.

## Preparing Images

Use ImageMagick to compress images. Converting to high quality WebP with a max edge length of 2000 works well:

    mogrify -quality 90 -resize 2000x2000 -format webp -auto-orient *.jpg
