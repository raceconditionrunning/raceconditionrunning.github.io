#!/usr/bin/env python3

import argparse
import datetime
import glob
import json
import os
import pathlib


import clorm
import xxhash
from clingo.ast import ProgramBuilder, parse_files
from clorm import desc, FactBase
from clorm.clingo import Control

from run_scheduler.domain import Day, SlotAssignment, Exchange, Route, RouteDescent, Objective, \
    RouteAscent, Ascent, Descent, make_standard_func_ctx, \
    PreferredDistanceK, DayDistRangeK, RouteDistanceK, DistancePrecision, DurationPrecision
from run_scheduler.routes import load_routes_from_dir, routes_to_facts, load_exchanges
from run_scheduler.schedule import schedule_to_str


def extract_schedule(facts: clorm.FactBase, distance_precision: float, duration_precision: float):
    RouteDist = RouteDistanceK(distance_precision)
    DayDistRange = DayDistRangeK(distance_precision)
    slot_routes = {slot_num: list(routes) for slot_num, routes in
                       facts.query(SlotAssignment).group_by(SlotAssignment.day).select(SlotAssignment.route_id).all()}
    slot_route_names = {slot_num: list(names) for slot_num, names in
                            facts.query(SlotAssignment, Route).group_by(SlotAssignment.day).join(SlotAssignment.route_id == Route.route_id).select(Route.name).all()}
    slot_route_starts = {slot_num: list(starts) for slot_num, starts in
                            facts.query(SlotAssignment, Route).group_by(SlotAssignment.day).join(SlotAssignment.route_id == Route.route_id).select(Route.start_exchange).all()}
    slot_route_ends = {slot_num: list(ends) for slot_num, ends in
                            facts.query(SlotAssignment, Route).group_by(SlotAssignment.day).join(SlotAssignment.route_id == Route.route_id).select(Route.end_exchange).all()}
    slot_route_dists = {slot_num: list(dists) for slot_num, dists in
                            facts.query(SlotAssignment, RouteDist).group_by(SlotAssignment.day).join(SlotAssignment.route_id == RouteDist.route_id).select(RouteDist.dist).all()}
    slot_dist_range = {slot_num: list(ranges)[0] for slot_num, ranges in
                            facts.query(DayDistRangeK(distance_precision)).group_by(DayDistRange.day).select(DayDistRange.lower, DayDistRange.upper).all()}
    schedule = []
    for i, routes in slot_routes.items():
        details = {}
        details["route_id"] = routes
        details["route_name"] = slot_route_names[i]
        details["start_exchange"] =  slot_route_starts[i]
        details["end_exchange"] =  slot_route_ends[i]
        #details["start_exchange_name"] = exchange_names[exchange_start]
        #details["end_exchange_name"] = exchange_names[exchange_end]
        details["distance_mi"] = slot_route_dists[i]
        details["distance_range"] = slot_dist_range.get(i, (None, None))
        #details["ascent_ft"] = leg_ascent[leg_num]
        #details["descent_ft"] = leg_descent[leg_num]
        schedule.append(details)
    return schedule


def save_solution(passthrough_args, out_dir, start_time, event_name="", file_name="solution", atoms=None):
    out = {**passthrough_args}
    out["startTime"] = start_time.isoformat()
    out["foundTime"] = datetime.datetime.now().isoformat()
    out["computeTime"] = (datetime.datetime.now() - start_time).total_seconds()

    # Create solutions directory if it doesn't exist
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)
    with open(f"{out_dir}/{file_name}.json", "w") as f:
        json.dump(out, f, indent=2)

    if atoms:
        with open(f"{out_dir}/{file_name}.lp", "w") as f:
            for atom in atoms:
                f.write(f"{atom}.\n")


def main(args):
    season = args.season
    routes_dir = args.routes_dir
    save_ground_model = args.save_ground_program
    save_all_models = args.save_all_models
    event_name = season
    out_dir = args.out_dir

    # Clorm's `Control` wrapper will try to parse model facts into the predicates defined in domain.py.
    ctrl = Control(
        unifier=[Day, DayDistRangeK(args.distance_precision), SlotAssignment, RouteDistanceK(args.distance_precision), Exchange, Route,
                 RouteAscent, RouteDescent, Objective, Ascent, Descent, PreferredDistanceK(args.distance_precision)])
    # Makes exceptions inscrutable. Disable if you need to debug
    ctrl.configuration.solve.parallel_mode = "4,split"
    ctrl.configuration.solve.opt_mode = "optN"
    with ProgramBuilder(ctrl) as b:
        # All ASP files in the season dir
        year_files = glob.glob(f"{season}/*.lp")
        parse_files(
            ["scheduling-domain.lp"] + year_files,
        lambda ast: b.add(ast))

    # You can supply a bundle of geojson routes and we'll
    # turn them into facts. Otherwise, all the facts
    # need to be in an .lp file in the folder.
    if os.path.isdir(routes_dir):
        legs = load_routes_from_dir(routes_dir)
        exchanges = load_exchanges(args.exchanges)
        facts = routes_to_facts(legs, exchanges,distance_precision=args.distance_precision,
                                duration_precision=args.duration_precision)
        facts += [DistancePrecision(str(args.distance_precision)), DurationPrecision(str(args.duration_precision))]
        ctrl.add_facts(FactBase(facts))
    print("Starting grounding at", datetime.datetime.now())
    ctrl.ground([("base", [])], context=make_standard_func_ctx())
    if save_ground_model:
        with open("program.lp", 'w') as f:
            for atom in ctrl.symbolic_atoms:
                f.write(f"{atom.symbol}.\n")
    solve_start_time = datetime.datetime.now()
    if not out_dir:
        out_dir = out_dir = f"solutions/{event_name}_{solve_start_time.isoformat().replace(':', '_')}"
    print("Starting solve at", solve_start_time)
    model_id = 0
    first_optimal_id = None
    def on_model(model):
        nonlocal model_id
        nonlocal first_optimal_id
        facts = model.facts(atoms=True)
        # This hash should only be used for comparing solutions generated using the same version/dependencies. Clorm
        # may change its string representation in the future, and the facts for a solution depend on the Python
        # bindings for the predicates that we've specified.
        factbase_hash = xxhash.xxh64_hexdigest(facts.asp_str(sorted=True))
        objective_names = list(facts.query(Objective).order_by(desc(Objective.index)).select(Objective.name).all())
        schedule = extract_schedule(facts, args.distance_precision, args.duration_precision)
        print(schedule_to_str(schedule))
        costs = dict((zip(objective_names, model.cost)))
        print(costs)
        file_name = "solution"
        if save_all_models:
            file_name = f"{model_id}"
        elif model.optimality_proven:
            if not first_optimal_id:
                first_optimal_id = model_id
            file_name += f"_{model_id - first_optimal_id}"
        save_solution({
            "costs": costs,
            "distance_precision": args.distance_precision,
            "duration_precision": args.duration_precision,
            #"elevation_precision": args.elevation_precision,
            "optimal": model.optimality_proven,
            "schedule": schedule,
            "hash": factbase_hash
        },
            out_dir,
            solve_start_time, event_name, file_name, atoms=model.symbols(atoms=True))

        model_id += 1

    ctrl.solve(on_model=on_model)
    print("Finished solve at", datetime.datetime.now())
    print("Elapsed time:", datetime.datetime.now() - solve_start_time)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    asp_subdir_paths = glob.glob("*/*.lp")
    subdirs = set([str(pathlib.Path(p).parent) for p in asp_subdir_paths])
    parser.add_argument("season", choices=subdirs, help="Path to directory containing season-specific .lp files")
    parser.add_argument("routes_dir", type=pathlib.Path, help="Path to directory containing route geojson files")
    parser.add_argument("exchanges", type=pathlib.Path, help="Path to file containing exchange metadata")
    parser.add_argument("--out-dir", type=pathlib.Path, help="Path to directory to save solutions")
    parser.add_argument("--save-all-models", action="store_true", help="Save all (even non-optimal) models found while solving")
    parser.add_argument("--save-ground-program", action="store_true", help="Store the ground program to 'program.lp'. Use to debug lengthy ground-times, and to see which rules cause your domain to grow")
    parser.add_argument("--distance-precision", default=2.0, type=float, help="Number of decimal places of fixed precision to convert distance terms to")
    # Not implemented yet. Consider implementing if using elevation/duration optimization criteria heavily and programs are too big.
    #parser.add_argument("--elevation-precision", default=0.0, type=float, help="Number of decimal places of fixed precision to convert elevation terms to")
    parser.add_argument("--duration-precision", default=0.0, type=float, help="Number of decimal places of fixed precision to convert distance terms to")
    args = parser.parse_args()
    main(args)
