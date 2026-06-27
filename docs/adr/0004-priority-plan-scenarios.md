# Priority Plan Requires Sequential Setup Confirmation

Planner priority changes must not imply that all setups in an item can be dated independently up front. Each downstream setup date depends on the action chosen for the previous setup, especially whether a running setup is kept active or explicitly stopped.

The probable plan therefore opens one setup at a time. The planner confirms the action for setup 1 first. Only then does setup 2 open and calculate its planned start and end. The same rule applies to later setups. Complete item dates appear only after all setup actions are confirmed.

If the planner edits an earlier setup action, downstream confirmations are cleared and the procedure restarts from that setup. The saved priority action continues to use the selected blockers as the source of truth: leaving running blockers unselected creates a no-stop plan, while selecting running blockers and entering finished quantity creates a stop-selected plan.
