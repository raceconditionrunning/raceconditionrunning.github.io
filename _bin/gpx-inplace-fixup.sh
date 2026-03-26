#!/usr/bin/env bash

set -u # reading an unset variable is an error
set -e # exit on error

# resolve the directory of this script
src="${BASH_SOURCE[0]}"
while [ -L "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  [[ $src != /* ]] && src="$dir/$src"
done
SDIR="$(cd -P "$(dirname "$src")" && pwd)"

# ensure we get a gpx file as input
if [ $# -ne 1 ]; then
  echo "Usage: $0 ROUTE.gpx"
  exit 1
fi

# ensure input is a readable file
if [ ! -r "$1" ]; then
  echo "Error: File '$1' does not exist or is not readable."
  exit 1
fi

# ensure input is a gpx file
if [[ "$1" != *.gpx ]]; then
  echo "Error: File '$1' may not be a GPX file (extension is not \".gpx\")."
  exit 1
fi

# inject the elevation data into the GPX file
uv run python3 ${SDIR}/replace_route_elevations.py --input "$1" --output "$1"

# add surface metadata to the GPX file
uv run python3 ${SDIR}/add_surface_to_gpx.py --input "$1" --output "$1"

# pretty print the GPX file back to itself
uv run python3 ${SDIR}/normalize_gpx.py --input "$1" --output "$1"
