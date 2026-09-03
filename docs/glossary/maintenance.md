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
this exception; manager decisions and trade work retain their own permissions.

## Maintenance Category

The trade responsible for one approved request: Electrical, Plumbing, or Mechanical. The requester suggests a Category; the Maintenance Manager selects the final Category during approval.

## Maintenance Priority

Urgent or Regular. The requester asks for a Priority; the Maintenance Manager confirms the final Priority. Trade work lists order the manager-confirmed Urgent work before Regular work.

## Maintenance Request Status

The lifecycle is Pending Approval, Approved, In Progress, Completed, Closed, Returned, or Rejected. Every request starts Pending Approval. Only the Maintenance Manager may approve, reject, return, classify, prioritize, or close it. The assigned trade moves Approved work to In Progress and then Completed.

## Mechanical Work List

The unified Mechanical table containing existing scheduled machine-maintenance rows and approved Mechanical Request rows. Work Type distinguishes Scheduled from Request. Scheduled generation, due calculation, checklists, completion, and breakdown behavior remain unchanged.

_Avoid_: separate Scheduled and Request tables, converting scheduled rows into requests.
