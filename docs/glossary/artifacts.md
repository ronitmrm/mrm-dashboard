# Artifacts

Approved target contract for [issue #88](https://github.com/ronitmrm/mrm-dashboard/issues/88).
Implementation and cutover status: [delivery specification](../specs/private-google-cloud-artifacts.md).

**Artifact**: One immutable logical business file in PostgreSQL. It retains its
Organization, filename, media type, byte size, SHA-256, uploaded or generated
origin, actor, lifecycle, business usages, and version state. A replacement
creates a new Artifact and supersedes the former link; it never changes stored
bytes or prior business evidence.

**Physical Artifact Object**: One private immutable stored object referenced by
one or more logical Artifacts in the same Organization. Matching SHA-256 and
byte size reuse physical storage only within that Organization. Separate
filenames, purposes, modules, versions, and links never collapse into one
logical record. Ledger storage totals count each live physical object once.

**Retained Upload**: Enquiry and Sales Clarification drawings; Design internal,
customer-marked, and CAD files; Customer Purchase Order sources; Candidate
resumes; Store Item drawings; Warranty/Guarantee Cards; and the original
enquiry-line import source. Every new retained upload uses the shared Artifact
service. Historical local-file references remain readable but are never new
write targets.

**Issued Artifact**: The exact sent Quote PDF, sent PI PDF/XLSX set, or issued
Store Purchase Order PDF. Issuance is fail-closed and idempotent; a draft
preview is transient, and later business-data changes never regenerate or
replace an issued Artifact. Sensitive Employment Letters remain in authenticated
Recruitment storage and remain outside the shared Artifact provider.

**Transient File**: A report, template, export, draft preview, or unretained
import generated or parsed on demand without an Artifact record. This includes
operational-master, enquiry-register, Commercial Master, Purchase Order-line,
and employee-assignment imports.

**Authenticated Artifact Access**: Every request for retained bytes requires
an authenticated application session, the relevant capability, and Organization
authorization. Possession of an application link or storage locator grants no
access by itself. Preview and download obey the same access boundary.

**Pending Upload**: Temporary bytes awaiting validation and an authorized
business submission. They are not a retained Artifact or issued evidence;
rejected, expired, or abandoned pending bytes may be discarded. Retention begins
only when the shared Artifact service commits the logical Artifact and its
business usage.

**Manual Artifact Deletion**: An `artifacts.delete` action requiring the exact
target, a reason, and an audited tombstone. Shared physical bytes remain while
another live logical Artifact references them. Final-reference provider failure
stays visible and retryable; nothing is deleted automatically or regenerated
after deletion.
