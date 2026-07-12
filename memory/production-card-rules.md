# Production Card Rules

- 2026-07-12: Production card role forms are local dashboard UI in `apps/web/components/mrmpl-dashboard.tsx`.
- Shop floor, machinist, and quality cards expose an editable production date so same-day and back-dated cards can be opened and edited.
- Production-card identity must distinguish `cardRole`, `cardEntryKind`, `prodDate`, `shift`, job card, item code, setup, and machine. This lets one machine have multiple item entries on the same date without overwriting.
- Shop floor production can write `software_raw`; machinist and quality downtime/rejection saves should only write `production_card` rows.
- The role form hydrates existing saved `production_card` rows for the selected date/machine/item/setup before editing.