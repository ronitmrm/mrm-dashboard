# Authorization freshness contract

Date: 2026-08-08  
Authority: ADR-0006 remains accepted and unamended

## Guarantee

Session revocation, user ban/removal, role changes, capability changes, and user overrides take effect on the user's next server request, on every application instance. There is no cross-request grace period. Work already committed by an authorized request is not retroactively undone; a request that has not crossed its authoritative server check cannot rely on an earlier page render or client state.

PostgreSQL is authoritative for both Better Auth sessions and complete MRMPL grants. Better Auth cookie session caching remains explicitly disabled. Redis may rate-limit or accelerate non-authoritative state, but an empty, stale, or unavailable Redis instance cannot preserve a session, grant a capability, or deny a newly granted capability.

## Request scope

One request may deduplicate identical reads through request-scoped React caching:

- at most one authoritative session read for the incoming headers;
- at most one complete-grant read for the authenticated user;
- any number of capability membership checks against that one request-local set.

No session or grant result may live in module-global state, a process LRU, a cookie cache, or Redis across requests. A grant-changing workflow must not chain a second privileged effect using the old request-local set; that effect occurs in a new request or performs a new transaction-local authoritative policy check.

## Required authoritative boundaries

Every protected Server Component, Server Action, and Route Handler checks the session and its narrow capability before reading protected data or causing an effect. This includes:

1. administration of users, roles, capabilities, and overrides;
2. every canonical write, reversal, correction, approval, import, bulk assignment, and refresh request;
3. protected file upload/download, PDF/workbook export, and explicit-history route;
4. dashboard, HR/recruitment, quality, planning, maintenance, pricing, and commercial reads;
5. any API route consumed by the client, including live-state and event-stream authorization.

Layout, proxy, navigation visibility, disabled buttons, and client-side checks are usability hints only. Repository domain invariants and database constraints remain mandatory after authorization.

## Cookie-cache decision

Cookie session caching may not be enabled by this migration. Better Auth warns that revoked sessions can remain active until a cookie cache expires; that conflicts with next-request revocation. Enabling it later requires a separate ADR amendment naming maximum staleness, invalidation behavior, cross-instance evidence, and operations that always pass `disableCookieCache`. Until then, the allowed maximum is zero.

## Failure semantics

- Missing or revoked sessions receive the established unauthenticated response and no protected data/effect.
- Authenticated users without the capability receive the established unauthorized response and no protected data/effect.
- Database failure fails closed for authentication and authorization. Redis failure does not.
- A role/grant mutation and its authorization audit are one canonical transaction; rollback changes neither.
- Cross-instance tests may not share process memory and must still observe revocation on the next request.

## Acceptance evidence

- same-request repeated checks: one session read and one complete-grant statement;
- a second request after session revocation, ban, role removal, denied override, or capability removal is rejected;
- a second application instance observes the same result without restart or invalidation delivery;
- Redis empty/unavailable yields identical authorization decisions;
- sensitive read, write, upload/download, export/history, administration, dashboard API, and event-stream boundaries each have server-facing capability coverage;
- cookie-cache configuration remains disabled and no process-global auth/grant cache exists.

The decision is consistent with [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management) and ADR-0006.
