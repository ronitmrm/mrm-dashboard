---
title: Add UploadThing object storage and an Artifacts ledger
status: implemented
target: feat/object-storage
---

## Implementation status

Completed through the expand-migrate-contract sequence on
`feat/object-storage`. New retained Commercial, Recruitment, and Store uploads,
the retained enquiry-line import source, and issued Quote, PI, and Store
Purchase Order documents all use the shared Artifact service. Local storage is
read-only compatibility for historical rows. Reports, exports, templates,
draft previews, and the other listed imports remain transient.

## Problem Statement

The application accepts business files and generates official documents, but
their bytes are either written to one local filesystem or generated again on
every download. Local storage is not durable across deployments, and live
regeneration can make a historical Quote, Proforma Invoice, or Store Purchase
Order reflect values that changed after issuance.

File handling is also inconsistent. Commercial and recruitment workflows use
`core.files` and `core.file_links`, while Store keeps weaker document metadata.
Replacement behavior differs by workflow, identical bytes are stored more than
once, and administrators have no application ledger from which to inspect or
delete artifacts.

The application needs one durable file lifecycle for uploaded and generated
artifacts, backed by UploadThing's free tier, without expanding transient
imports, reports, or templates into permanent records.

## Solution

Introduce a shared Artifact service that stores bytes in UploadThing and keeps
canonical metadata, versions, links, checksums, lifecycle state, and audit
history in PostgreSQL. UploadThing objects use `public-read` access. Application
authorization controls upload operations and discovery inside the application,
but anyone possessing an object URL can read it until its final logical
reference is manually deleted.

Deduplicate exact bytes within an Organization using SHA-256 and byte size.
Keep separate logical Artifact records and links for every upload, generated
document, filename, purpose, and version even when they share one physical
object. Replacements never mutate or discard earlier versions.

Persist the exact Quote PDF when the Quote is sent, both Proforma Invoice PDF
and XLSX when the PI is marked sent, and the Store Purchase Order PDF when the
Store Purchase Order is created. The relevant business action must not reach
its issued state unless all required artifacts are stored and linked.

Add an Administration Artifacts page for authorized administrators to search,
filter, preview, download, inspect usage, and manually delete logical
artifacts. Deletions require confirmation and a reason, remain visible as
audited tombstones, and remove physical UploadThing bytes only after the final
live logical reference is deleted. Nothing is deleted automatically, and a
deleted generated artifact is not reconstructed.

## User Stories

1. As a Commercial Enquiries user, I want enquiry drawings stored durably, so that they survive application deployments.
2. As a Commercial Enquiries user, I want Sales Clarification attachments stored durably, so that later stages can access the same evidence.
3. As a Design user, I want internal drawings stored durably, so that design history remains available.
4. As a Design user, I want customer-marked drawings stored durably, so that customer feedback remains attached to the correct design task.
5. As a Design user, I want CAD files stored durably, so that downstream work does not depend on one application filesystem.
6. As a Commercial Orders user, I want the source Customer Purchase Order stored durably, so that the accepted order can be traced to its source file.
7. As a Recruitment user, I want Candidate resumes stored durably, so that authorized recruitment workflows retain the submitted document.
8. As a Store user, I want Store Item drawings stored durably, so that the Asset Drawing remains available from the Store Item Workspace.
9. As a Store user, I want Warranty and Guarantee Card files stored durably, so that receipt and physical-asset evidence survives deployments.
10. As a Commercial Enquiries user, I want the original enquiry-line import file retained with its Import Review, so that reviewed changes can be traced to their source.
11. As an operational-import user, I want other import files discarded after parsing, so that temporary workbooks do not consume object-storage capacity without a business need.
12. As a Quote user, I want the exact sent Quote PDF preserved, so that later master-data or pricing changes cannot alter what was issued.
13. As a Commercial Orders user, I want the exact sent Proforma Invoice PDF preserved, so that future downloads show the issued values.
14. As a Commercial Orders user, I want the exact sent Proforma Invoice workbook preserved, so that the spreadsheet record matches the issued PDF and historical PI lines.
15. As a Store user, I want the Store Purchase Order PDF preserved when the order is created, so that later receipt progress or Supplier changes cannot alter the issued order.
16. As a Quote user, I want draft previews to remain live and disposable, so that object storage contains only issued documents.
17. As a PI user, I want draft previews to remain live and disposable, so that revisions can be checked before issuance without creating permanent artifacts.
18. As a report user, I want operational reports and exports generated on demand, so that live reports continue to reflect current data.
19. As a template user, I want CSV and workbook templates generated on demand, so that templates do not consume durable storage.
20. As a user replacing a file, I want the new file to become current without overwriting the earlier version, so that file history remains intact.
21. As an auditor, I want every logical Artifact to retain its filename, purpose, origin, actor, timestamp, checksum, size, media type, and linked business record, so that its provenance is clear.
22. As an auditor, I want uploaded and generated artifacts represented through one canonical metadata model, so that Store, Commercial, and Recruitment files have consistent evidence.
23. As an auditor, I want superseded versions to remain discoverable, so that replacement history is not lost.
24. As an Organization user, I want identical bytes reused across modules, so that duplicate uploads do not waste the free storage allowance.
25. As an Organization user, I want duplicate bytes to retain separate logical names and business links, so that deduplication does not merge business meaning.
26. As an Organization user, I want deduplication isolated to my Organization, so that another Organization's stored object is never reused.
27. As a user retrying an upload, I want the operation to be idempotent, so that retries do not create duplicate physical objects or links.
28. As a Quote sender, I want sending to fail if its PDF cannot be stored, so that no sent Quote exists without its official file.
29. As a PI sender, I want marking the PI sent to fail unless both PDF and XLSX artifacts are stored, so that the issued document set is complete.
30. As a Store purchaser, I want Store Purchase Order creation to fail safely if its PDF cannot be stored, so that no issued Store Purchase Order lacks its official file.
31. As a user, I want an object-storage failure reported as an actionable error, so that I can retry without silently advancing the workflow.
32. As a user, I want existing application download links to remain valid, so that object-storage adoption does not break established workflows or bookmarks.
33. As a user, I want public file URLs to open without signed-URL generation, so that the free-tier access model remains simple.
34. As an administrator, I want one Artifacts page listing uploaded and generated files, so that I can operate the complete file ledger.
35. As an administrator, I want the ledger scoped to my Organization, so that it never exposes another Organization's artifact metadata.
36. As an administrator, I want to search by filename and linked business record, so that I can locate an artifact quickly.
37. As an administrator, I want to filter by module, purpose, origin, lifecycle state, media type, and date, so that I can investigate a useful subset of the ledger.
38. As an administrator, I want current, superseded, and deleted versions distinguished, so that lifecycle state is unambiguous.
39. As an administrator, I want to see logical-reference counts and every usage of deduplicated bytes, so that deletion impact is clear.
40. As an administrator, I want unique stored-byte totals separated from logical Artifact counts, so that I can understand use of the 2 GB free allowance.
41. As an administrator, I want native previews for images and PDFs, so that common artifacts can be inspected without downloading them first.
42. As an administrator, I want metadata and download access for workbook, CAD, and other non-previewable formats, so that every Artifact remains usable without building custom viewers.
43. As an administrator, I want Artifact deletion protected by a dedicated capability, so that ledger visibility does not imply destructive authority.
44. As an administrator deleting an Artifact, I want to enter a reason and confirm the exact target, so that accidental deletion is less likely.
45. As an administrator deleting an issued Quote, PI, or Store Purchase Order, I want an additional warning, so that loss of an official document is explicit.
46. As an administrator deleting one reference to deduplicated bytes, I want other references to keep working, so that unrelated records are not broken.
47. As an administrator deleting the final live reference, I want the public UploadThing object deleted, so that its URL stops serving the file.
48. As an auditor, I want deleted Artifact metadata, actor, time, and reason retained as a tombstone, so that deletion remains accountable.
49. As an auditor, I want successful deletion to be distinguishable from a failed provider deletion, so that the ledger never claims a public URL was revoked when it was not.
50. As an administrator, I want deleted generated files to remain deleted, so that deletion does not trigger hidden reconstruction or regeneration.
51. As an access administrator, I want Artifact read and delete capabilities assignable through existing access administration, so that permissions follow the established model.
52. As a non-administrator, I want my existing module permissions to continue governing file discovery, so that the ledger does not broaden routine access.
53. As an operator, I want new writes to use UploadThing while legacy local-file references remain readable, so that cutover does not break known historical rows.
54. As a maintainer, I want every retained upload seam to call one Artifact interface, so that hashing, deduplication, versioning, and deletion rules cannot drift by module.
55. As a maintainer, I want UploadThing isolated behind a narrow provider boundary, so that tests can exercise Artifact behavior without calling the real service.

## Implementation Decisions

- UploadThing is the sole object-storage provider for new retained files and official generated artifacts.
- UploadThing objects use `public-read`. Private ACLs, signed URLs, and authenticated byte proxying are not part of this implementation.
- Application authentication and capabilities still protect upload, discovery, linking, and deletion. They do not protect a public URL after it has been disclosed.
- Use the current UploadThing server SDK and `UTApi.uploadFiles` from the existing server-action boundary. This preserves existing form behavior and allows authoritative server-side hashing before provider upload.
- The UploadThing token is server-only configuration. Missing or invalid configuration produces an actionable storage error and cannot silently fall back for new writes.
- Keep the provider boundary narrow: upload bytes, delete one physical object, and return provider identity plus its canonical public URL. Do not build a general multi-provider storage framework.
- PostgreSQL remains canonical for all Artifact metadata. UploadThing file listings are not an application read model.
- Add an Organization-scoped physical-object relation beneath `core.files`. It records SHA-256, byte size, provider, provider key, canonical public URL, provider lifecycle state, and timestamps.
- Enforce one live physical object per Organization, SHA-256, and byte-size tuple. The checksum identifies exact content; byte size guards lookup and validation.
- Keep `core.files` as the logical Artifact record. Each logical Artifact preserves filename, media type, uploaded/generated origin, source provenance, actor, lifecycle state, deletion evidence, and a reference to its physical object.
- Keep `core.file_links` as the canonical connection between a logical Artifact and a business record. Extend link lifecycle metadata sufficiently to identify purpose, version order, current status, and supersession without overwriting history.
- Normalize Store drawings and Guarantee Card metadata through the same `core.files` and `core.file_links` model. Domain tables may retain current-file references where useful, but they are not independent storage ledgers.
- Preserve additive compatibility for existing file columns and local storage references during rollout. New writes never create local files.
- Compute SHA-256 and byte size before calling UploadThing. If a live physical object with the same Organization fingerprint exists, skip the provider upload and create only the new logical Artifact and link.
- Concurrent uploads of the same fingerprint must converge on one physical object. Reservation and retry state must be explicit and idempotent; failed attempts must not create duplicate logical versions.
- A provider object may back logical Artifacts from different modules and from both uploaded and generated origins within the same Organization.
- Dedupe never crosses Organization boundaries, even when bytes are identical.
- A replacement creates a new logical Artifact and link version, marks the former link superseded, and leaves the former Artifact and bytes intact.
- Preserve the existing per-purpose file-type allowlists and 10 MB/25 MB limits. Validate filename, declared media type, accepted extension, actual byte size, and required presence on the server before storage.
- Retained uploaded seams are: enquiry-item and Sales Clarification drawings; Design internal, customer-marked, and CAD files; Customer Purchase Order source files; Candidate resumes; Store Item drawings; and Store Warranty/Guarantee Card files.
- Retain the original enquiry-line import file and link it to its Import Review. Continue parsing and discarding operational-master, enquiry-register, commercial-master, Purchase Order-line, and employee-assignment imports.
- Persist the Quote PDF only when Send Quote succeeds. A draft Quote PDF remains a disposable preview.
- Persist PI PDF and XLSX as one required issuance set when Mark Sent succeeds. A draft PI preview remains disposable. Later PI approval does not mutate or replace the sent artifacts.
- Persist the Store Purchase Order PDF as part of Store Purchase Order creation because that workflow has no separate issuance transition. Later receipt progress does not mutate the stored PDF.
- Issuance orchestration is fail-closed: all required bytes and logical links must exist before the final issued state becomes observable. Failure leaves the prior or draft state retryable.
- Retrying issuance is idempotent. It must reuse an already stored physical object and avoid duplicate logical issuance links.
- Stored Artifact bytes are immutable. A business revision creates a new Artifact; it never replaces bytes behind an existing public URL.
- Do not add a generic generation snapshot or reconstruction mechanism. The stored file is the official artifact. Once manually deleted, it cannot be regenerated through the Artifacts ledger.
- Continue generating all other PDFs, XLSX workbooks, CSV exports, dashboards, reports, and templates on demand without persistence.
- Existing application download routes remain compatible and resolve retained files to their UploadThing public URLs. Deleted artifacts return an explicit unavailable/deleted response and are never regenerated implicitly.
- Add an Organization-scoped Administration Artifacts page with server-side pagination, search, and filters.
- The ledger displays logical identity, origin, module/purpose, business-record usages, version/current state, filename, media type, byte size, checksum, actor and timestamps, physical-reference count, provider status, and deletion evidence.
- Storage totals sum unique live physical-object bytes rather than logical Artifact sizes. Logical and physical counts are shown separately.
- Preview images and PDFs using browser-native rendering of the public URL. Other formats expose metadata and download/open actions; custom Excel, CAD, or document renderers are not required.
- Add `artifacts.read` and `artifacts.delete` capabilities to the existing access-control system. Administrators receive both by default. Read does not imply delete.
- A manual delete targets one logical Artifact, requires a non-empty reason and explicit confirmation, and writes an audit event.
- Deleting an issued Quote, PI, or Store Purchase Order remains permitted to authorized administrators but requires an additional warning and confirmation.
- Deleting a logical Artifact tombstones its metadata and deactivates its live links. It does not erase the ledger row.
- Physical UploadThing deletion occurs only when no live logical Artifact references the physical object. Deleting one of several deduplicated references must not call provider deletion.
- A deletion is complete only after required provider deletion succeeds. Provider failure remains visible and retryable; the system must not claim the public URL is revoked prematurely.
- No retention schedule, orphan sweeper, capacity-based cleanup, or other automatic deletion is introduced.
- Keep legacy local-file reads for existing metadata that lacks an UploadThing physical-object reference. Do not build a legacy-byte migration utility in this scope; no local-data inventory exists in the repository.
- Update the existing data-classification and security documentation during implementation to record the accepted public-URL exception. Current documents describe these files as confidential and authenticated-download-only, which this confirmed decision supersedes.

## Testing Decisions

- Tests assert behavior through public Artifact and workflow interfaces. They do not assert SQL text, SDK call ordering, private helpers, or component structure.
- Follow vertical TDD slices: one failing behavioral test, the minimal implementation needed to pass it, then the next behavior. Do not create a horizontal suite for every upload seam before any seam works end to end.
- The primary test seam is the shared Artifact service backed by a real disposable PostgreSQL database and a controllable provider adapter. UploadThing is the only mocked system boundary.
- The primary seam proves first upload, exact-byte dedupe, separate logical metadata, Organization isolation, version replacement, current/superseded lookup, idempotent retry, tombstoning, shared-reference deletion, final-reference provider deletion, and deletion failure visibility.
- Known literal byte fixtures supply independent SHA-256 and size expectations. Tests must not calculate expected checksums using the production hashing helper.
- Provider-adapter tests verify only the narrow contract: successful upload result, provider failure, deletion success, and deletion failure. They do not reproduce UploadThing internals.
- The issuance workflow seam uses public Commercial Costing, Commercial Orders, and Store repository/action interfaces with real PostgreSQL plus the controllable provider adapter.
- Quote tests prove that Send Quote stores one immutable PDF, that later data changes do not change its served bytes, that retries do not duplicate it, and that storage failure leaves the Quote unsent.
- PI tests prove that PDF and XLSX form one issuance set, later approval does not replace either file, retries are idempotent, and failure of either upload leaves the PI un-sent.
- Store tests prove that creating a multi-line or Repair Store Purchase Order stores its exact PDF, later receipt/status changes do not alter it, and storage failure does not expose an issued order without its PDF.
- Upload-seam contract tests cover one representative existing upload end to end through the shared Artifact service. Remaining seams reuse that contract and receive focused tests only for their distinct file allowlist, purpose, or domain link.
- A focused enquiry Import Review test proves its source file is retained. Existing transient-import tests prove other import files are not persisted.
- The access seam proves Organization scoping, `artifacts.read`, `artifacts.delete`, administrator defaults, and denial of unauthorized list, preview, download discovery, and delete operations.
- The browser seam covers the Artifacts ledger's search/filter/pagination, native PDF/image preview, download/open behavior, reference display, storage totals, deletion reason, issued-artifact warning, tombstone state, and provider-deletion failure state.
- A public-URL contract test explicitly proves that the object URL is not signed and remains readable without an application session until final-reference deletion. This records the accepted access model rather than implying privacy.
- Existing user-attachment storage and user-attachment security tests are prior art for the storage boundary, allowlists, size validation, and read/delete behavior.
- Existing Commercial Costing integration tests are prior art for sent-Quote immutability, superseded history, and concurrent Send Quote behavior.
- Existing Commercial Orders integration tests are prior art for retained Customer Purchase Order metadata and atomic PI lifecycle behavior.
- Existing Store integration tests are prior art for multi-line Store Purchase Orders, Repair Purchase Orders, receipt lifecycle, and retained Asset Drawings.
- Existing PI workbook/PDF and Store Purchase Order PDF tests are prior art for independent document-value fixtures and generated artifact validation.
- Existing access-administration and capability tests are prior art for capability registration, administrator defaults, and request-time authorization.
- Existing commercial export-route tests are prior art for route-level response and workbook contracts.
- Do not add one smoke test per upload form. Shared-service behavior plus one representative end-to-end upload and focused domain differences are sufficient.
- After targeted red-green slices, run the repository's full lint, typecheck, web test, and build gates. Browser verification is required for the Administration Artifacts page.

## Out of Scope

- Private UploadThing ACLs, signed URLs, expiring links, or authenticated byte proxying.
- Treating public URLs as confidential or revocable before physical deletion.
- Antivirus scanning, content disarm/reconstruction, malware sandboxing, OCR, document indexing, or full-text search inside files.
- Custom previews for XLSX, CAD, CSV, or office-document formats.
- Persisting operational reports, dashboard exports, templates, or transient imports other than the enquiry-line Import Review source.
- Automatic deletion, retention schedules, lifecycle expiration, orphan sweeping, capacity-triggered cleanup, or legal holds.
- Reconstructing or regenerating a manually deleted generated artifact.
- Migrating historical local bytes or building a migration/backfill utility before a real legacy-byte inventory exists.
- Cross-Organization deduplication.
- Editing files in place or mutating bytes behind an existing public URL.
- A general provider-agnostic storage platform, S3 compatibility layer, or secondary storage provider.
- A new asynchronous job framework for generation or upload.
- Email delivery, external sharing workflows, or public file-index pages.
- Purchasing or automatically upgrading the UploadThing plan.
- Unrelated redesign of Commercial, Recruitment, Store, import, Quote, PI, or Purchase Order workflows.

## Further Notes

- The [UploadThing pricing page](https://uploadthing.com/), reviewed on 2026-08-23, advertises 2 GB storage and unlimited uploads/downloads for the free app tier. The application ledger therefore reports unique live bytes against 2 GB, but it does not enforce provider billing or plan changes.
- Current UploadThing documentation explicitly supports [`UTApi.uploadFiles`](https://docs.uploadthing.com/api-reference/ut-api#upload-files) from server actions, [`public-read` ACLs](https://docs.uploadthing.com/concepts/regions-acl), and [`deleteFiles`](https://docs.uploadthing.com/api-reference/ut-api#delete-files) by provider file key. Implementation should re-check the current stable package documentation when dependencies are installed.
- UploadThing recommends keeping file metadata in the application database rather than using [`listFiles`](https://docs.uploadthing.com/api-reference/ut-api#list-files) as the primary data source. This aligns with PostgreSQL ownership of the Artifact ledger.
- Public UploadThing URLs are an explicit product decision. Possession of a URL bypasses application authorization until the final physical object is deleted.
- The current repository has no `local-data` directory. Legacy local reads remain as compatibility, but historical byte migration is intentionally deferred.
