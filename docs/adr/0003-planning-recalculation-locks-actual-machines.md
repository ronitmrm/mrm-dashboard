# Planning Recalculation Locks Actual Machines

Route machine values such as `D5` represent a machine family. When a matching physical machine such as `D501` is later added to machine master, planning recalculation should move future unstarted work from the family code to the physical machine.

If a route machine family has no active matching physical machine in machine master, the planner must flag the work order as a machine-master gap and must not create a future plan on the family code itself. Family codes are not pseudo-machines.

The recalculation must not move work that is already actual shop-floor execution. A setup is treated as locked to its current machine when production actuals exist for that setup/machine or when the shop-floor workflow has reached `operator_started` for that setup/machine, even if no production quantity has been posted yet.
