# Risk monitoring and customer satisfaction reports

Domain contract: [ISO Document](../glossary/iso-documents.md).

Risk-Based Thinking uses `document_control.analysis_records` and the existing
analysis permissions, owner access, version locks and append-only audit. Migration
0217 extends the kind/category constraints, adds assessment/residual review/state
and imports 105 unassessed workbook examples. `risk-thinking-domain.ts` owns the
company rating method and acceptance guards; `iso-analysis.ts` owns transitions.
Closed risk actions display as Monitoring, while their reviews remain due.
Further-treatment reviews clear completion/closure and reopen work. Retired risks
remain available and can be reactivated by QA. Source ratings are never confirmed
assessments. Import identifies risk rows by file hash, sheet and row and skips
existing rows. PEST/SWOT operations retain their existing requirements.

Customer satisfaction uses `document_control.customer_satisfaction_reports`
(migration 0218), `customer-satisfaction-domain.ts` and the matching repository.
The report owner may prepare their assigned draft; managers create/assign; QA
approves, returns and reopens. Submission and approval require monitoring details,
original file and a linked action when follow-up is required. Each report has
one existing ISO action-plan link; work and closure remain in that register.
Register views expose awaiting QA, reviews due and pending follow-up.

Uploads reuse the authenticated pending Artifact transport with the dedicated
`iso-customer-satisfaction` intent. It resolves organization/access from the
report, validates PDF/XLSX/JPG/PNG content and enforces 10 MiB. Final retention
locks and rechecks the report's owner, state and form version in the Artifact
transaction. Current/previous `report` links remain in `core.file_links`.
Report-scoped file routes authorize the dossier and exact file binding before
using the shared integrity-checked private delivery. No public provider URL or
object key is sent to report pages. File versions and report decisions retain
history; exports split assessment/history fields to avoid oversized Excel cells.

Routes live under `/iso-document/analysis/risk` and
`/iso-document/customer-satisfaction`. Navigation and permission catalogs share
those entries. Server wrappers derive grants from the authenticated session;
client forms use public domain subpath exports, canonical fields/tables/statuses
and persisted workbook filters. Managed local file access uses the existing
Development OIDC refresh described in `google-cloud-artifacts-setup.md`.

Workflow rationale draws on the ISO/IAF Auditing Practices Group guidance on
[risk-based thinking](https://committee.iso.org/files/live/sites/tc176/files/documents/ISO%209001%20Auditing%20Practices%20Group%20docs/Auditing%20to%20ISO%209001%202015/APG-RiskBasedThinking2015.pdf)
and [customer feedback](https://committee.iso.org/files/live/sites/tc176sc2/files/documents/ISO%209001%20Auditing%20Practices%20Group%20docs/Auditing%20to%20ISO%209001%202015/APG-CustomerFeedback2015.pdf).
The matrix, QA workflow and register formats are company choices; the guidance
does not prescribe this specific software or scoring method.
