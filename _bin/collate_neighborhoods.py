"""
The neighborhoods.geojson file is a combination of Seattle's neighborhood map with boundary information from other
nearby cities we run through. It is used to determine the neighborhoods that a route passes through, which shows
up in the routes table and in keywords attached to each route's webpage.

We track the output in the repo because it changes so infrequently. Modify this script if you're changing up the way
we handle neighborhoods or if you want to add new cities to the list.
"""

import json
import requests
from typing import Any, Dict, List
from shapely.geometry import Polygon, MultiPolygon
import haversine

# Configuration constants
SEATTLE_NEIGHBORHOODS_ATLAS = "https://hub.arcgis.com/api/v3/datasets/b4a142f592e94d39a3bf787f3c112c1d_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"
WA_CITY_BOUNDARIES = "https://hub.arcgis.com/api/v3/datasets/69fcb668dc8d49ea8010b6e33e42a13a_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"

# Seattle center coordinates (Space Needle area)
SEATTLE_CENTER = (-122.3493, 47.6205)

# Processing parameters
COORDINATE_PRECISION = 6
RDP_TOLERANCE = 0.0001
MAX_DISTANCE_MILES = 30

# Whitespace characters end up being around half the file size if we do normal indentation for coordinates arrays
def dump_geojson_with_compact_geometry(geojson, f):
    if geojson.get("type") == "FeatureCollection":
        # Handle FeatureCollection
        f.write('{\n  "type": "FeatureCollection",\n  "features": [\n')

        features = geojson.get("features", [])
        for i, feature in enumerate(features):
            # Write each feature with compact geometry
            f.write('    ')
            dump_feature_with_compact_geometry(feature, f, indent='    ')
            if i < len(features) - 1:
                f.write(',')
            f.write('\n')

        f.write('  ]\n}')
    else:
        # Handle single feature
        dump_feature_with_compact_geometry(geojson, f)


def dump_feature_with_compact_geometry(feature, f, indent=''):
    # Create a copy of the feature without the geometry
    feature_copy = feature.copy()
    geometry = feature_copy.pop('geometry', None)

    # Dump the feature without geometry
    feature_json = json.dumps(feature_copy, indent=2)
    if indent:
        # Add indentation to each line
        indented_lines = []
        for line in feature_json.split('\n'):
            if line.strip():
                indented_lines.append(indent + line)
            else:
                indented_lines.append('')
        feature_json = '\n'.join(indented_lines)

    f.write(feature_json[:-2])  # Remove the closing `}`

    # Add the compact geometry inside the feature
    if geometry:
        compact_geometry = json.dumps(geometry, separators=(',', ':'))
        f.write(f',\n{indent}  "geometry": {compact_geometry}\n{indent}}}')
    else:
        f.write(f'\n{indent}}}')



def _round_coords(coords_ring):
    """Helper to round coordinate precision in a coordinate ring."""
    return [[round(x, COORDINATE_PRECISION), round(y, COORDINATE_PRECISION)] for x, y in coords_ring]


def _polygon_to_geojson_coords(polygon):
    """Convert a Shapely polygon to GeoJSON coordinates with precision rounding."""
    exterior_coords = _round_coords(polygon.exterior.coords)
    holes_coords = [_round_coords(interior.coords) for interior in polygon.interiors]
    return [exterior_coords] + holes_coords


def simplify_geometry_rdp(geometry: Dict[str, Any], tolerance: float = RDP_TOLERANCE) -> Dict[str, Any]:
    """
    Simplify a GeoJSON geometry using Ramer-Douglas-Peucker algorithm with precision reduction.
    """
    if geometry.get("type") == "Polygon":
        coords = geometry["coordinates"]
        if coords:
            shapely_poly = Polygon(coords[0], holes=coords[1:] if len(coords) > 1 else None)
            simplified = shapely_poly.simplify(tolerance, preserve_topology=True)

            if isinstance(simplified, Polygon):
                return {
                    "type": "Polygon",
                    "coordinates": _polygon_to_geojson_coords(simplified)
                }
            elif isinstance(simplified, MultiPolygon):
                # If simplification resulted in MultiPolygon, take the largest part
                largest_poly = max(simplified.geoms, key=lambda p: p.area)
                return {
                    "type": "Polygon",
                    "coordinates": _polygon_to_geojson_coords(largest_poly)
                }

    elif geometry.get("type") == "MultiPolygon":
        coords = geometry["coordinates"]
        simplified_polygons = []

        for poly_coords in coords:
            if poly_coords:
                shapely_poly = Polygon(poly_coords[0], holes=poly_coords[1:] if len(poly_coords) > 1 else None)
                simplified = shapely_poly.simplify(tolerance, preserve_topology=True)

                if isinstance(simplified, Polygon):
                    simplified_polygons.append(_polygon_to_geojson_coords(simplified))
                elif isinstance(simplified, MultiPolygon):
                    for geom in simplified.geoms:
                        simplified_polygons.append(_polygon_to_geojson_coords(geom))

        return {
            "type": "MultiPolygon",
            "coordinates": simplified_polygons
        }

    # Return unchanged for non-polygon geometries
    return geometry


def simplify_boundaries(geojson_data: Dict[str, Any], tolerance: float = RDP_TOLERANCE) -> Dict[str, Any]:
    """
    Apply RDP simplification to all boundaries in a FeatureCollection.
    """
    if geojson_data.get("type") == "FeatureCollection":
        for feature in geojson_data.get("features", []):
            if "geometry" in feature:
                feature["geometry"] = simplify_geometry_rdp(feature["geometry"], tolerance)

    return geojson_data




def get_geometry_centroid(geometry: Dict[str, Any]) -> tuple[float, float]:
    """
    Get the centroid of a GeoJSON geometry using Shapely.
    Returns (longitude, latitude).
    """
    if geometry.get("type") == "Polygon":
        coords = geometry["coordinates"]
        if coords:
            shapely_poly = Polygon(coords[0], holes=coords[1:] if len(coords) > 1 else None)
            centroid = shapely_poly.centroid
            return (centroid.x, centroid.y)

    elif geometry.get("type") == "MultiPolygon":
        coords = geometry["coordinates"]
        polygons = []
        for poly_coords in coords:
            if poly_coords:
                shapely_poly = Polygon(poly_coords[0], holes=poly_coords[1:] if len(poly_coords) > 1 else None)
                polygons.append(shapely_poly)

        if polygons:
            # Create MultiPolygon and get centroid
            from shapely.geometry import MultiPolygon as ShapelyMultiPolygon
            multi_poly = ShapelyMultiPolygon(polygons)
            centroid = multi_poly.centroid
            return (centroid.x, centroid.y)

    # Fallback: return Seattle center if we can't calculate centroid
    return SEATTLE_CENTER


def fetch_wa_city_boundaries() -> Dict[str, Any]:
    """
    Fetch Washington state city boundaries from the official source.
    """
    response = requests.get(WA_CITY_BOUNDARIES)
    response.raise_for_status()
    return response.json()


def merge_duplicate_cities(city_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge city features with the same CITY_DISSOLVE value into single MultiPolygon entries.
    """
    city_groups = {}
    
    for feature in city_data.get("features", []):
        props = feature.get("properties", {})
        city_name = props.get("CITY_DISSOLVE", "").strip()
        
        if city_name:
            if city_name not in city_groups:
                city_groups[city_name] = {
                    "properties": props,
                    "geometries": []
                }
            
            geometry = feature.get("geometry")
            if geometry:
                city_groups[city_name]["geometries"].append(geometry)
    
    # Create merged features
    merged_features = []
    for city_name, city_data in city_groups.items():
        geometries = city_data["geometries"]
        
        if len(geometries) == 1:
            # Single geometry, keep as is
            merged_geometry = geometries[0]
        else:
            # Multiple geometries, create MultiPolygon
            all_coords = []
            
            for geom in geometries:
                if geom.get("type") == "Polygon":
                    all_coords.append(geom["coordinates"])
                elif geom.get("type") == "MultiPolygon":
                    all_coords.extend(geom["coordinates"])
            
            merged_geometry = {
                "type": "MultiPolygon",
                "coordinates": all_coords
            }
        
        merged_feature = {
            "type": "Feature",
            "properties": city_data["properties"],
            "geometry": merged_geometry
        }
        merged_features.append(merged_feature)
    
    return {
        "type": "FeatureCollection",
        "features": merged_features
    }


def filter_city_boundaries(city_data: Dict[str, Any], exclude_cities: List[str] = None, max_distance_miles: float = 50) -> Dict[str, Any]:
    """
    Filter city boundaries, excluding specified cities and those beyond max distance from Seattle.
    """
    if exclude_cities is None:
        exclude_cities = []

    exclude_cities_lower = [city.lower() for city in exclude_cities]
    filtered_features = []
    seattle_lon, seattle_lat = SEATTLE_CENTER

    for feature in city_data.get("features", []):
        props = feature.get("properties", {})
        city_name = props.get("CITY_DISSOLVE", "").strip()

        # Skip if city is in exclude list
        if city_name.lower() in exclude_cities_lower:
            continue

        # Calculate distance from Seattle center
        geometry = feature.get("geometry")
        if geometry:
            city_lon, city_lat = get_geometry_centroid(geometry)
            distance = haversine.haversine((seattle_lat, seattle_lon), (city_lat, city_lon), unit=haversine.Unit.MILES)

            # Skip if city is too far from Seattle
            if distance > max_distance_miles:
                continue

        # Add S_HOOD and L_HOOD properties
        feature["properties"]["S_HOOD"] = city_name
        feature["properties"]["L_HOOD"] = city_name
        feature["properties"]["source"] = "wa_state"

        filtered_features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": filtered_features
    }


def fetch_seattle_neighborhoods() -> Dict[str, Any]:
    """
    Fetch Seattle neighborhood map as GeoJSON from the official source.
    """
    response = requests.get(SEATTLE_NEIGHBORHOODS_ATLAS)
    response.raise_for_status()
    return response.json()


def combine_geojson_features(seattle_data: Dict[str, Any], city_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Combine Seattle neighborhood data with WA state city boundary data.
    """
    combined_features = []

    # Add Seattle features
    if seattle_data.get("features"):
        combined_features.extend(seattle_data["features"])

    # Add city features
    if city_data.get("features"):
        combined_features.extend(city_data["features"])

    return {
        "type": "FeatureCollection",
        "features": combined_features
    }


def main():
    """
    Main function to retrieve Seattle neighborhood map, WA city boundaries,
    and combine them with reduced precision.
    """
    print("Fetching Seattle neighborhood map...")
    seattle_data = fetch_seattle_neighborhoods()

    print("Simplifying Seattle boundaries with RDP algorithm and reducing precision...")
    seattle_data = simplify_boundaries(seattle_data)

    print("Fetching WA state city boundaries...")
    city_data = fetch_wa_city_boundaries()

    print("Merging duplicate city entries...")
    city_data = merge_duplicate_cities(city_data)

    print(f"Filtering out Seattle city and cities beyond {MAX_DISTANCE_MILES} miles...")
    city_data = filter_city_boundaries(city_data, exclude_cities=["Seattle"], max_distance_miles=MAX_DISTANCE_MILES)

    print("Simplifying city boundaries with RDP algorithm and reducing precision...")
    city_data = simplify_boundaries(city_data)

    print("Combining Seattle neighborhoods and city boundaries...")
    combined_data = combine_geojson_features(seattle_data, city_data)

    # Save combined neighborhoods file
    combined_output = "neighborhoods_combined.geojson"
    with open(combined_output, 'w') as f:
        dump_geojson_with_compact_geometry(combined_data, f)

    print(f"Combined neighborhoods saved to {combined_output}")
    print(f"Total features count: {len(combined_data.get('features', []))}")
    print(f"  - Seattle neighborhood features: {len(seattle_data.get('features', []))}")
    print(f"  - WA city boundary features: {len(city_data.get('features', []))}")


if __name__ == "__main__":
    main()