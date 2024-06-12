#program base.

% Your instance should define day/1, dayDistRange/3 and generate the slotAssignment/2 facts.
% Specify optimization criteria and weights with objective/2.


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Auxiliary predicates
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

route(R) :- route(R, _, _, _).
routeStart(R, Start) :- route(R, _, Start, _).
routeEnd(R, End) :- route(R, _, _, End).

dayAssignmentCount(D, Count) :- day(D), Count = #count { Slot : slotAssignment(D, Slot, _) }.
oneAssignmentDay(Day) :- dayAssignmentCount(Day, 1).
twoAssignmentDay(Day) :- dayAssignmentCount(Day, 2).
oneAssignmentCount(Count) :- Count = #count { Day : oneAssignmentDay(Day) }.
twoAssignmentCount(Count) :- Count = #count { Day : twoAssignmentDay(Day) }.


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Optimization objectives
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Maximize the number of unique starting spots
#maximize { 1@Weight, Start : slotAssignment(_, _, R), route(R, _, Start, _), objective(Weight, "exchange-diversity");
            1@Weight, End : slotAssignment(_, _, R), route(R, _, _, End), objective(Weight, "exchange-diversity") }.

% Maximize the week-to-week pairwise distance between first exchange points
#maximize { Dist@Weight, D1 : exchangePairDistance(Exchange1, Exchange2, Dist), slotAssignment(D1, 1, R1), slotAssignment(D2, 1, R2), routeStart(R1, Exchange1), routeStart(R2, Exchange2), D2 = D1 + 1,  objective(Weight, "week-to-week-exchange-diversity")}.

% Target 1:2 ratio of 1 index to 2 index slots
#minimize { |OneCount * 2 - TwoCount| @Weight : oneAssignmentCount(OneCount), twoAssignmentCount(TwoCount), objective(Weight, "split-route-mix") }.
