# Route Autoschduler Specification

We want to automate the process of scheduling RCR weekend routes for the quarter.

## Inputs

1. $L : [$ Location $]$
2. $R : [$ Route $]$
3. $C : [$ Date $]$
4. $D : $ Date $ \rightarrow ℝ \times ℝ$
5. $P : $ Date $ \rightharpoonup [$ Route $]$

$L$ is the list of locations that routes can start and end at. Each location $l \in L$ includes:
- $l_{transit} : ℝ$, the "cost" to get to the location
  * Locations on the light rail have low cost
  * Other locations in the city have moderate cost
  * Any locations that require a carpool have high cost
- $l_{region} : $ Region, this location's region in the city
    + North Seattle
      * Northgate
      * Roosevelt
    + UW Campus (CSE)
    + Central Seattle
      * Capitol Hill
      * Westlake
    + South Seattle
      * SODO (if not heading west)
      * Beacon Hill
      * Columbia City
    + West Seattle
      * SODO (if heading west)
    + Locks (near Discovery Park)
    + Trail Runs

$R$ is the list of routes that we have available to schedule. Each route $r \in R$ includes:
- $r_{start} : $ Location, starting location 
- $r_{end} : $ Location, ending location
- $r_{dist} : ℝ$ : distance 
- $r_{gain} : ℝ$ : elevation gain
- $r_{loss} : ℝ$ : elevation loss
- $r_{type} : $ Type, type of route
    + Out and Back
    + Loop
    + Point to Point
- $r_{surface} : $ Surface, type of surface
    + Road
    + Trail
    + Mixed

$C$ is the list of dates that we want to have routes scheduled for.

$D$ is a function that maps each date in $c \in C$ to an interval of acceptable distances for $c$.
  - We represent each interval as a tuple $(d, r)$ where $d$ is the center of the interval and $r$ is the radius.
  - For example, $D(c) = (d, r)$ means that the acceptable distances for $c$ are $[d - r, d + r]$.

$P$ is a partial function that maps each date in $c \in C$ to a "plan": a list of routes $p$ such that each $r \in p$ we have $r \in R$.
  - $P$ is partial because we may have already fixed some routes for some dates (e.g., for a race).

## Output

$S : $ Date $ \rightarrow [$ Route $]$

We want to find a schedule $S$ that assigns a route to each date in $c \in C$ such that:

1. If $P(c) = p$, then $S(c) = p$.
    - i.e., the schedule respects any fixed plans
2. For $S(c)= [..., r_i, r_j, ...]$ the end of $r_i$ is the start of $r_j$.
3. Each route is assigned to at most one date.
4. $\Sigma_{r \in S(c)} r_{dist} \in D(c)$
    - The total distance of the routes assigned to each date is within the acceptable interval for that date.
5. We have at least 2 two-route days for every single-route day.
6. Two-route and single-route days are interspersed as much as possible.
7. We maximize the number of regions that we visit across the city.
8. We maximize the number of locations that we start and end at.
9. We space any repeat locations or regions as far apart as possible.






