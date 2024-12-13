import math

import gpxpy.gpx
import haversine
from gpxpy.gpx import GPXTrackPoint
from typing import List, Callable


def compute_route_metrics(track: gpxpy.gpx.GPXTrack):
    # gpxpy's built in methods have smoothing built in and use simple distance (haversine is much slower and not important for our scale)
    # _ = route["track"].length_3d() / 1609.34
    # computed_ascent, computed_descent = track.get_uphill_downhill()
    lls = track.points
    computed_dist = sum([haversine.haversine((lls[i].latitude, lls[i].longitude), (lls[i+1].latitude, lls[i+1].longitude), unit=haversine.Unit.MILES) for i in range(len(lls) - 1)])
    elevations = [ll.elevation if ll.elevation else 0 for ll in lls]
    computed_ascent = sum([max(0., elevations[i+1] - elevations[i])for i in range(len(lls) - 1)])
    computed_descent = sum([max(0., elevations[i] - elevations[i+1]) for i in range(len(lls) - 1)])

    obness = out_and_backness(lls)
    start_end_same = haversine.haversine((lls[0].latitude, lls[0].longitude), (lls[-1].latitude, lls[-1].longitude), unit=haversine.Unit.MILES) < 0.1
    if obness > .6 and start_end_same:
        type = "OB"
    elif start_end_same:
        type = "Loop"
    else:
        type = "P2P"
    return {"distance_mi": computed_dist, "ascent_m": computed_ascent, "descent_m": computed_descent, "type": type, "out-and-backness": obness}


def get_nearest_loc(locs, lat, lon):
    nearest = None
    nearest_dist = math.inf
    for loc in locs:
        dist = haversine.haversine((lat, lon), (loc['lat'], loc['lon']), unit=haversine.Unit.MILES)
        if dist < nearest_dist:
            nearest = loc
            nearest_dist = dist
    return nearest['id'], nearest_dist


def out_and_backness(route: list[GPXTrackPoint]):
    # Calculate cumulative distances
    cumulative_distances = [0]
    for i in range(1, len(route)):
        cumulative_distances.append(
            cumulative_distances[-1] + haversine.haversine((route[i-1].latitude, route[i-1].longitude),
                                                 (route[i].latitude, route[i].longitude))
        )

    total_distance = cumulative_distances[-1]
    half_distance = total_distance / 2

    # Find the point closest to half the total distance
    midpoint_index = min(
        range(len(cumulative_distances)),
        key=lambda i: abs(cumulative_distances[i] - half_distance),
    )

    # Split the route into two halves
    first_half = route[:midpoint_index + 1]
    second_half = route[midpoint_index + 1:]

    # Calculate the proportion of points in second_half with a nearby point in first_half
    count_within_threshold = 0
    threshold = 0.1  # 0.1 miles

    for point2 in second_half:
        point2_tuple = (point2.latitude, point2.longitude)
        # Find the shortest distance to any point in the first half
        min_distance = min(
            haversine.haversine(point2_tuple, (point1.latitude, point1.longitude)) for point1 in first_half
        )
        if min_distance < threshold:
            count_within_threshold += 1

    if len(second_half) == 0:
        return 0  # Avoid division by zero in degenerate cases
    return count_within_threshold / len(second_half)


def calculate_bounding_box(geometry):
    # MultiPolygon: geometry is a list of polygons
    min_x = min(point[0] for polygon in geometry for point in polygon[0])
    max_x = max(point[0] for polygon in geometry for point in polygon[0])
    min_y = min(point[1] for polygon in geometry for point in polygon[0])
    max_y = max(point[1] for polygon in geometry for point in polygon[0])

    return min_x, max_x, min_y, max_y


def is_point_in_polygon(x, y, geometry):
    inside = False

    for rings in geometry:
        polygon = rings[0]
        for i in range(1, len(polygon)):
            if ((polygon[i - 1][1] > y) != (polygon[i][1] > y)) and \
                    (x < (polygon[i][0] - polygon[i - 1][0]) * (y - polygon[i - 1][1]) / (polygon[i][1] - polygon[i - 1][1]) + polygon[i - 1][0]):
                inside = not inside
        if inside:
            return True
    return False


def is_point_in_bbox(x, y, bbox):
    return bbox[0] <= x <= bbox[1] and bbox[2] <= y <= bbox[3]
