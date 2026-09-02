# Access Administration

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

| Main Module | Sub Module | Type | Page / Task | Applicable actions | Route | Backend/API handler | Existing permission | Stable permission source | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Access Administration | Access Administration, Artifacts | 2 Pages / 10 Tasks | Access Administration, Artifacts, profile/staff commands, artifact deletion | View plus each visible command | `/administration/access`, `/administration/artifacts` | `app/administration/access/actions.ts`, artifact server helpers | administration and artifact keys | administration page/task catalogue | Covered |
| Costing | Pricing, Product Parameter Costing, Sales, Technical Review, Design Tasks, Engineering Changes, Drawing History, Excel View | 16 Pages / 26 Tasks | Commercial pages and exact workflow buttons | View, create, edit, delete, import, upload, approve and workflow actions where present | `/commercial/**` | `app/commercial/**/actions.ts`, scoped route handlers | `pricing.*` | commercial page/task catalogues | Covered |
| HR & Recruitment | Existing HR navigation labels | 5 Pages / 10 Tasks | Recruitment pages, interviews, jobs and exact workflow buttons | View, create, edit, delete, assign, schedule, record, close and withdraw where present | `/hr`, `/hr/**` | `app/hr/actions.ts`, approved-post export route | `hr.*` | HR page/task catalogues | Covered |
| Machines | Machines | 1 Page | Machines | View | production dashboard route/tab | dashboard API boundary | operations machine capability | production page catalogue | Covered |
| Maintenance | Requests and trade worklists | 1 Page / 7 Tasks | Requests, approval and trade tasks | View, approve and complete where present | `/maintenance/**` | maintenance server actions | `maintenance.*` | maintenance navigation plus registered task keys | Covered |
| Master Data | Master Selection, Master Tables | 11 Pages / 23 Tasks | Commercial, HR, Store and Production master pages/tasks | View, create, edit, delete, rename and import where present | `/masters`, `/commercial/**`, `/hr`, dashboard tabs | domain server actions and dashboard API boundary | scoped `pricing.*`, `hr.*`, `store.*`, `operations.*`, `quality.*` | page/task catalogues and exact registered task keys | Covered |
| Operational Entry | Entry Selection, Entry Tables | 4 Pages / 21 Tasks | Enquiries, purchase orders, attendance, training and production entry | View plus exact entry/workflow actions | `/operational-entry`, `/commercial/**`, dashboard tabs | commercial actions and dashboard API boundary | scoped pricing and operations keys | page/task catalogues and exact registered task keys | Covered |
| PPAC Conventional-01 | Existing PPAC tabs | 11 Pages / 17 Tasks | Floor pages and production commands | View plus each exact production command | dashboard floor tabs | `app/api/[...path]/route.ts` and dashboard events | floor-scoped operations keys plus migrated server gates | floor page/task catalogues | Covered |
| PPAC Conventional-02 | Existing PPAC tabs | 11 Pages / 17 Tasks | Floor pages and production commands | View plus each exact production command | dashboard floor tabs | `app/api/[...path]/route.ts` and dashboard events | floor-scoped operations keys plus migrated server gates | floor page/task catalogues | Covered |
| PPAC CNC-01 | Existing PPAC tabs | 11 Pages / 17 Tasks | Floor pages and production commands | View plus each exact production command | dashboard floor tabs | `app/api/[...path]/route.ts` and dashboard events | floor-scoped operations keys plus migrated server gates | floor page/task catalogues | Covered |
| PPAC Forging | Existing PPAC tabs | 11 Pages / 17 Tasks | Floor pages and production commands | View plus each exact production command | dashboard floor tabs | `app/api/[...path]/route.ts` and dashboard events | floor-scoped operations keys plus migrated server gates | floor page/task catalogues | Covered |
| Production Dashboard | Production Dashboard | 1 Page / 2 Tasks | Dashboard and registered dashboard tasks | View plus exact task actions | `/` dashboard tabs | dashboard API and event authorization | granular operations keys | production page catalogue and registered tasks | Covered |
| Store | Store Overview, Requests & Issues, New Item Requests, Purchase Register, Stock | 6 Pages / 10 Tasks | Store pages and exact request, receipt, purchase and asset commands | View, submit, issue, resolve, receive and lifecycle actions where present | `/store/**` | Store actions/routes using `requireStoreAction` | granular `store.*` | Store page/action catalogues | Covered |

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

## Acceptance case

The managed `design-team` role contains only Commercial Design, Drawing History,
Technical Review, Enquiries, Customers, Products and Assembly/BOM grants needed
by that workflow. It contains no HR permission. Consequently Universal-HR is
absent from its navigation and HR direct pages/actions remain forbidden. This
was browser-verified on 2026-09-02 with a disposable Design Team account; the
account was removed after verification.

Migration 0113 also preserves the canonical designation acronym `HOD` in both
newly normalized text and existing designation rows.
