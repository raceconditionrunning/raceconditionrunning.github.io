import csv
import json
import pathlib
from glob import glob

import clingo
import clorm
import os
import haversine

from run_scheduler.domain import RouteDistanceK, Ascent, Exchange, RoutePairDistanceK, Descent, Route, \
    ExchangePairDistanceK


def load_exchanges(exchange_filename: pathlib.Path):
    exchanges = {}
    with open(exchange_filename, 'r') as f:
        exchange_data = csv.DictReader(f)
        for exchange in exchange_data:
            exchanges[exchange["id"]] = {"name": exchange["name"], "id": exchange["id"]}
    return exchanges


def load_routes_from_dir(dir_path: pathlib.Path):
    routes = []

    for route_filename in glob(os.path.join(dir_path, "*.geojson")):
        # Load the route and metadata
        with open(route_filename) as f:
            route_data = json.load(f)
        title = route_data["properties"]["name"]
        route = {
            'title': title,
            'id': route_data["properties"]["id"],
            'distance_mi': float(route_data["properties"]["dist"]),
            'ascent_ft': int(route_data["properties"]["up"]),
            'descent_ft': int(route_data["properties"]["down"] if route_data["properties"]["down"] else -1),
            'start_exchange': route_data["properties"]["start"],
            'end_exchange': route_data["properties"]["end"],
            'coordinates': route_data["geometry"]["coordinates"],
            'attributes': {
                "type": route_data["properties"]["type"],
                "surface": route_data["properties"]["surface"],
                "deprecated": route_data["properties"]["deprecated"]
            }
        }
        routes.append(route)
    return routes


def flip_lat_long(lat_long_ele_point):
    return (lat_long_ele_point[1], lat_long_ele_point[0], lat_long_ele_point[2])


def routes_to_facts(routes, exchanges, distance_precision, duration_precision):
    facts = []
    Distance = RouteDistanceK(distance_precision)
    exchange_coords = {}
    for route in routes:
        if route["attributes"]["deprecated"]:
            continue
        start_id = exchanges[route["start_exchange"]]["id"]
        end_id = exchanges[route["end_exchange"]]["id"]
        exchange_coords[start_id] = list(reversed(route["coordinates"][0]))
        exchange_coords[end_id] = list(reversed(route["coordinates"][-1]))
        facts.append(Route(route_id=route["id"], name=route["title"], start_exchange=start_id, end_exchange=end_id))
        facts.append(Distance(route_id=route["id"], dist=route["distance_mi"]))
        if route["ascent_ft"] != -1:
            facts.append(Ascent(route_id=route["id"], ascent=round(route["ascent_ft"])))
        if route["descent_ft"] != -1:
            facts.append(Descent(route_id=route["id"], descent=round(route["descent_ft"])))
        for attribute_name in route["attributes"]:
            if not route["attributes"][attribute_name]:
                continue
            # Any special aspects of the leg which you may want to reason about can be shoved into attributes
            attribute_type = clorm.simple_predicate(attribute_name, 2)
            if type(route["attributes"][attribute_name]) == str:
                facts.append(
                    attribute_type(clingo.String(route["id"]), clingo.String(route["attributes"][attribute_name])))
            elif type(route["attributes"][attribute_name]) == int:
                facts.append(
                    attribute_type(clingo.String(route["id"]), clingo.Number(route["attributes"][attribute_name])))

    for exchange_id, attr in exchanges.items():
        facts.append(Exchange(exchange_id=exchange_id, name=attr["name"]))

    # Compute geographic mean of each route by averaging the lat/long of each point
    means = {}
    for route in routes:
        lat_sum = 0
        long_sum = 0
        for coord in route["coordinates"]:
            lat_sum += coord[1]
            long_sum += coord[0]
        means[route["id"]] = ((lat_sum / len(route["coordinates"]), long_sum / len(route["coordinates"])))

    PairDistance = RoutePairDistanceK(distance_precision)
    pairwise_distances = []
    for id1, coord1 in means.items():
        for id2, coord2 in means.items():
            if id1 != id2:
                pairwise_distances.append(
                    (id1, id2, haversine.haversine(coord1[:2], coord2[:2], unit=haversine.Unit.MILES)))
                facts.append(PairDistance(route_a=id1, route_b=id2, dist=pairwise_distances[-1][2]))
                facts.append(PairDistance(route_a=id2, route_b=id1, dist=pairwise_distances[-1][2]))
            else:
                facts.append(PairDistance(route_a=id1, route_b=id2, dist=0))
                facts.append(PairDistance(route_a=id2, route_b=id1, dist=0))

    ExchangeDistance = ExchangePairDistanceK(distance_precision)
    pairwise_distances = []
    for id1, coord1 in exchange_coords.items():
        for id2, coord2 in exchange_coords.items():
            if id1 != id2:
                pairwise_distances.append((id1, id2, haversine.haversine(coord1[:2], coord2[:2], unit=haversine.Unit.MILES)))
                facts.append(ExchangeDistance(exchange_a=id1, exchange_b=id2, dist=pairwise_distances[-1][2]))
                facts.append(ExchangeDistance(exchange_a=id2, exchange_b=id1, dist=pairwise_distances[-1][2]))
            else:
                facts.append(ExchangeDistance(exchange_a=id1, exchange_b=id2, dist=0))
                facts.append(ExchangeDistance(exchange_a=id2, exchange_b=id1, dist=0))
    return facts
