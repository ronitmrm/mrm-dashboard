# Access Administration

## Workspace tabs

- Header metrics reuse the current snapshot: Staff Accounts counts identity
  users, Application Roles counts all roles (including system roles), and Without
  Login counts eligible Employee Master entries without a linked user. No extra
  database queries are issued for these cards.
- `Create Role` is the default tab for users allowed to create roles. It contains
  only the role details and granular permission selector. Successful creation
  opens the saved-role list.
- `Application Roles` is a filterable register. Opening a role uses
  `?section=roles&role=<key>` and renders only that role's editor; the register
  does not mount hidden permission selectors for every role.
- `Staff Accounts` starts by selecting an eligible Employee Master record,
  creating its linked login, and assigning direct roles, then shows Approved
  Post profiles and the staff register.
  The post selector shows its linked designation
  and occupant; the duplicate review dropdown is omitted.
- Staff Access uses separate, filterable Employee ID, employee identity,
  designation, department, assigned roles, overrides and action columns. Each
  direct or inherited role chip labels its source and opens that role's rights
  with a return link to Staff Access. Existing edit capabilities still control
  editing; system roles expose their assigned rights read-only. The staff-account
  editor replaces only the selected account's direct roles and lists
  post-inherited roles separately as non-editable context.
- Users without Create Role access default to Application Roles. All existing
  server-side page/task guards remain unchanged; tabs do not grant permissions.
- Navigation uses the shared `radix-luma` Tabs primitive with keyboard support
  and URL-backed selection. Role-register and permission filters retain separate
  browser-persisted filter keys.

## Employee-first staff setup

1. Select an eligible, unlinked Employee Master record, then enter its email/login
   ID and temporary password. The account name comes from Employee Master and the
   new login is linked automatically. Staff credentials cannot be provisioned
   without this employee reference. Passwords are never returned in action state
   or audit data.
2. Select the complete set of existing non-system Application Roles for the
   newly created or an existing staff account. The repository validates the
   entire selection before atomically replacing only that account's direct role
   assignments and auditing each addition or removal. Other staff accounts and
   post-inherited roles remain unchanged. System roles cannot be selected or
   forged into this operation. An empty selection removes all direct roles from
   the selected account.

Provision and Assign Staff Role remain independent task capabilities, checked in
both server actions and service methods. The legacy Link Staff Account capability
is retained only for controlled repair of pre-existing unlinked identities; it is
not part of the dashboard workflow. Provisioning records both
`access.user.provisioned` and `access.employee.linked`; audit/link failure removes
only the newly created account.
Shared Field, Checkbox, NativeSelect, Alert and SectionCard primitives provide
pending states and safe inline feedback. The existing post profile editor stays
available separately; role-name normalization is unchanged despite removing its
helper text.

## Post access profile

Select an Approved Post, then its linked designation, before the current
occupant and role controls appear. This is not a designation reassignment
form: each post retains the designation defined in HR. Changing the post
clears the downstream selections.

The snapshot matches occupants by immutable post ID using the existing
current-employment query, including joining/last-working-date eligibility.
Vacant posts and occupants without a linked login have explicit explanations.
Roles remain attached to the post. Assign/remove changes one role at a time
and preserves other roles, with the existing server capability and audit checks.

## Role deletion

Application Roles exposes **Delete Role Everywhere**, not account deletion or
single-staff unassignment. Staff Access role badges navigate to that role.
The confirmation requires the exact role key. `administration.roles.delete`
is an independent task grant, initially seeded only for the system administrator
by migration 0114. Create/Edit permissions do not authorize deletion.

The service checks the capability again; the repository locks the immutable
role ID, rejects system roles and stale/mismatched confirmations, records an
`access.role.deleted` audit event (role details, permission keys, direct user
IDs and post IDs), and deletes the role in one transaction. Existing foreign
keys cascade only its permission and direct/post assignment rows. Accounts,
employee links, posts, other roles, user overrides and existing audit evidence
are preserved. Closed dialogs mount no confirmation form; pending submissions
disable repeat deletion and dismissal. Success refreshes the originating tab.

## Architecture

Access Administration derives its item-level inventory from the typed page
catalogue in `apps/web/lib/auth/page-access-catalog.ts`, typed task catalogues
in `apps/web/lib/auth/task-capabilities.ts` and
`apps/web/lib/auth/production-floor-task-capabilities.ts`, and the persisted
permission registry in `identity.permissions`. Display labels remain separate
from stable permission keys.

`permissionAccessRows()` reconciles those sources into the five visible
columns: Main Module, Sub Module, Type, Page / Task, and Access. Each row owns
only its own action keys. The Access chip derives No Access, View Only, Full
Access, and Custom; presets are never persisted.

The selector fieldset must allow shrinking (`min-w-0`). Its bounded table wraps
module/page labels and keeps the Access column pinned on the right. On narrow
screens only the table scrolls horizontally; the surrounding card must not clip
the permission controls. Create Role and the saved-role editor share this layout.

Navigation and direct page access use the page capability definitions. Server
actions and route handlers use the matching task capability through
`requireCapability`, `requireHrPage`, `requireProductionPage`, or the dashboard
authorization boundary. Store commands resolve through
`requireStoreAction`. Permission strings are checked on the server even when
the corresponding control is hidden in the UI.

## Coverage inventory

The live item-level inventory is the Access Administration table. With the
managed staging catalogue at migration 0113 it contains 268 independently
adjustable rows: 91 Pages and 177 Tasks from 314 registered permissions.

| Main Module           | Sub Module                                                                                                                  | Type                | Page / Task                                                                 | Applicable actions                                                                     | Route                                                  | Backend/API handler                                             | Existing permission                                                | Stable permission source                            | Status  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- | ------- |
| Access Administration | Access Administration, Artifacts                                                                                            | 2 Pages / 10 Tasks  | Access Administration, Artifacts, profile/staff commands, artifact deletion | View plus each visible command                                                         | `/administration/access`, `/administration/artifacts`  | `app/administration/access/actions.ts`, artifact server helpers | administration and artifact keys                                   | administration page/task catalogue                  | Covered |
| Costing               | Pricing, Product Parameter Costing, Sales, Technical Review, Design Tasks, Engineering Changes, Drawing History, Excel View | 16 Pages / 26 Tasks | Commercial pages and exact workflow buttons                                 | View, create, edit, delete, import, upload, approve and workflow actions where present | `/commercial/**`                                       | `app/commercial/**/actions.ts`, scoped route handlers           | `pricing.*`                                                        | commercial page/task catalogues                     | Covered |
| HR & Recruitment      | Existing HR navigation labels                                                                                               | 5 Pages / 10 Tasks  | Recruitment pages, interviews, jobs and exact workflow buttons              | View, create, edit, delete, assign, schedule, record, close and withdraw where present | `/hr`, `/hr/**`                                        | `app/hr/actions.ts`, approved-post export route                 | `hr.*`                                                             | HR page/task catalogues                             | Covered |
| Machines              | Machines                                                                                                                    | 1 Page              | Machines                                                                    | View                                                                                   | production dashboard route/tab                         | dashboard API boundary                                          | operations machine capability                                      | production page catalogue                           | Covered |
| Maintenance           | Requests and trade worklists                                                                                                | 1 Page / 7 Tasks    | Requests, approval and trade tasks                                          | View, approve and complete where present                                               | `/maintenance/**`                                      | maintenance server actions                                      | `maintenance.*`                                                    | maintenance navigation plus registered task keys    | Covered |
| Master Data           | Master Selection, Master Tables                                                                                             | 11 Pages / 23 Tasks | Commercial, HR, Store and Production master pages/tasks                     | View, create, edit, delete, rename and import where present                            | `/masters`, `/commercial/**`, `/hr`, dashboard tabs    | domain server actions and dashboard API boundary                | scoped `pricing.*`, `hr.*`, `store.*`, `operations.*`, `quality.*` | page/task catalogues and exact registered task keys | Covered |
| Operational Entry     | Entry Selection, Entry Tables                                                                                               | 4 Pages / 21 Tasks  | Enquiries, purchase orders, attendance, training and production entry       | View plus exact entry/workflow actions                                                 | `/operational-entry`, `/commercial/**`, dashboard tabs | commercial actions and dashboard API boundary                   | scoped pricing and operations keys                                 | page/task catalogues and exact registered task keys | Covered |
| PPAC Conventional-01  | Existing PPAC tabs                                                                                                          | 11 Pages / 17 Tasks | Floor pages and production commands                                         | View plus each exact production command                                                | dashboard floor tabs                                   | `app/api/[...path]/route.ts` and dashboard events               | floor-scoped operations keys plus migrated server gates            | floor page/task catalogues                          | Covered |
| PPAC Conventional-02  | Existing PPAC tabs                                                                                                          | 11 Pages / 17 Tasks | Floor pages and production commands                                         | View plus each exact production command                                                | dashboard floor tabs                                   | `app/api/[...path]/route.ts` and dashboard events               | floor-scoped operations keys plus migrated server gates            | floor page/task catalogues                          | Covered |
| PPAC CNC-01           | Existing PPAC tabs                                                                                                          | 11 Pages / 17 Tasks | Floor pages and production commands                                         | View plus each exact production command                                                | dashboard floor tabs                                   | `app/api/[...path]/route.ts` and dashboard events               | floor-scoped operations keys plus migrated server gates            | floor page/task catalogues                          | Covered |
| PPAC Forging          | Existing PPAC tabs                                                                                                          | 11 Pages / 17 Tasks | Floor pages and production commands                                         | View plus each exact production command                                                | dashboard floor tabs                                   | `app/api/[...path]/route.ts` and dashboard events               | floor-scoped operations keys plus migrated server gates            | floor page/task catalogues                          | Covered |
| Production Dashboard  | Production Dashboard                                                                                                        | 1 Page / 2 Tasks    | Dashboard and registered dashboard tasks                                    | View plus exact task actions                                                           | `/` dashboard tabs                                     | dashboard API and event authorization                           | granular operations keys                                           | production page catalogue and registered tasks      | Covered |
| Store                 | Store Overview, Requests & Issues, New Item Requests, Purchase Register, Stock                                              | 6 Pages / 10 Tasks  | Store pages and exact request, receipt, purchase and asset commands         | View, submit, issue, resolve, receive and lifecycle actions where present              | `/store/**`                                            | Store actions/routes using `requireStoreAction`                 | granular `store.*`                                                 | Store page/action catalogues                        | Covered |

Broad compatibility keys are intentionally omitted from the UI after their
grants and overrides are copied to granular keys by migrations 0077, 0085,
0093, and 0094. These include the former administration role/user managers,
HR recruitment/employee writers, Production dashboard/tab readers, broad
Commercial writers, and broad Store managers/writers. They remain temporary
server dependencies only where an existing backend boundary still requires a
legacy gate; selecting a granular row adds only that gate and never sibling
rows. Unknown keys are not referenced by navigation or a backend boundary and
therefore grant no application access.

## Security and scope

- Page grants independently control navigation, dashboard links, tabs and
  direct URLs. Task grants independently control UI commands and server
  mutations. The authorization-boundary test scans every application action
  and route except the public Better Auth endpoint.
- View is a dependency for modifications on the same row. Enabling a modifying
  action adds View; removing View removes dependent actions.
- Organization, Production Floor, owner, creator and assignee filters remain in
  their repositories and handlers. A page grant does not bypass record scope.
- Role permission, staff role, post role and user override changes use the
  existing `audit.events` mechanism, recording actor, target, event time and
  old/new metadata where applicable.
- Multiple roles and user overrides retain the existing effective-permission
  resolution; deny overrides win.

## Baseline and hardcoded exceptions

Public Better Auth endpoints are unauthenticated. Own-account navigation,
password change, sign-out, error and unauthorized pages are baseline
authenticated behavior. Resetting another user's password and protected
bootstrap/last-administrator behavior remain system-administrator operations,
not configurable business permissions.

Remaining role strings in operational workflows describe actors or assignments
rather than feature authorization. The Store administrator boolean only affects
the unlinked department chooser. These do not replace page or task capability
checks.

All feature authorization is capability-based and configured through Access
Administration. Department and designation names may classify operational data,
but never grant page or task rights.

## Acceptance case

The managed `design-team` role contains only Commercial Design, Drawing History,
Technical Review, Enquiries, Customers, Products and Assembly/BOM grants needed
by that workflow. It contains no HR permission. Consequently Universal-HR is
absent from its navigation and HR direct pages/actions remain forbidden. This
was browser-verified on 2026-09-02 with a disposable Design Team account; the
account was removed after verification.

Migration 0113 also preserves the canonical designation acronym `HOD` in both
newly normalized text and existing designation rows.

## Verification safety

Access and authentication integration tests delete identity fixtures. Never run
them against the shared staging/live database or load the managed application
environment into a test process. Use an isolated test database; its connection
must not reuse the live endpoint. A `_test` role name alone does not isolate data.

All four SQL-consuming Vitest configurations (Web, DB, Migration, Runtime) call
`scripts/test-database-safety.ts` before test modules load. The guard requires
`mrmpl_test` (or an `mrmpl_test_` suffix), rejects connection-routing query
overrides, and requires `TEST_DATABASE_ALLOWED_HOST` for remote endpoints.
Remote endpoints must differ from application endpoints in both the process
environment and workspace/Web environment files; pooled/direct Neon aliases
count as the same endpoint. Errors never include connection strings.

The startup regression launches the real runner with a sentinel fixture and
proves unsafe configurations stop before that fixture loads. Local CI keeps its
existing `localhost:5434/mrmpl_test` target; this workstation must use an isolated
managed branch, never provision local containers. That branch's test role needs
`CREATEDB` for disposable auth databases and enough connections for concurrent
repository reads (the shared test role's two-connection limit is insufficient).
Do not change the shared branch's role privileges or limits for testing.

On 2026-09-03, ten leaked `Design HOD` integration fixtures were backed up and
removed with their employee links, posts, departments, and designations. The
cleanup compared exact snapshots and incoming references, was rehearsed on an
isolated clone, and preserved non-actor revision evidence. Two immutable-revision
triggers were disabled only inside the owner-controlled transaction and restored
before commit to allow backed-up actor references to become null. No business
organizations, commercial records, or files were deleted. Operational backup
and recovery IDs remain in the ignored `.handoff/` directory, not source control.

Browser follow-up verified separate Create Role, Application Roles, and Staff
Accounts tabs, compact summary cards, and wrapped employee/post cells. Adding
Design Team to Khattar Ankit's Design & Engineering post succeeded on an isolated
copy while preserving Administrative. The reported multiple-role error did not
reproduce; no speculative authorization changes or live role grants were made.

If Drizzle table types unexpectedly lose `$inferSelect`, inspect the installed
package before changing application schemas. Installed declarations had altered
Drizzle `Table` imports to `OperationalTable`; restoring the locked dependencies
resolved the typecheck and build failures on 2026-09-03:

```powershell
pnpm install --force --frozen-lockfile --optimistic-repeat-install=false
pnpm typecheck
pnpm build
```

Scope source rewrites to tracked application files; never include `node_modules`,
generated declarations, or caches. Do not weaken application types to compensate
for altered dependency files.
