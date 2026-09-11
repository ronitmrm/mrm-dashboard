# Private Artifact delivery through the application

Date: 2026-09-09. Status: Accepted target; implementation pending in
[issue #88](https://github.com/ronitmrm/mrm-dashboard/issues/88).

Retained confidential Artifact bytes move to private Google Cloud Storage while
PostgreSQL keeps logical identity, Organization deduplication, history, and
audited deletion. Application authorization governs every byte request because
possession of a provider URL must not bypass access control. The additional
application bandwidth is acceptable for this workload; public and signed
download URLs are excluded.

Preserve existing upload limits, including 25 MiB drawings. Vercel's 4.5 MB
request limit requires sequential bounded application requests into a
server-owned GCS resumable session. Direct upload grants would reduce proxy
traffic but disclose a bearer upload credential; keeping the session server-only
preserves authorization on every request and avoids new signing privileges.
Temporary pending bytes become retained Artifacts only after server validation
and an authorized business commit. Their cleanup does not alter retained-file
deletion rules. See the [delivery specification](../specs/private-google-cloud-artifacts.md)
for migration and verification decisions.
