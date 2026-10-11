# Recruitment role profiles

Existing `recruitment.requirement_templates` remain the single role/template
source. `role_profile` holds purpose, reporting, decision authority, limits,
escalation, results and competence. `role_responsibilities` holds duties.
`interview_questions` holds stable question IDs, round, focus, scenario and
response indicators. Original descriptions and migrated questions remain retained.

Master Data → Roles, Responsibilities & Authority edits profiles; HR → HR
Questions edits banks. Both use the existing job-template read/save grants.
Role previews and Interview Workspace expose separate profile/questions tabs.
Generic interview criteria, rounds, scores and hiring decisions stay authoritative.
Questions are prompts; evidence goes into interview comments.

Profile/question saves retain before/after audit and reject stale versions.
PostgreSQL `row_version` is bigint and arrives as text; convert it to a number
for displayed versions and both profile/question optimistic checks.
Changing a profile does not rewrite existing job descriptions or question banks.
CSV profile imports preserve profile data when no role columns are supplied.
The display completeness check requires duties, purpose, reporting, authority,
limits and escalation; it does not establish delegated approval or employee competence.

Migration 0215 separates numbered screening questions from recognized headings,
retains the exact original description, improves evidence prompts and adds three
RRA scenario questions. Authority fields remain empty for company assessment.
