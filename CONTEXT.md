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

**Quality Inspection Line**:
An existing Route Master combination of item code, option number, and setup number to which a Quality Inspection Parameter Set may be assigned.
_Avoid_: Free-text quality master target.

**Coded Checklist**:
A reusable checklist identified by one generated code and containing one or more ordered steps. Checklist counts refer to unique checklist codes, not step rows.
_Avoid_: Checklist row count.

**Factory Planning Holiday**:
A non-working date applied to Conventional, CNC, and Forging production-floor planning.
_Avoid_: Re-entering the same factory holiday separately for each floor.

**Production-Floor Planning Holiday**:
A non-working date applied only to one selected production floor while other floors remain available for planning.
_Avoid_: Department holiday.

**Defect / Downtime Reason**:
A coded reason describing a quality defect or a downtime cause that can stop or affect machine production.
_Avoid_: Separate defect code, separate downtime code.

**Approved Post**:
One sanctioned staffing position identified by a post code. It is vacant,
appointed, occupied, resigned, or inactive and may participate in one combined role.
_Avoid_: Job post.

**Approved Post Status**:
The staffing state of an approved post: vacant has no appointee, appointed has a
selected person who has not joined, occupied has a person who joined, and resigned
retains the departing person's last assignment while reopening the post for recruitment.
_Avoid_: Candidate status, recruitment opening status.

**Job Requirement Template**:
The reusable qualification, salary, and responsibility profile attached to an
approved post and copied into a recruitment opening.
_Avoid_: Job post.

**Recruitment Opening**:
A time-bounded hiring request created from an approved post and identified by
a vacancy code.
_Avoid_: Approved post, vacancy master.

**Candidate Application**:
One attempt by a candidate to fill a recruitment opening. Interview planning,
round outcomes, and a possible joining date belong to this application cycle.
_Avoid_: Candidate, interview.

**Candidate Appointment**:
The accepted joining commitment created after all three interview rounds are
approved and the candidate confirms willingness, joining date, and salary terms.
_Avoid_: Final interview approval, occupied post.

**Pre-Probation Salary**:
The fixed monthly salary agreed for a Candidate Appointment before probation is
completed.
_Avoid_: Salary range.

**Post-Probation Salary Range**:
The agreed minimum and maximum monthly salary applicable after probation.
_Avoid_: Fixed probation salary.

**Active Candidate Application**:
A candidate application that is assigned, in interview, or on hold. A candidate
can have only one active application for the same recruitment opening.
_Avoid_: Open round, current entry.

**Closed Candidate Application**:
A candidate application that was finally approved, rejected, or withdrawn. It
remains part of recruitment history and does not prevent a later application.
_Avoid_: Deleted application, old entry.

**Candidate Withdrawal**:
The candidate's decision to stop one active Candidate Application before
appointment. Its reason and prior interview history remain recorded.
_Avoid_: Candidate deletion, job closure.

**Recruitment Interview Round**:
One sequential standardized assessment within a candidate application:
Screening, Technical, then HR. A later round cannot begin until the preceding
round is approved.
_Avoid_: Freely selected interview stage.

**Interview Assessment**:
The preset question scores, interviewer, decision, and comments recorded for
one recruitment interview round.
_Avoid_: Overall score without question-level marks.

**Recruitment Assignment Command**:
One atomic, ordered request that assigns Candidates to a Recruitment Opening or applies employee transitions to Approved Posts.
_Avoid_: Independent row updates, workbook import batch.

**Recruitment Assignment Event**:
One durable, command-ordered fact recording an application or Approved Post transition caused by a Recruitment Assignment Command.
_Avoid_: Unordered audit row, log message.
