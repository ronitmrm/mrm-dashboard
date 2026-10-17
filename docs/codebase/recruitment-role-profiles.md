# Job description templates

`recruitment.requirement_templates` is the single template source.
`role_responsibilities` stores the free-text Job Description; `questions` stores
optional free-text Questions. Create/edit forms save both in one transaction
using the existing job-template grants, stale-version check and before/after audit.
PostgreSQL bigint `row_version` is normalized to a number before comparison.

Master Data → Job Description Templates edits both areas. Linked previews and
Interview Workspace show separate description/questions sections on the same
screen. Generic interview criteria, rounds, scores and hiring decisions remain
authoritative. Questions are prompts; evidence goes into interview comments.
CSV import/export includes Questions; imports without that column preserve it.

Migration 0222 converts the structured questions to text and folds nonblank
profile fields into the description. The original `role_profile`,
`interview_questions` and `original_role_description` columns remain archived
source data from migration 0215; current application code does not edit them.
The conversion retained existing Job Post snapshots and employee assignments.
Explicitly applying subsequent template edits uses `syncJobsWithTemplate` to
refresh active jobs linked to that template, with before/after audit. Template-only
edits and closed-job requirements are preserved. Approved Post template assignment
continues to link unassigned jobs and fill missing details without overwriting
their existing requirements.

Job Posts and the Job Workspace open `/hr/jobs/[id]/download` through the shared
attachment viewer. The route requires `hr.jobs.read`; `getJobPostDocument` reads
only that organization's saved opening and its reference codes. Salary, shift,
requirements and description come from `recruitment.job_posts`, without a current
template fallback. `lib/hr/job-post-pdf.ts` uses PDFKit with the shared brand logo,
fonts and multilingual text layout, flowing long descriptions across A4 pages.
The route serves private, uncached PDFs inline, with attachment disposition for
the viewer's explicit download action. No PDF is persisted and no schema changes
are needed.
