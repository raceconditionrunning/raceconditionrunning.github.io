#!/usr/bin/env python3

"""
Pretty print a schedule from a solution JSON file.
"""

import argparse
import json

from run_scheduler.schedule import schedule_to_str


def main(args):
    solution_path = args.solution_json
    with open(solution_path) as f:
        solution = json.load(f)
    costs = solution["costs"].items()
    schedule = solution["schedule"]
    print(schedule_to_str(schedule))
    print(costs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("solution_json", type=str)
    args = parser.parse_args()
    main(args)
