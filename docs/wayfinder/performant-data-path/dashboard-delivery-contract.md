# Dashboard delivery contract

Date: 2026-09-18
Scope: external browser state; bounded canonical revalidation

## State model

Dashboard delivery is the product of independent state dimensions:

- payload: `none | current | stale`;
- canonical request: `initial | canonical-state | settled | error`;
- durable refresh: `idle | pending | running | failed`;
- coverage: `complete | partial`;
- visibility: `visible | hidden`.

The UI derives its presentation from those fields. It does not collapse canonical fetch failure, refresh failure, partial coverage, and initial loading into one generic spinner or error.

## Required transitions

| Event                                   | State and visible result                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route starts or floor changes           | Clear payload/version for the new floor, enter `initial`, and show that floor's loading skeleton. Never retain another floor's payload.                |
| Initial canonical state succeeds        | Store that floor and version, render payload, show refresh status and any partial-coverage notice.                                                     |
| Initial canonical state fails           | Keep payload `none`, enter blocking error, expose retry. Authentication/authorization follows the server boundary.                                     |
| Known version is unchanged              | Retain the existing payload exactly; replace refresh/status metadata; settle the request.                                                              |
| Canonical version changed               | Atomically replace the same-floor payload/status/coverage and version. Reject a regressive version and refetch.                                        |
| Canonical refetch fails with prior data | Keep prior payload stale, show a non-blocking error and retry affordance.                                                                              |
| Durable refresh requested/running       | Keep payload visible, show refresh in progress, and allow one-second status polling only while pending/running.                                        |
| Durable refresh fails                   | Keep last payload stale, show the durable failure message and explicit retry. Never imply the stale payload is newly refreshed.                        |
| Safety refresh due                      | While visible, request canonical state every 60 seconds. While hidden, pause the timer; on visibility return, fetch immediately when stale or overdue. |
| Coverage truncated                      | Render returned rows as current, but display the category/floor coverage notice. This is not a transport error.                                        |

An aborted request caused by navigation or floor change is silent. A late response for a prior floor is discarded. Only one canonical request may be in flight or commit state at a time.

## Initial and stale presentation

With no payload, the content region uses its existing loading skeleton; controls that would mutate unseen state remain unavailable. A blocking initial error replaces the skeleton with retry, not an empty successful dashboard.

With a prior payload, checking or retrying never replaces content with a full-page spinner. The status region describes canonical checks, refresh progress, failure, and partial coverage without claiming a persistent live connection. Stale indicators remain until a successful canonical response proves otherwise. Existing data-entry drafts and optimistic write state are not discarded during revalidation.

## Bounded canonical revalidation

The browser reads only the authenticated canonical dashboard-state boundary. A visible dashboard checks again 60 seconds after its last successful read. A hidden dashboard schedules no safety or active-refresh requests. When visibility returns, initial, stale, or overdue state is read immediately; a known pending/running refresh resumes one-second status checks.

No browser `EventSource`, dashboard event stream, heartbeat, or reconnect loop participates in delivery. PostgreSQL state and the canonical version response remain authoritative. Every read is finite and passes through the existing server authorization boundary.

## Request and normalization boundary

The client sends `knownVersion` only when it belongs to the active floor. Response-envelope merge, unchanged-payload retention, payload extraction, status extraction, and coverage normalization live in `apps/web/lib/dashboard-view-model.ts`; presentation components consume the normalized result.

A `notModified` response with no retained same-floor payload is invalid and triggers a full canonical request without `knownVersion`. Changed responses containing another floor or all floor snapshots are rejected at the boundary.

## Timers and accessibility

- steady visible safety refresh: 60 seconds;
- active pending/running refresh status: 1 second;
- hidden tab: no safety or active polling until visible;
- initial, stale, or overdue state: immediate read when visible;
- checking, stale, refresh failure, and partial coverage are expressed in text/status semantics, not color alone;
- status changes use a non-disruptive live region and do not steal focus.

## Acceptance scenarios

1. first load success, empty-state success, authentication failure, authorization failure, and retryable server failure;
2. changed and unchanged known-version responses for every floor;
3. floor switch with late prior-floor response and no transient cross-floor data;
4. visible 60-second revalidation, initially hidden mount, hidden pause, and immediate overdue visibility recovery;
5. pending/running/complete/failed durable refresh while prior content stays visible;
6. stale canonical refetch failure followed by successful recovery;
7. hidden/visible timer behavior and no overlapping fetches;
8. complete and partial per-category/per-floor coverage;
9. ≤1 KiB unchanged response, one-floor changed response, and Ticket 3 freshness budgets;
10. keyboard/screen-reader status semantics and retained drafts/optimistic state.

Reducer and canonical-route tests cover scenarios 1–9 where applicable. A synthetic real-hook browser probe covers timing, visibility, retained content, request overlap, floor isolation, and the absence of `EventSource`. Authenticated full-application UI/provider behavior, scenario 10, and final loading/checking/partial-coverage presentation remain unverified.

## Prototype verdict

The 2026-08-08 throwaway prototype on local branch `prototype/dashboard-delivery-state` at `f47be17` included SSE connection and hint transitions. That transport model was retired on 2026-09-18 because its perpetual requests had an unbounded server-compute cost shape. The retained rules are canonical version ownership, same-floor payload retention, floor-switch isolation, bounded visible revalidation, and hidden-tab suspension.
