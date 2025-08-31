import argparse
import pathlib
from collections import defaultdict

import osmnx as ox
import geopandas as gpd
from shapely.geometry import LineString, Point
import haversine

import rcr
from normalize_gpx import RogueRouteError


def classify_surface_material(surface_tag):
    """Classify OSM surface tags by material type (paved vs unpaved)"""
    if not surface_tag or surface_tag == '':
        return 'unknown'

    surface_tag = surface_tag.lower()

    # Paved surfaces
    paved_surfaces = {
        'asphalt', 'concrete', 'paved', 'paving_stones', 'sett', 'cobblestone',
        'brick', 'metal', 'cement', 'rubber', 'artificial_turf'
    }

    # Unpaved surfaces
    unpaved_surfaces = {
        'dirt', 'earth', 'grass', 'gravel', 'ground', 'mud', 'sand', 'soil',
        'unpaved', 'compacted', 'fine_gravel', 'pebblestone', 'rock', 'stone',
        'crushed_limestone', 'woodchips', 'bark', 'mulch', 'wood'
    }

    if surface_tag in paved_surfaces:
        return 'paved'
    elif surface_tag in unpaved_surfaces:
        return 'unpaved'
    else:
        return 'unknown'


def classify_infrastructure_type(highway_tag, surface_tag):
    """Classify OSM highway tags by infrastructure type"""
    if not highway_tag:
        return 'unknown'

    highway_tag = highway_tag.lower()

    # Streets (roads for vehicles)
    street_highways = {
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'unclassified', 'residential', 'service', 'motorway_link',
        'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
        'living_street'
    }

    # Trails (paths, off-road routes)
    trail_highways = {
        'path', 'track', 'bridleway', 'cycleway'
    }

    # Sidewalks (pedestrian infrastructure)
    sidewalk_highways = {
        'footway', 'pedestrian', 'steps', 'corridor'
    }

    # Special case: footway with gravel surface is a trail
    if highway_tag.lower() == 'footway' and surface_tag and surface_tag.lower() == 'gravel':
        return 'trail'

    if highway_tag.lower() == 'steps' and surface_tag and surface_tag.lower() in ['wood', 'ground', 'gravel']:
        return 'trail'

    if highway_tag in street_highways:
        return 'street'
    elif highway_tag in trail_highways:
        return 'trail'
    elif highway_tag in sidewalk_highways:
        return 'sidewalk'
    else:
        return 'unknown'


def infer_material_from_highway(highway_tag):
    """Infer likely surface material from highway type when surface tag is missing"""
    if not highway_tag:
        return 'unknown'

    highway_tag = highway_tag.lower()

    # Usually paved
    usually_paved = {
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'unclassified', 'residential', 'living_street', 'footway',
        'pedestrian', 'steps', 'corridor', 'cycleway'
    }

    # Usually unpaved
    usually_unpaved = {
        'path', 'track', 'bridleway'
    }

    # Service roads can be either

    if highway_tag in usually_paved:
        return 'paved'
    elif highway_tag in usually_unpaved:
        return 'unpaved'
    else:
        return 'unknown'


def classify_stairs(highway_tag):
    """Check if a way has stairs"""
    if not highway_tag:
        return False

    highway_tag = highway_tag.lower()
    return highway_tag == 'steps'


def classify_way(highway_tag, surface_tag):
    """Classify a way into material, infrastructure, and stairs dimensions"""
    # Get material classification
    material = classify_surface_material(surface_tag)
    if material == 'unknown':
        material = infer_material_from_highway(highway_tag)

    # Get infrastructure classification
    infrastructure = classify_infrastructure_type(highway_tag, surface_tag)

    # Get stairs classification
    has_stairs = classify_stairs(highway_tag)

    return material, infrastructure, has_stairs


def get_route_surface_percentages(route_points, street_network, buffer_meters=15):
    """Calculate surface type percentages for a GPX route in both dimensions"""

    # Convert route points to coordinates
    coords = [(point.longitude, point.latitude) for point in route_points]
    route_line = LineString(coords)

    print(f"    Route has {len(coords)} points, line length: {route_line.length:.6f} degrees")

    # Buffer the route to capture nearby ways
    # Use a projected CRS for accurate buffering in meters
    route_gdf = gpd.GeoDataFrame([1], geometry=[route_line], crs='EPSG:4326')
    route_projected = route_gdf.to_crs('EPSG:3857')  # Web Mercator for meters
    buffered_route = route_projected.geometry.iloc[0].buffer(buffer_meters)
    buffered_gdf = gpd.GeoDataFrame([1], geometry=[buffered_route], crs='EPSG:3857')
    buffered_back = buffered_gdf.to_crs('EPSG:4326')

    print(f"    Buffered route area: {buffered_back.geometry.iloc[0].area:.8f} sq degrees")

    # Find intersecting ways
    intersecting_ways = street_network[street_network.intersects(buffered_back.geometry.iloc[0])]

    print(f"    Found {len(intersecting_ways)} intersecting ways out of {len(street_network)} total ways")

    if len(intersecting_ways) == 0:
        print("    No intersecting ways found!")
        return {
            'paved': 0, 'unpaved': 0,
            'street': 0, 'trail': 0, 'sidewalk': 0, 'stairs': 0
        }

    # Calculate distances along route for each surface type
    material_distances = defaultdict(float)
    infrastructure_distances = defaultdict(float)
    stairs_distance = 0
    total_route_length = 0

    # Process route in small segments
    for i in range(len(coords) - 1):
        segment_line = LineString([coords[i], coords[i + 1]])
        segment_length = haversine.haversine(
            (coords[i][1], coords[i][0]),
            (coords[i + 1][1], coords[i + 1][0]),
            unit=haversine.Unit.MILES
        )
        total_route_length += segment_length

        # Find nearby ways for this segment
        segment_gdf = gpd.GeoDataFrame([1], geometry=[segment_line], crs='EPSG:4326')
        segment_projected = segment_gdf.to_crs('EPSG:3857')
        segment_buffered = segment_projected.geometry.iloc[0].buffer(buffer_meters)
        segment_buffered_gdf = gpd.GeoDataFrame([1], geometry=[segment_buffered], crs='EPSG:3857')
        segment_buffered_back = segment_buffered_gdf.to_crs('EPSG:4326')

        nearby_ways = intersecting_ways[intersecting_ways.intersects(segment_buffered_back.geometry.iloc[0])]

        if len(nearby_ways) == 0:
            material_distances['unknown'] += segment_length
            infrastructure_distances['unknown'] += segment_length
            continue

        # Find the closest way to determine surface type
        min_distance = float('inf')
        closest_material = 'unknown'
        closest_infrastructure = 'unknown'
        closest_has_stairs = False

        segment_midpoint = Point((coords[i][0] + coords[i + 1][0]) / 2,
                               (coords[i][1] + coords[i + 1][1]) / 2)

        for idx, way in nearby_ways.iterrows():
            try:
                distance = segment_midpoint.distance(way.geometry)
                if distance < min_distance:
                    min_distance = distance

                    # Classify way in all dimensions
                    highway_tag = way.get('highway', None)
                    surface_tag = way.get('surface', None)
                    material, infrastructure, has_stairs = classify_way(highway_tag, surface_tag)

                    closest_material = material
                    closest_infrastructure = infrastructure
                    closest_has_stairs = has_stairs
            except Exception:
                continue

        material_distances[closest_material] += segment_length
        infrastructure_distances[closest_infrastructure] += segment_length
        if closest_has_stairs:
            stairs_distance += segment_length

    # Convert to percentages
    if total_route_length == 0:
        return {
            'paved': 0, 'unpaved': 0,
            'street': 0, 'trail': 0, 'sidewalk': 0, 'stairs': 0
        }

    percentages = {}

    # Material percentages
    for material_type in ['paved', 'unpaved']:
        percentages[material_type] = round(100 * material_distances[material_type] / total_route_length, 1)

    # Infrastructure percentages
    for infra_type in ['street', 'trail', 'sidewalk']:
        percentages[infra_type] = round(100 * infrastructure_distances[infra_type] / total_route_length, 1)

    # Stairs percentage (tracked separately since it's orthogonal)
    percentages['stairs'] = round(100 * stairs_distance / total_route_length, 1)

    return percentages


def get_route_surface_segments(route_points, street_network, buffer_meters=15):
    """Get detailed surface classification for each route segment"""

    # Convert route points to coordinates
    coords = [(point.longitude, point.latitude) for point in route_points]
    route_line = LineString(coords)

    # Buffer the route to capture nearby ways
    route_gdf = gpd.GeoDataFrame([1], geometry=[route_line], crs='EPSG:4326')
    route_projected = route_gdf.to_crs('EPSG:3857')
    buffered_route = route_projected.geometry.iloc[0].buffer(buffer_meters)
    buffered_gdf = gpd.GeoDataFrame([1], geometry=[buffered_route], crs='EPSG:3857')
    buffered_back = buffered_gdf.to_crs('EPSG:4326')

    # Find intersecting ways
    intersecting_ways = street_network[street_network.intersects(buffered_back.geometry.iloc[0])]

    segments = []

    # Process route in small segments
    for i in range(len(coords) - 1):
        segment_line = LineString([coords[i], coords[i + 1]])
        segment_length = haversine.haversine(
            (coords[i][1], coords[i][0]),
            (coords[i + 1][1], coords[i + 1][0]),
            unit=haversine.Unit.MILES
        )

        # Find nearby ways for this segment
        segment_gdf = gpd.GeoDataFrame([1], geometry=[segment_line], crs='EPSG:4326')
        segment_projected = segment_gdf.to_crs('EPSG:3857')
        segment_buffered = segment_projected.geometry.iloc[0].buffer(buffer_meters)
        segment_buffered_gdf = gpd.GeoDataFrame([1], geometry=[segment_buffered], crs='EPSG:3857')
        segment_buffered_back = segment_buffered_gdf.to_crs('EPSG:4326')

        nearby_ways = intersecting_ways[intersecting_ways.intersects(segment_buffered_back.geometry.iloc[0])]

        if len(nearby_ways) == 0:
            closest_material = 'unknown'
            closest_infrastructure = 'unknown'
            closest_way_name = None
            closest_way_highway = None
            closest_way_surface = None
        else:
            # Find the closest way to determine surface type
            min_distance = float('inf')
            closest_material = 'unknown'
            closest_infrastructure = 'unknown'
            closest_way_name = None
            closest_way_highway = None
            closest_way_surface = None

            segment_midpoint = Point((coords[i][0] + coords[i + 1][0]) / 2,
                                   (coords[i][1] + coords[i + 1][1]) / 2)

            for idx, way in nearby_ways.iterrows():
                try:
                    distance = segment_midpoint.distance(way.geometry)
                    if distance < min_distance:
                        min_distance = distance

                        # Classify way in all dimensions
                        highway_tag = way.get('highway', None)
                        surface_tag = way.get('surface', None)
                        material, infrastructure, has_stairs = classify_way(highway_tag, surface_tag)

                        closest_material = material
                        closest_infrastructure = infrastructure
                        closest_way_name = str(way.get('name', None))
                        closest_way_highway = highway_tag
                        closest_way_surface = surface_tag
                except Exception:
                    continue

        # Store segment details
        segments.append({
            'geometry': segment_line,
            'material': closest_material,
            'infrastructure': closest_infrastructure,
            'length_miles': segment_length,
            'way_name': closest_way_name,
            'way_highway': closest_way_highway,
            'way_surface': closest_way_surface,
            'segment_index': i
        })

    return segments


def create_geojson_from_segments(segments, route_id):
    """Create a GeoJSON FeatureCollection from route segments"""

    features = []

    for segment in segments:
        # Convert LineString to GeoJSON coordinates
        coords = list(segment['geometry'].coords)

        # Create feature
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {
                "route_id": route_id,
                "segment_index": segment['segment_index'],
                "material": segment['material'],
                "infrastructure": segment['infrastructure'],
                "length_miles": round(segment['length_miles'], 4),
                "way_name": segment['way_name'],
                "way_highway": segment['way_highway'],
                "way_surface": segment['way_surface'],
                # Color coding for visualization
                "stroke": get_color_for_surface(segment['material'], segment['infrastructure']),
                "stroke-width": 3,
                "stroke-opacity": 0.8
            }
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }


def get_color_for_surface(material, infrastructure):
    """Get color for surface type visualization"""
    # Primary color based on material
    if material == 'paved':
        if infrastructure == 'street':
            return '#1f77b4'  # Blue - paved street
        elif infrastructure == 'sidewalk':
            return '#ff7f0e'  # Orange - paved sidewalk
        elif infrastructure == 'trail':
            return '#2ca02c'  # Green - paved trail
        else:
            return '#d62728'  # Red - paved unknown
    elif material == 'unpaved':
        if infrastructure == 'street':
            return '#9467bd'  # Purple - unpaved street
        elif infrastructure == 'sidewalk':
            return '#8c564b'  # Brown - unpaved sidewalk
        elif infrastructure == 'trail':
            return '#e377c2'  # Pink - unpaved trail
        else:
            return '#7f7f7f'  # Gray - unpaved unknown
    else:
        return '#bcbd22'  # Olive - unknown material


def get_combined_bounding_box(routes):
    """Calculate bounding box encompassing all routes"""
    all_lats = []
    all_lons = []

    for route in routes:
        for point in route["track"].points:
            all_lats.append(point.latitude)
            all_lons.append(point.longitude)

    return {
        'north': max(all_lats),
        'south': min(all_lats),
        'east': max(all_lons),
        'west': min(all_lons)
    }


def main():
    parser = argparse.ArgumentParser(description="Add surface type percentages to GPX files.")
    parser.add_argument("--input", required=True, nargs="+", help="Input GPX file(s).")
    parser.add_argument("--output", required=True, nargs="+", help="Output GPX file(s).")
    parser.add_argument("--geojson", help="Generate GeoJSON with surface classifications for visualization")
    args = parser.parse_args()

    if len(args.input) != len(args.output):
        raise ValueError("The number of inputs must match the number of outputs.")

    # Add surface tag to the list of tags OSMNX fetches
    ox.settings.useful_tags_way += ['surface']

    # Load all routes first to calculate combined bounding box
    print("Loading routes...")
    routes = []
    for inpath in args.input:
        route = rcr.load_route(pathlib.Path(inpath))
        if route['path'].name != f"{route['id']}.gpx":
            raise RogueRouteError(f"Route path mismatch: {route['path']} vs {route['id']}.gpx")
        routes.append(route)

    # Get combined bounding box
    bbox = get_combined_bounding_box(routes)
    print(f"Combined bounding box: N={bbox['north']:.4f}, S={bbox['south']:.4f}, E={bbox['east']:.4f}, W={bbox['west']:.4f}")

    # Download street network for entire area
    print("Downloading street network from OSM...")
    try:
        G = ox.graph_from_bbox(
            (bbox['east'], bbox['south'], bbox['west'], bbox['north']),
            network_type='all',  # Include all way types
            simplify=False,      # Keep all nodes for accuracy
            retain_all=True     # Keep disconnected components
        )

        # Convert to GeoDataFrame
        edges = ox.graph_to_gdfs(G, nodes=False, edges=True)
        print(f"Downloaded {len(edges)} street segments")

    except Exception as e:
        print(f"Error downloading network: {e}")
        print("Falling back to individual route processing...")
        edges = None

    # Process each route
    all_geojson_features = []

    for i, (route, outpath) in enumerate(zip(routes, args.output)):
        print(f"Processing route {i+1}/{len(routes)}: {route['id']}")

        # If we couldn't get the combined network, try individual route
        route_edges = edges
        if route_edges is None:
            try:
                route_points = route["track"].points
                route_coords = [(p.longitude, p.latitude) for p in route_points]
                route_line = LineString(route_coords)
                bounds = route_line.bounds  # minx, miny, maxx, maxy

                route_G = ox.graph_from_bbox(
                    (bounds[3], bounds[1], bounds[0], bounds[2]),                # east south west north
                    network_type='all',
                    simplify=False,
                    retain_all=True
                )
                route_edges = ox.graph_to_gdfs(route_G, nodes=False, edges=True)
            except Exception as e:
                print(f"Error processing {route['id']}: {e}")
                continue

        # Calculate surface percentages
        surface_percentages = get_route_surface_percentages(route["track"].points, route_edges)

        print(f"  Material - Paved: {surface_percentages['paved']}%, Unpaved: {surface_percentages['unpaved']}%")
        print(f"  Infrastructure - Street: {surface_percentages['street']}%, Trail: {surface_percentages['trail']}%, Sidewalk: {surface_percentages['sidewalk']}%, Stairs: {surface_percentages['stairs']}%")

        # Add surface tags to existing GPX and write
        add_surface_tags_to_gpx(args.input[i], outpath, surface_percentages)

        # Generate GeoJSON segments if requested
        if args.geojson:
            segments = get_route_surface_segments(route["track"].points, route_edges)
            route_geojson = create_geojson_from_segments(segments, route['id'])
            all_geojson_features.extend(route_geojson['features'])

    # Write combined GeoJSON if requested
    if args.geojson and all_geojson_features:
        import json
        combined_geojson = {
            "type": "FeatureCollection",
            "features": all_geojson_features
        }

        with open(args.geojson, 'w') as f:
            json.dump(combined_geojson, f, indent=2)

        print(f"GeoJSON saved to {args.geojson} with {len(all_geojson_features)} segments")


def add_surface_tags_to_gpx(input_path, output_path, surface_percentages):
    """Add surface percentage tags to existing GPX file via string manipulation"""
    with open(input_path, 'r') as f:
        gpx_content = f.read()

    # Remove existing surface tags if present
    import re
    surface_tag_patterns = [
        r'      <rcr:surface_paved>.*?</rcr:surface_paved>\n',
        r'      <rcr:surface_unpaved>.*?</rcr:surface_unpaved>\n',
        r'      <rcr:surface_street>.*?</rcr:surface_street>\n',
        r'      <rcr:surface_trail>.*?</rcr:surface_trail>\n',
        r'      <rcr:surface_sidewalk>.*?</rcr:surface_sidewalk>\n',
        r'      <rcr:stairs>.*?</rcr:stairs>\n'
    ]

    for pattern in surface_tag_patterns:
        gpx_content = re.sub(pattern, '', gpx_content)

    # Create surface extension tags (convert percentages to decimals with 3 digits precision)
    surface_tags = f"""      <rcr:surface_paved>{surface_percentages['paved'] / 100:.3f}</rcr:surface_paved>
      <rcr:surface_unpaved>{surface_percentages['unpaved'] / 100:.3f}</rcr:surface_unpaved>
      <rcr:surface_street>{surface_percentages['street'] / 100:.3f}</rcr:surface_street>
      <rcr:surface_trail>{surface_percentages['trail'] / 100:.3f}</rcr:surface_trail>
      <rcr:surface_sidewalk>{surface_percentages['sidewalk'] / 100:.3f}</rcr:surface_sidewalk>
      <rcr:stairs>{surface_percentages['stairs'] / 100:.3f}</rcr:stairs>"""

    # Insert before the closing </extensions> tag
    if '    </extensions>' in gpx_content:
        gpx_content = gpx_content.replace('    </extensions>', f'{surface_tags}\n    </extensions>')
    else:
        # If no extensions section exists, add one before </metadata>
        extensions_section = f"""    <extensions>
{surface_tags}
    </extensions>"""
        gpx_content = gpx_content.replace('  </metadata>', f'{extensions_section}\n  </metadata>')

    # Write to output file
    with open(output_path, 'w') as f:
        f.write(gpx_content)


if __name__ == '__main__':
    main()