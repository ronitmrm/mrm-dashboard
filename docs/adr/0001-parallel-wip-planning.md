# Parallel WIP Planning Uses a Common Pool

When a setup is split across parallel machines, each machine creates its own WIP stream with its own start date, end date, planned quantity, and daily output. Downstream setups consume from a common WIP pool after the WIP availability buffer, not from fixed upstream-machine to downstream-machine pairings, because shop-floor material movement is planned as pooled setup stock. The planner must therefore calculate readiness from all upstream streams and from the combined daily demand of all machines assigned to the next setup, while preventing last-day production from being consumed on the same day.

Forecast streams may estimate when WIP will exist, but they do not reserve downstream physical machines. An unstarted downstream setup enters the machine plan only when recorded upstream good output satisfies the pooled buffer required by its assigned machine count. Until then, compatible machines remain available for Raw-Material-ready or already-WIP-ready work. A setup with recorded shop-floor or production execution remains assigned so recalculation cannot erase physical work.

Forecast-only downstream setups remain part of the full-route completion forecast used by the current probable dispatch date. Omitting a physical machine reservation must not shorten the Job Card forecast to the last setup that currently owns a machine.
