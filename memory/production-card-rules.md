# Production Card Rules

- 2026-07-12: Production card role forms are local dashboard UI in `apps/web/components/mrmpl-dashboard.tsx`.
- Shop floor, machinist, and quality cards expose an editable production date so same-day and back-dated cards can be opened and edited.
- Production-card identity must distinguish `cardRole`, `cardEntryKind`, `prodDate`, `shift`, job card, item code, setup, and machine. This lets one machine have multiple item entries on the same date without overwriting.
- Shop floor production can write `software_raw`; machinist and quality downtime/rejection saves should only write `production_card` rows.
- The role form hydrates existing saved `production_card` rows for the selected date/machine/item/setup before editing.
- 2026-07-12: Hourly quality checks live on `/dashboard/hourly-quality-check`, opened from Quality Control Tasks rather than inside the downtime/rejection card. They select date, shift, machine, and 24-hour slot; machine selection fills item/job/option/setup from the current running plan.
- Hourly quality parameters are stored as `quality_parameter_master` rows keyed by item/option/setup/parameter code. Saved checks are `hourly_quality_check` rows keyed by date/shift/hour/machine/item/option/setup so back-dated edits replace the intended hourly card.

- 2026-07-12: Machinist setup checklist editing lives on `/dashboard/setup-checklist`, opened from the Machinist Tasks row with `sessionId` and `phase` query params. The task list should show only checklist status plus an open button; in-progress checklist values still save to `setup_checklist_session`.

- 2026-07-12: Setup checklist page shows running setup metadata as top tiles. Because `dashboard.snapshot` is cached, the page stores the latest saved `setup_checklist_session` in browser local storage by session id and prefers it over stale snapshot data for immediate reopen hydration.

- 2026-07-12: Setup checklist page must not load `dashboard.snapshot`; use the lightweight `api.dashboard.setupChecklistPage` query plus row details in the URL so checklist opening is fast and does not pull the multi-MB dashboard payload.

- 2026-07-13: Hourly QC page must not load `dashboard.snapshot` in the browser. Use `api.dashboard.hourlyQualityPage` for only running rows and quality parameter masters; load an existing hourly QC card separately by key only after machine/date/hour selection.
- 2026-07-13: Out-of-tolerance hourly QC and first-piece quality readings display as Not OK, with red row/input/badge styling. Existing older NG values are normalized to Not OK in the hourly QC UI.
