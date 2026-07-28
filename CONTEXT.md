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
A rebuild of forecast planning from the latest masters, holidays, constraints, production entries, and shop-floor workflow data. It may move future unstarted setups to newly available physical machines, but it must not move setups that already have production actuals or a raw-material-at-machine-or-later shop-floor task unless a planner explicitly switches the machine.
_Avoid_: Manual date refresh.

**Operational Replanning**:
An automatic planning recalculation after live planning inputs change, such as priority, RM inward, shop-floor progress, setup completion, or production quantity. Master and structural changes remain manually recalculated.
_Avoid_: Manual operational refresh.

**Machine Assignment Stability**:
A recalculation rule for route machine families: when the same job-card setup was already planned on a physical machine, keep that setup on the same machine unless there is a material planning improvement, machine unavailability, a physical shop-floor lock, production actuals, or an explicit planner machine switch. Other setups, including setup 2 of the same part, are assigned independently.
_Avoid_: Load balancing every recalculation.

**Route Machine Family**:
A route-level machine code such as `D5` or `C5` that represents a physical-machine family. Future planning requires at least one active physical machine in machine master for that family, such as `D501`; otherwise the work order is flagged and no unstarted machine plan row is created.
_Avoid_: Pseudo-machine.

**Production Floor**:
An independent production operation with its own team, machines, routes, cycle standards, inspection parameters, planning, tasks, and entries. Conventional, CNC, and Forging are separate production floors; records from one floor never participate in another floor's planning or task queues.
_Avoid_: Department, machine group, production-floor filter.

**Priority Plan Scenario**:
The setup-by-setup decision flow shown before saving a planner priority change. It opens one setup at a time; downstream setup dates are hidden until the previous setup action is confirmed.
_Avoid_: Single probable date.

**Quality Inspection Parameter Set**:
The ordered parameters, specifications, instruments, and tolerances assigned to one item, option, and setup and reused by both first-piece inspection and hourly quality checks.
_Avoid_: Separate FPIR master, hourly QC parameter master.

**Defect / Downtime Reason**:
A coded reason describing a quality defect or a downtime cause that can stop or affect machine production.
_Avoid_: Separate defect code, separate downtime code.

**Approved Post**:
One sanctioned staffing position identified by a post code. It is vacant,
occupied, or inactive and may participate in one combined role.
_Avoid_: Job post.

**Job Requirement Template**:
The reusable qualification, salary, and responsibility profile attached to an
approved post and copied into a recruitment opening.
_Avoid_: Job post.

**Recruitment Opening**:
A time-bounded hiring request created from an approved post and identified by
a vacancy code.
_Avoid_: Approved post, vacancy master.

**Candidate Application**:
The relationship between one candidate and one recruitment opening. Interview
planning, round outcomes, and a possible joining date belong to this
relationship.
_Avoid_: Candidate, interview.
