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

# parse optional --wait argument
WAIT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --wait)
      WAIT="$2"
      shift 2
      ;;
    *)
      GPX_FILE="$1"
      shift
      ;;
  esac
done

# ensure we get a gpx file as input
if [ -z "${GPX_FILE:-}" ]; then
  echo "Usage: $0 [--wait SECONDS] ROUTE.gpx"
  exit 1
fi

# ensure input is a readable file
if [ ! -r "$GPX_FILE" ]; then
  echo "Error: File '$GPX_FILE' does not exist or is not readable."
  exit 1
fi

# ensure input is a gpx file
if [[ "$GPX_FILE" != *.gpx ]]; then
  echo "Error: File '$GPX_FILE' may not be a GPX file (extension is not \".gpx\")."
  exit 1
fi

# inject the elevation data into the GPX file
uv run python3 ${SDIR}/replace_route_elevations.py ${WAIT:+--wait "$WAIT"} --normalize-after --input "$GPX_FILE" --output "$GPX_FILE"

# add surface metadata to the GPX file
uv run python3 ${SDIR}/add_surface_to_gpx.py --input "$GPX_FILE" --output "$GPX_FILE"

# pretty print the GPX file back to itself
uv run python3 ${SDIR}/normalize_gpx.py --input "$GPX_FILE" --output "$GPX_FILE"
