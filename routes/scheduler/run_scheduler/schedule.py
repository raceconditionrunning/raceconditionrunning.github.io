from tabulate import tabulate


def schedule_to_str(schedule):
    rows = []
    for i, slot in enumerate(schedule):
        for j, (route_name, distance, start, end) in enumerate(zip(slot["route_name"], slot["distance_mi"], slot["start_exchange"], slot["end_exchange"])):
            rows.append(["", j + 1, route_name, distance, start, end])
        rows.append([i + 1, "Total", "", sum(slot["distance_mi"]), "", ""])

    return tabulate(rows, headers=["Slot", "Index", "Route", "Distance", "Start", "End"], tablefmt="grid", floatfmt=".1f")
