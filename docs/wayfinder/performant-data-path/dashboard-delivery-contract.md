# Dashboard delivery contract

Date: 2026-08-08  
Scope: external browser state; SSE carries hints only

## State model

Dashboard delivery is the product of independent state dimensions:

- connection: `connecting | live | retrying`;
- payload: `none | current | stale`;
- canonical request: `initial | canonical-state | settled | error`;
- durable refresh: `idle | pending | running | failed`;
- coverage: `complete | partial`;
- visibility: `visible | hidden`.

The UI derives its presentation from those fields. It does not collapse connection loss, canonical fetch failure, refresh failure, partial coverage, and initial loading into one generic spinner or error.

## Required transitions

| Event                                   | State and visible result                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route starts or floor changes           | Clear payload/version for the new floor, enter `initial`, and show that floor's loading skeleton. Never retain another floor's payload.                |
| Initial canonical state succeeds        | Store that floor and version, render payload, show refresh status and any partial-coverage notice.                                                     |
| Initial canonical state fails           | Keep payload `none`, enter blocking error, expose retry. Authentication/authorization follows the server boundary.                                     |
| SSE opens                               | Mark connection `live`. If payload is stale or the connection was retried, immediately request canonical state.                                        |
| SSE invalidation/version hint           | Retain the current payload and request canonical state. Never merge business data from the event.                                                      |
| Known version is unchanged              | Retain the existing payload exactly; replace refresh/status metadata; settle the request.                                                              |
| Canonical version changed               | Atomically replace the same-floor payload/status/coverage and version. Reject a regressive version and refetch.                                        |
| SSE disconnects                         | Keep the last payload, mark it stale, show a non-blocking “reconnecting” indicator, and allow safe reads. Do not clear the dashboard.                  |
| Canonical refetch fails with prior data | Keep prior payload stale, show a non-blocking error and retry affordance.                                                                              |
| Durable refresh requested/running       | Keep payload visible, show refresh in progress, and allow one-second status polling only while pending/running.                                        |
| Durable refresh fails                   | Keep last payload stale, show the durable failure message and explicit retry. Never imply the stale payload is newly refreshed.                        |
| Safety refresh due                      | While visible, request canonical state every 60 seconds. While hidden, pause the timer; on visibility return, fetch immediately when stale or overdue. |
| Coverage truncated                      | Render returned rows as current, but display the category/floor coverage notice. This is not a transport error.                                        |

An aborted request caused by navigation, floor change, or a newer request is silent. A late response for a prior floor is discarded. Only one canonical request per floor may commit state at a time.

## Initial and stale presentation

With no payload, the content region uses its existing loading skeleton; controls that would mutate unseen state remain unavailable. A blocking initial error replaces the skeleton with retry, not an empty successful dashboard.

With a prior payload, reconnecting/refetching never replaces content with a full-page spinner. The header shows connection/refresh state and the last successful update time. Stale and partial-coverage indicators remain until a successful canonical response proves otherwise. Existing data-entry drafts and optimistic write state are not discarded merely because delivery reconnects.

## SSE contract

The authenticated SSE route emits heartbeats plus `dashboard-version` hints carrying organization and version metadata only. Browser reconnect and `Last-Event-ID` may reduce duplicate work but are not durability mechanisms. On every stream open/reopen, the client requests canonical state using its same-floor known version.

Duplicate, out-of-order, and missed events are harmless because the canonical state query decides the latest version. The stream never authorizes a floor, supplies dashboard JSON, or marks a durable refresh complete.

## Request and normalization boundary

The client sends `knownVersion` only when it belongs to the active floor. Response-envelope merge, unchanged-payload retention, payload extraction, status extraction, and coverage normalization live in `apps/web/lib/dashboard-view-model.ts`; presentation components consume the normalized result.

A `notModified` response with no retained same-floor payload is invalid and triggers a full canonical request without `knownVersion`. Changed responses containing another floor or all floor snapshots are rejected at the boundary.

## Timers and accessibility

- steady visible safety refresh: 60 seconds;
- active pending/running refresh status: 1 second;
- hidden tab: no safety or active polling until visible;
- SSE heartbeat/retry does not reset the 60-second canonical safety deadline;
- connection, stale, refresh failure, and partial coverage are expressed in text/status semantics, not color alone;
- status changes use a non-disruptive live region and do not steal focus.

## Acceptance scenarios

1. first load success, empty-state success, authentication failure, authorization failure, and retryable server failure;
2. changed and unchanged known-version responses for every floor;
3. floor switch with late prior-floor response and no transient cross-floor data;
4. SSE hint, duplicate hint, out-of-order hint, disconnect/reconnect, and missed event recovered by safety refresh;
5. pending/running/complete/failed durable refresh while prior content stays visible;
6. stale canonical refetch failure followed by successful recovery;
7. hidden/visible timer behavior and no overlapping fetches;
8. complete and partial per-category/per-floor coverage;
9. ≤1 KiB unchanged response, one-floor changed response, and Ticket 3 freshness budgets;
10. keyboard/screen-reader status semantics and retained drafts/optimistic state.

Scenarios 1–9 are automated at reducer, route, and browser seams. Scenario 10 and the final loading/reconnecting/partial-coverage presentation require manual UI acceptance.

## Prototype verdict

The throwaway logic prototype is captured on local branch `prototype/dashboard-delivery-state` at `f47be17`. Driving initial load → disconnect → reconnect exposed one invalid transition: reconnect marked the stream live but left stale data settled. The accepted machine now requires an immediate canonical fetch on every reconnect. Floor switches also clear payload/version before fetching, and hints never mutate canonical data.
