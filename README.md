# Race Condition Running

[![Build Status](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml/badge.svg)](https://github.com/raceconditionrunning/raceconditionrunning.github.io/actions/workflows/github-pages.yml)

This repo contains the website for Race Condition Running
  http://raceconditionrunning.com/

## Building and Developing Locally

You should use virtual environments to isolate dependencies for Python.
  [`uv`](https://github.com/astral-sh/uv) is a great way to simplify dependency
  and virtual environment management, and it enables you to use per-project
  Python versions.

1. Install [`uv`](https://github.com/astral-sh/uv). Run `uv help` to make sure
your installation was successful.
2. Run: `uv sync` and `bundle install`.
3. Install [`entr`](https://github.com/eradman/entr), either via running:
`brew install entr` (for macOS) or `sudo apt install entr`.

### Running Locally

After you've installed the Python (`uv sync` ),
  Ruby (`bundle install`) dependencies and `entr` (see section above for commands),
  run:

> `make serve`

From the root of this directory.
A successful deployment will serve a local instance of `raceconditionrunning.github.io`
on [http://localhost:4000](`localhost:4000`).

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
