# CNC startup import

Canonical rules: [Production sessions](../glossary/production-sessions.md#cnc-startup-opening-balances).

This is a one-time operator workflow, with no new application screen. Migration
0154 adds permanent opening balances, their source projection and cutoff guards.
Deploy the application and migration together before importing. Do not execute
against the shared staging/production database during tests.

1. Fill the six-sheet CNC startup workbook; keep the row 3 headings. Identifiers
   must remain text. Use Excel dates or `YYYY-MM-DD`, and one IST cutoff time.
   Each running setup needs a matching production row, including explicit zeros.
   A setup cannot be both Running and Completed or run on two machines in this
   baseline; reconcile those cases before proceeding.
2. `pnpm --filter web cnc:prepare <absolute-filled.xlsx> <absolute-review.json>`
   reads the workbook without database access. It validates sheets, required
   values, work-order identities, duplicate setups, running-machine matches and
   kilograms. Formulas are rejected. The output file must not already exist.
3. Review `workOrders` and `rawMaterial` in that JSON separately. Create/reconcile
   work orders, masters and explicit CNC route selections using existing flows.
   **This command imports opening setup quantities/state only.** It does not
   import work orders or RM, infer receipt dates or change RM planning rules.
   Reconcile cumulative receipt kilograms versus unused stock before RM writes.
4. Set `OPENING_ORGANIZATION_ID` and the existing migration database environment
   securely. Never print connection strings. Run
   `pnpm --filter @workspace/migration cnc:opening <absolute-review.json>`.
   Preview resolves selected CNC routes, active setups and machines, checks
   existing production/workflow, and reports pending good pieces per setup.
   Preview takes transaction locks for consistency and writes no domain rows.
5. Review the preview and master readiness before importing. The actual import is
   the same command with `--commit`. It repeats validation in one transaction,
   stores the batch digest, quantities and opening state, and queues a dashboard
   refresh. Use a migration role, not the web role. An identical replay does
   nothing; changed content is rejected. There is no automatic overwrite or reset.
6. Verify the refreshed CNC plan, per-setup pending pieces, running machines,
   completed setups and Job Card totals. `openingBalances` in the Job Card
   workspace and `openingBalanceRows` in planning retain the baseline evidence.
   Daily entries and sessions remain post-cutoff-only. Start the next real session
   with its actual operator, time and measurement values.

Existing production/workflow for a target setup or ownership of a running machine
blocks import. Reconcile live records first; never delete them merely to make the
import pass. Opening balances stay separate from production entries and sessions.
Running ownership is installed as an explicitly labelled opening state; historical
approval/checklist/operator/session evidence is not fabricated. Completed setup
states do not create historical completion events with invented dates.

Implementation: `packages/db/src/production-opening-balances.ts`,
`packages/db/migrations/0154_cnc_opening_balances.sql`,
`apps/web/lib/cnc-opening-workbook.ts`. Verification uses isolated local PostgreSQL
and existing Vitest tooling. Keep workbook/review files outside tracked source.
