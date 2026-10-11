# Management review meetings

`document_control.management_reviews` owns minutes, attendance, structured inputs
and conclusions/outputs. `management_review_actions` owns work across meetings;
`management_review_action_reviews` links a stable point to discussions and retains
its then-current snapshot. Approval freezes minutes/review links; later action
updates do not rewrite them. Audit retains approved snapshots and later reopening.
Canonical lifecycle: [ISO documents glossary](../glossary/iso-documents.md).

Repository: `packages/db/src/management-review.ts`. Routes:
`/iso-document/management-review`, meeting `[id]` and action `actions/[id]`.
All reads/writes are organization-scoped; participants/assigned staff access their
relevant records without all-record grants. `iso.management_review.read/manage`
cover viewing/preparing; `approve` is QA minutes approval, `verify` is QA action
closure. Staff assignment uses the shared active ISO staff directory.

Migration 0213 creates the three tables, restricted role grants/capabilities and
the supplied May example as Draft with nine unconfirmed attendance entries and
six Open follow-ups. Full source tables/hash remain available; prior completion
claims do not create approved minutes or closed actions. Imported names need
account confirmation, and source notes need period/evidence/decision review.
