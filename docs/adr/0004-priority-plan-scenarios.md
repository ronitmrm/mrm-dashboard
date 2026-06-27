# Priority Plan Shows Stop and No-Stop Scenarios

Planner priority changes must not imply that a running machine will be stopped. The probable plan should show two timing conditions before the priority is saved:

1. Running machines are not stopped. The priority setup can move ahead of queued work, but it waits for running blockers unless the planner explicitly chooses otherwise.
2. Selected running setups are stopped. The planner selects the exact setup/machine blockers to stop and enters finished quantity before saving.

The saved priority action continues to use the selected blockers as the source of truth. Leaving running blockers unselected creates a no-stop priority plan; selecting running blockers creates a stop-selected plan.
