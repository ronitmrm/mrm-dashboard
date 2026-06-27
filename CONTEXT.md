# MRM Dashboard

MRM Dashboard supports production planning and shop-floor tracking for job cards, route setups, machines, and WIP movement between operations.

## Language

**Setup**:
One operation in a part route. A setup may run on one machine or be split across compatible parallel machines.
_Avoid_: Operation when referring to a route step in the dashboard.

**WIP Stream**:
The planned or actual output produced by one machine for one setup, bounded by that machine's start date, end date, quantity, and daily capacity.
_Avoid_: Machine output bucket.

**Common WIP Pool**:
The available WIP for a setup after all machine WIP streams have been transferred into the shared stock for the next setup.
_Avoid_: Machine-to-machine WIP pairing.

**WIP Availability Buffer**:
The planning delay between producing WIP on one setup and allowing the next setup to consume it.
_Avoid_: Same-day transfer.

**Production Start Forecast**:
The planned production start date for a setup before actual production starts. It follows the later of the machine plan and setup completion date.
_Avoid_: Fixed production start date.

**Actual Production Start**:
The first recorded production date for a setup on a machine. Once present, it locks the production start date used by planning.
_Avoid_: Setup completion date.

**Planning Recalculation**:
A rebuild of forecast planning from the latest masters, holidays, constraints, production entries, and shop-floor workflow data. It may move future unstarted setups to newly available physical machines, but it must not move setups that already have production actuals or an operator-started shop-floor task.
_Avoid_: Manual date refresh.
