"""OnTheGoMap URL and GPX conversion utilities.

Provides functions to convert between OnTheGoMap URLs (short and long),
coordinate lists, and GPX files in the RCR project format.
"""

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

import gpxpy

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_USER_AGENT = "Mozilla/5.0 (compatible; RCR-import/1.0)"
_OTGM_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_~-"
_OTGM_DECODE_MAP = {_OTGM_ALPHABET[i]: chr(i + 63) for i in range(65)}
_OTGM_ENCODE_MAP = {chr(i + 63): _OTGM_ALPHABET[i] for i in range(65)}

_USGS_ELEVATION_URL = "https://epqs.nationalmap.gov/v1/json"
_USGS_INTER_POINT_DELAY = 0.1
_OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation"
ELEVATION_BATCH_SIZE = 100
ELEVATION_INTER_BATCH_DELAY = 1.0
ELEVATION_MAX_RETRIES = 5
ELEVATION_INITIAL_BACKOFF = 10.0


# ---------------------------------------------------------------------------
# Polyline encoding/decoding
# ---------------------------------------------------------------------------

def _otgm_r2_to_polyline(r2):
    return "".join(_OTGM_DECODE_MAP.get(ch, ch) for ch in r2)


def _polyline_to_otgm_r2(polyline):
    return "".join(_OTGM_ENCODE_MAP.get(ch, ch) for ch in polyline)


def _decode_polyline(encoded, precision=5):
    inv = 1.0 / (10 ** precision)
    decoded = []
    previous = [0, 0]
    i = 0
    while i < len(encoded):
        for idx in range(2):
            shift = 0
            result = 0
            while True:
                b = ord(encoded[i]) - 63
                i += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            if result & 1:
                previous[idx] += ~(result >> 1)
            else:
                previous[idx] += (result >> 1)
        decoded.append((previous[0] * inv, previous[1] * inv))
    return decoded


def _encode_polyline(coords, precision=5):
    factor = 10 ** precision
    encoded = []
    prev_lat = 0
    prev_lng = 0
    for lat, lng in coords:
        lat_int = round(lat * factor)
        lng_int = round(lng * factor)
        for v in (lat_int - prev_lat, lng_int - prev_lng):
            v = ~(v << 1) if v < 0 else (v << 1)
            while v >= 0x20:
                encoded.append(chr((v & 0x1f) + 63 + 0x20))
                v >>= 5
            encoded.append(chr(v + 63))
        prev_lat = lat_int
        prev_lng = lng_int
    return "".join(encoded)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


# ---------------------------------------------------------------------------
# URL conversion
# ---------------------------------------------------------------------------

def short_to_long_url(short_url):
    """Resolve an OnTheGoMap short URL (e.g. /s/XXXX) to the full URL with r2 param."""
    parsed = urllib.parse.urlparse(short_url)
    params = urllib.parse.parse_qs(parsed.query)
    if "r2" in params or "r" in params:
        return short_url
    opener = urllib.request.build_opener(_NoRedirectHandler)
    req = urllib.request.Request(
        short_url,
        headers={"User-Agent": _USER_AGENT},
    )
    try:
        resp = opener.open(req, timeout=15)
        return resp.url
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            return e.headers.get("Location", short_url)
        raise


def long_to_short_url(long_url):
    """Shorten a full OnTheGoMap URL via the cfworker/shorten API."""
    req = urllib.request.Request(
        "https://onthegomap.com/cfworker/shorten",
        data=json.dumps({"long_url": long_url}).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": _USER_AGENT,
        },
    )
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())["link"]


# ---------------------------------------------------------------------------
# Coords <-> URL
# ---------------------------------------------------------------------------

def url_to_coords(url):
    """Extract (lat, lng) coords from any OnTheGoMap URL (short or long)."""
    full_url = short_to_long_url(url)
    parsed = urllib.parse.urlparse(full_url)
    params = urllib.parse.parse_qs(parsed.query)
    if "r2" in params:
        polyline_str = _otgm_r2_to_polyline(params["r2"][0])
        return _decode_polyline(polyline_str, 5)
    elif "r" in params:
        return _decode_polyline(params["r"][0], 5)
    raise ValueError(f"No route data (r or r2 param) in URL: {full_url}")


def coords_to_url(coords):
    """Build a full OnTheGoMap URL from (lat, lng) coords."""
    polyline = _encode_polyline(coords)
    r2 = _polyline_to_otgm_r2(polyline)
    return f"https://onthegomap.com/?m=r&u=mi&context=share&r2={urllib.parse.quote(r2, safe='')}"


# ---------------------------------------------------------------------------
# Elevation
# ---------------------------------------------------------------------------

def _fetch_usgs_elevation(lat, lng):
    """Fetch a single elevation value from USGS 3DEP."""
    url = (
        f"{_USGS_ELEVATION_URL}"
        f"?x={lng:.6f}&y={lat:.6f}&wkid=4326&units=Meters&includeDate=false"
    )
    req = urllib.request.urlopen(url, timeout=10)
    data = json.loads(req.read())
    return float(data["value"])


def _fetch_elevations_usgs(coords):
    """Fetch elevations from USGS 3DEP (per-point, ~10m resolution)."""
    elevations = []
    n = len(coords)
    for i, (lat, lng) in enumerate(coords):
        ele = _fetch_usgs_elevation(lat, lng)
        elevations.append(ele)
        if (i + 1) % 50 == 0 or i == n - 1:
            print(f"  elevation [USGS]: {i + 1}/{n} points")
        if i < n - 1:
            time.sleep(_USGS_INTER_POINT_DELAY)
    return elevations


def _fetch_elevations_open_meteo(coords):
    """Fetch elevations from Open-Meteo (batched, lower resolution)."""
    elevations = []
    n = len(coords)
    n_batches = math.ceil(n / ELEVATION_BATCH_SIZE)
    for batch_idx in range(n_batches):
        start = batch_idx * ELEVATION_BATCH_SIZE
        batch = coords[start:start + ELEVATION_BATCH_SIZE]
        lats = ",".join(f"{lat:.6f}" for lat, _ in batch)
        lngs = ",".join(f"{lng:.6f}" for _, lng in batch)
        url = f"{_OPEN_METEO_URL}?latitude={lats}&longitude={lngs}"
        backoff = ELEVATION_INITIAL_BACKOFF
        for attempt in range(ELEVATION_MAX_RETRIES):
            try:
                req = urllib.request.urlopen(url, timeout=30)
                data = json.loads(req.read())
                elevations.extend(data["elevation"])
                end = start + len(batch) - 1
                print(
                    f"  elevation [Open-Meteo]: points {start}-{end} of {n} "
                    f"(batch {batch_idx + 1}/{n_batches})"
                )
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    if attempt == ELEVATION_MAX_RETRIES - 1:
                        print(
                            f"  ERROR: rate-limited on batch {batch_idx + 1} "
                            f"after {ELEVATION_MAX_RETRIES} retries",
                            file=sys.stderr,
                        )
                        raise
                    print(
                        f"  rate-limited (429), waiting {backoff:.0f}s "
                        f"(attempt {attempt + 1}/{ELEVATION_MAX_RETRIES})..."
                    )
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    raise
        if batch_idx < n_batches - 1:
            time.sleep(ELEVATION_INTER_BATCH_DELAY)
    return elevations


def fetch_elevations(coords):
    """Fetch elevation (meters) for each (lat, lng) coordinate.

    Tries USGS 3DEP first (~10m resolution). Falls back to Open-Meteo
    if USGS is unavailable.
    """
    try:
        _fetch_usgs_elevation(*coords[0])
    except Exception:
        print("  USGS 3DEP unavailable, falling back to Open-Meteo", file=sys.stderr)
        return _fetch_elevations_open_meteo(coords)
    return _fetch_elevations_usgs(coords)
    return elevations


# ---------------------------------------------------------------------------
# GPX I/O
# ---------------------------------------------------------------------------

def gpx_to_coords(path):
    """Read (lat, lng) and elevation from an existing GPX file.

    Returns (coords, elevations) where elevations[i] may be None.
    """
    with open(path) as f:
        gpx = gpxpy.parse(f)
    coords = []
    elevations = []
    for track in gpx.tracks:
        for segment in track.segments:
            for pt in segment.points:
                coords.append((pt.latitude, pt.longitude))
                elevations.append(pt.elevation)
    if not coords:
        for route in gpx.routes:
            for pt in route.points:
                coords.append((pt.latitude, pt.longitude))
                elevations.append(pt.elevation)
    if not coords:
        raise ValueError(f"No track or route points found in {path}")
    return coords, elevations


def compute_distance_mi(coords):
    """Compute route distance in miles using haversine."""
    total = 0.0
    for i in range(1, len(coords)):
        lat1, lon1 = math.radians(coords[i - 1][0]), math.radians(coords[i - 1][1])
        lat2, lon2 = math.radians(coords[i][0]), math.radians(coords[i][1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        total += 3958.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return total


def write_rcr_gpx(coords, elevations, route_id, route_name, output_path, map_url=None):
    """Write a GPX file in the RCR project format."""
    distance_mi = compute_distance_mi(coords)
    today = date.today().isoformat()
    ext_lines = []
    if map_url:
        ext_lines.append(f"      <rcr:map>{map_url}</rcr:map>")
    ext_lines.append(f"      <rcr:last_updated>{today}</rcr:last_updated>")
    extensions_block = "\n".join(ext_lines)
    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" '
        'creator="Race Condition Running" '
        'xmlns:rcr="http://raceconditionrunning.com/extensions">',
        "  <metadata>",
        f"    <name>{route_id}</name>",
        f"    <desc>{route_name} ({distance_mi:.1f} mi)</desc>",
        f'    <link href="https://raceconditionrunning.com/routes/{route_id}">',
        f"      <text>Race Condition Running: {route_name}</text>",
        "    </link>",
        "    <author>",
        "      <name>Race Condition Running</name>",
        '      <link href="https://raceconditionrunning.com">',
        "        <text>Race Condition Running</text>",
        "      </link>",
        "    </author>",
        "    <extensions>",
        extensions_block,
        "    </extensions>",
        "  </metadata>",
        "  <trk>",
        f"    <name>{route_id}</name>",
        f"    <desc>{route_name} ({distance_mi:.1f} mi)</desc>",
        "    <trkseg>",
    ]
    for (lat, lng), ele in zip(coords, elevations):
        lines.append(
            f'      <trkpt lat="{lat:.5f}" lon="{lng:.5f}">'
            f"<ele>{ele:.2f}</ele></trkpt>"
        )
    lines.extend(["    </trkseg>", "  </trk>", "</gpx>"])
    with open(output_path, "w") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# High-level conversions
# ---------------------------------------------------------------------------

def url_to_gpx(url, route_id, route_name, output_path, map_url=None):
    """Convert an OnTheGoMap URL (short or long) to an RCR-format GPX file.

    Fetches elevation from USGS 3DEP (falls back to Open-Meteo). If map_url
    is not given, auto-generates a short URL. Returns the list of (lat, lng) coords.
    """
    coords = url_to_coords(url)
    print(f"  decoded {len(coords)} track points")
    print(f"Fetching elevation for {len(coords)} point(s)...")
    elevations = fetch_elevations(coords)
    if not map_url:
        parsed = urllib.parse.urlparse(url)
        if parsed.path.startswith("/s/"):
            map_url = url
        else:
            print("Generating short URL for map link...")
            map_url = long_to_short_url(url)
            print(f"  {map_url}")
    write_rcr_gpx(coords, elevations, route_id, route_name, output_path, map_url)
    return coords


def gpx_to_url(gpx_path, short=False):
    """Convert a GPX file to an OnTheGoMap URL.

    If short=True, returns a shortened URL; otherwise returns the full URL.
    """
    coords, _ = gpx_to_coords(gpx_path)
    long_url = coords_to_url(coords)
    if short:
        return long_to_short_url(long_url)
    return long_url
