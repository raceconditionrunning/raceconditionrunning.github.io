% How many days you want to plan for (e.g. 12 weekends, so 3 months of long runs)
day(1..12).

% Lower and upper bounds for the total distance of the routes assigned to a day.
% The solver can change the precision of distances, so we have to check for the configuration
% in the distancePrecision predicate and pass it back to the Python side via the @k macro.
dayDistRange(1..12, @k(12, K),@k(17, K)) :- distancePrecision(K).

% Allowable slots for each day
daySlot(1..2).

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Objectives
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Lexicographic optimization. Objectives from most to least important. Reorder or remove objectives here
objective(
    1, "exchange-diversity";
    2, "split-route-mix";
    3, "week-to-week-exchange-diversity"
).


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Generate
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Each slot-index gets (or does not get) a route
0{
   slotAssignment(D, S, R): route(R)
}1 :- day(D), daySlot(S).

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Schedule constraints
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


% Each slot gets at least one route
:- day(D), #count{S: slotAssignment(D, S, R)} < 1.

% Ensure uniqueness of indices within slots: each index in a slot is assigned to at most one route.
% Our generation step ensures this, but we enforce incase user pins assignments.
:- slotAssignment(D, S, R1), slotAssignment(D, S, R2), R1 != R2, day(D).

% Ensure that we assign indices sequentially:
% count of indices in a slot is the same as max slot index
:- IndexCount != MaxIndex, day(D), IndexCount=#count{S: slotAssignment(D, S, R), daySlot(S)},  MaxIndex=#max{S: slotAssignment(D, S, R), daySlot(S)}.

% Don't repeat routes across the schedule
% -- Across days (allows repeats within a day)
:- slotAssignment(D1, _, R), slotAssignment(D2, _, R), D1 != D2.
% -- Across slots (allows repeats on different days)
:- slotAssignment(D, S1, R), slotAssignment(D, S2, R), S1 != S2.

% The total distance of the routes assigned to a slot must be within the slot's distance range
:- dayDistRange(D, Min, Max), Total > Max, Total = #sum{Distance: routeDistance(R,Distance), slotAssignment(D, S, R), daySlot(S)}, day(D).
:- dayDistRange(D, Min, Max), Total < Min, Total = #sum{Distance: routeDistance(R,Distance), slotAssignment(D, S, R), daySlot(S)}, day(D).

% Subsequent indices must start where previous ended
:- slotAssignment(D, S1, R1), slotAssignment(D, S2, R2), S2 = S1 + 1, R1End != R2Start, route(R1, _, _, R1End), route(R2, _, R2Start, _).

