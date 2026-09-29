# Maintenance

## Maintenance Request

One reported facility or machine problem that creates exactly one task. A request belongs to one requester and Department snapshot, one Location, one Problem Description, one suggested Category, and one requested Priority. Another trade requires another request.

_Avoid_: subtask, multi-trade work order, editable requester identity, free-text Department.

## Requester Department

The employee's active assigned Department recorded against a complaint. A
multi-post employee, including one with the Administrative Role, selects one of
their active assigned Departments per request; a single Department is automatic.
This does not grant manager decisions, trade work, or access to unrelated Departments.

The protected System Administrator identity may submit for any active Department
in the Organization without an Employee Master link. The requester remains the
signed-in administrator. An assignable Administrative Role alone does not grant
this requester-identity exception. Administrative receives all manager and trade
permissions through its full-access role.

## Maintenance Category

The trade responsible for one approved request: Electrical, Plumbing, or Mechanical. The requester suggests a Category; the Maintenance Manager selects the final Category during approval.

## Maintenance Priority

Urgent or Regular. The requester asks for a Priority; the Maintenance Manager confirms the final Priority. Trade work lists order the manager-confirmed Urgent work before Regular work.

## Maintenance Request Status

The lifecycle is Pending Approval, Approved, In Progress, Completed, Closed, Returned, or Rejected. Every request starts Pending Approval. Only the Maintenance Manager may approve, reject, return, classify, prioritize, or close it. The assigned trade moves Approved work to In Progress and then Completed.

## Mechanical Work List

The unified Mechanical table containing existing scheduled machine-maintenance rows and approved Mechanical Request rows. Work Type distinguishes Scheduled from Request. Scheduled generation, due calculation, checklists, and completion remain unchanged. Breakdown work follows the Machine Breakdown lifecycle below.

_Avoid_: separate Scheduled and Request tables, converting scheduled rows into requests.

## Planned Maintenance Checklist

The checklist assigned to one machine maintenance schedule is completed for each due occurrence. An engineer may save an In Progress task with partial step responses and reopen it later. Completing the task requires every active required checklist point and advances the schedule's next due date. A draft does not advance the schedule or appear as completed maintenance history.

The task records a start date and time when work begins and an end date and time when it finishes. Actual minutes are calculated from those timestamps. The engineer is the signed-in user's linked Employee ID with an active maintenance assignment. Each changed part is recorded separately so maintenance history can be searched and filtered by part.

_Avoid_: browser prompts for checklist points, treating a partial draft as completed work, repeating the same checklist point across production units.

## Machine Breakdown

One machine-linked maintenance task that starts In Progress and completes only
after the machine is repaired. Starting a breakdown automatically opens downtime
on that machine's current Production Session when one exists. The same breakdown
remains open when the shift session closes unresolved; completing it resolves the
carried problem and makes the machine eligible for a new Production Session.

A completed breakdown records its actual start and completion times, the
signed-in engineer's active Maintenance Employee ID, work done,
optional remarks, and zero or more separately entered Changed Items.
One breakdown may contain multiple Changed Items; they are not flattened into a
single free-text part field.

_Avoid_: completed-only breakdown entry, ending the Production Session when the
breakdown starts, starting production while a machine breakdown remains open.

## Physical Asset Breakdown

One open breakdown belongs to one Non Consumable physical Unit ID. Mechanical
staff choose Machine or Asset when starting breakdown work. An Asset breakdown
marks that unit Broken, remains open until repaired, and completes into the
unit's maintenance history with the signed-in Maintenance employee, work done,
and optional changed items. A shared Asset Code cannot own a breakdown.
An Asset breakdown does not open machine Production Session downtime.

## Legacy Machine Maintenance History

A migrated completed record preserves the machine, maintenance type, recorded
start and end dates, and source work notes. If the source has no time, engineer,
or checklist answers, those facts remain **Not recorded**. Historical completion
does not advance an active schedule or replace its saved next due date. A legacy
record without an original due date belongs in completed history and the
maintenance register, not in the monthly maintenance plan.
