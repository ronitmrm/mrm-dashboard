# Recruitment

## Employee Master CSV import

Completed employee rows default to Joined, for employees already working.
An explicit employment event of Appointed remains supported for employees yet
to join. Rows with both employee name and employee code blank are skipped.
The import assigns vacant posts only; it does not change existing assignments.

## Creating a job from Employee Master

Create Job first asks for a target date and an optional active Job Description
Template. The Approved Post's linked template is preselected when available;
the operator may select another template or No Template.
The selected template is copied into the new job's requirements; choosing No
Template creates it without a template link. This does not change the Employee
Master's template. Combined-role templates must belong to the selected combined
role. Other job-entry paths retain their existing linked-template defaults.

## Job Description Templates

Individual templates can be assigned to Approved Posts in any department.
Each Approved Post selects its template explicitly; sharing a designation alone
does not select one because different jobs may need different profiles.
Combined-job templates stay tied to their combined role. The operational
department remains on the Approved Post. Legacy template department values do
not restrict assignment.

Each new or edited template requires a Shift Type of Day, Night, or Rotation,
plus a Shift Start Time and Shift End Time. Night shifts may span midnight.
Existing templates without shift details remain blank until edited. A new Job
Post copies the selected template's shift and description into its own record.

Editing a template changes the reusable profile for future Job Posts. HR must
choose whether to apply its requirements to Approved Posts, regardless of
whether they are occupied or vacant. This updates posts already linked to the
template and unlinked posts in its combined role. Posts linked to another
template keep their own profile. The approved-post link and requirement fields
update in the same transaction as the template. Existing Job Posts linked to those Approved
Posts receive the template link when they have none; blank job requirements and
shift fields are filled from the template. Existing job values and jobs linked
to a different template remain historical. Employee assignments are unchanged.

## Approved Post Deletion

An unassigned Approved Post outside a combined role may be deleted when all
linked Job Posts are Closed. Closed jobs retain their stored vacancy code,
title, applications and history; only their Approved Post link is cleared.
The deletion audit retains the original Approved Post and detached job IDs.
Any linked job that is not Closed still blocks deletion.

## Combined Approved Post Deletion

Deleting a combined role removes the grouping, not its individual Approved Posts
or employee assignments. Member posts regain their individual vacancy codes;
job description templates remain available with their combined-role link cleared. The audit
log retains the deleted grouping and membership. Any linked Job Post (including
closed jobs) or pending replacement blocks deletion, preserving recruitment
history and atomic appointment workflows. Deletion requires the independent
Combined Approved Posts delete permission.

## Candidate Assignment

An Approved Post reserved for an appointed replacement is unavailable for a new
Job Post, even while its outgoing employee remains Resigned. A reservation on
any member makes the entire combined role unavailable. Filled or Appointed posts
also remain unavailable. Closing the recruitment job does not release an
appointment. HR must explicitly record Did Not Join to cancel that reservation
and reopen the same job; it does not create a duplicate recruitment opening.
When HR appoints or joins an employee directly from Employee Master, any Open
job linked to that Approved Post closes in the same transaction. The post and
employee assignment remain intact; closing the job only stops recruitment.
When a filled Approved Post later becomes vacant, a new recruitment cycle
creates a new Job Post with the same vacancy code and a distinct job number.
Earlier Closed jobs and their applications remain as recruitment history.

Search Candidate shows candidate profiles before a job is selected. HR may select
candidates first and then an Open job, or select the job first. Choosing or changing
the job retains eligible selections; candidates with an active application for
that job are excluded, and the form reports any removed selections. Assignment
requires both an Open job and at least one selected candidate.

## Awaiting Offer Response

The Interview Workspace lists applications whose final HR Round is Approved,
whose application remains Approved, and whose willingness to join is not yet
recorded. Each application appears once, with contact details and a link to its
Job Workspace to record acceptance or withdrawal. Accepted, declined, withdrawn,
rejected and Did Not Join applications are excluded. This queue is independent
of the interview-history display limit. The formal Offer Letter is still
generated only after acceptance and confirmation of joining terms.

## Appointment and Offer Correction

HR may edit an accepted pending appointment's joining date, salary before and
after probation, salary period, duty timings, probation terms, postal address,
offer date and signatory from the job's applicant actions. Appointment-completion
and employee-record read permissions are required. The form starts with the
current appointment and latest offer details. Candidate identity and job assignment
continue to come from their masters; withdrawal uses the separate lifecycle action.

Saving requires a reason and generates a new offer with its own reference and PDF.
The application, all directly reserved Appointed post dates, new PDF and correction
history save atomically. Failed validation or PDF generation changes nothing.
Pending replacements use the application's date and leave the outgoing employee
untouched. Joined, superseded and stale appointments cannot be corrected here.
The latest offer is shown first; previous issued PDFs remain available as history.

## Did Not Join

An accepted candidate appointment that did not result in joining. HR records
the non-joining date and a required reason against the Candidate Application.
The date must be on or after the agreed joining date and cannot be in the future.

Only posts still reserved as Appointed for that exact application may be
released. Joined employees, replaced assignments, and unrelated posts cannot
be cleared by this action. All posts reserved for the same application,
including combined-role posts, return to Vacant in one transaction.

The application becomes Did Not Join and the same job reopens, retaining its
original requirement. Original appointment terms, interviews and generated
Offer Letter remain historical evidence; the cancellation reason and date are
recorded in candidate history and the audit log. Repeating the action cannot
release another vacancy. A future application is a new application cycle.

## Pending Replacement Appointment

A Resigned employee's Approved Post may reserve one incoming employee while the
outgoing employee serves notice. This reservation does not add approved headcount
or replace the current employee, Employee ID, or Last Working Date.

Employee Master shows the outgoing employee and the pending replacement as
separate rows. The incoming row is Appointed until HR confirms joining, with
its agreed joining date when available and its own Employee ID only. Both rows
refer to the same Approved Post; Approved Posts remains one headcount row.

Employee Assignment's Appointed event and accepted Job Candidate Appointment
details record the replacement separately. Candidate reservations retain their
application link and agreed joining terms. Did Not Join cancels only that
candidate's pending reservation and reopens the same job; the outgoing employee
is unchanged. Confirming Replacement Joined retains the application link for
employment history. Candidate reservations are cancelled through Did Not Join.
HR may cancel a manual pending appointment without affecting the outgoing employee.
HR explicitly confirms Replacement Joined with the incoming employee's own
numeric Employee ID, including during the outgoing employee's notice period.
The outgoing assignment is retained in replacement history and the incoming
employee becomes Occupied. Employee Master shows both employees during handover;
the outgoing row disappears after its Last Working Date, while history remains.
There is no automatic joining and the outgoing Employee ID is never reused.
Combined jobs reserve and confirm their linked posts atomically.

## Employment Letter

An immutable, generated PDF retained against one employment lifecycle record.
The Offer Letter belongs to the Candidate through the Candidate Application that
produced it. A Candidate's Offer Letter count is the number of completed,
generated Offer Letter files across all of that Candidate's applications; it is
derived from the retained letter history rather than stored as a mutable counter.
The Offer Letter is issued after the candidate accepts the final joining terms.
It includes the agreed post-probation salary range and the duty start/end times
entered during appointment confirmation. Duty times have no default. The salary
range uses the selected salary period. These terms are retained at issuance.
New offers follow the two-page Offer.pdf reference supplied on 2026-09-19:
branded introductory page, plain continuation page with nine full clauses,
and the shared company footer. Salary range and duty times remain appointment
values; sample candidate details and the scanned signature are not reused.
Previously issued PDFs remain immutable.
The Appointment Letter is issued only after the employee has joined and HR
confirms probation completion; the Experience Letter is issued only after the
employee is marked Resigned and reaches the recorded Last Working Date. Each
letter keeps the employee identity, employment facts, entered letter details,
reference number, issue date, and exact generated file that were current at
issuance. A later person filling the same Approved Post never replaces the
former employee's letter history.

Offer letters are issued before joining and do not inherit an Employee ID from
the Approved Post. The letter register shows Pending Joining until that candidate
application has its own employee assignment; joined replacements use their retained
replacement Employee ID. The outgoing employee's ID belongs only to that employee.

_Avoid_: Regenerating a historical letter from current master data, storing a
letter only on an Approved Post, appointment letter before probation completion,
experience letter before departure.

## Employee Assignment and Probation Reminder

A joined employee's assignment to an Approved Post remains a separate historical
record after the post is vacated or another employee joins. It retains the
employee identity, post code, actual joining date, planned last working date,
actual last working date, exit type and note. An employee may resign through the
normal process or leave without completing it; both departures use the actual
last working date. A planned resignation date is kept separately until the
employee leaves. Pending appointments remain in the existing candidate and post
records until joining is confirmed. Older current assignments start as a baseline;
prior occupants without a retained letter or replacement snapshot cannot be
reconstructed reliably.

Employee Data begins with a confirmed Joined assignment and an Employee ID; an
appointment alone does not create an employee data row. HR may fill the row later.
Date of birth, contact and emergency details, addresses, gender, blood group,
bank and statutory identifiers belong to the person identified by the Employee
ID and remain editable across assignments. Shift, salary, salary rate increment,
PF status and ESIC status belong to the particular joined assignment. If the
employee leaves and later rejoins, the new employment period gets its own term
details and may have a different department or designation, while the same Employee
ID carries the existing personal details. A new Employee ID needs an explicit
link to the earlier person; names alone never establish identity.
Concurrent post assignments for the same Employee ID belong to one employment
term while any of those posts remains occupied. Releasing one post as Role Changed
does not start a new term; a later join after all posts have ended does.
Employee Data displays the Combined Code for combined roles instead of listing
every member department. Its CSV contains one row per employment term. Assignment
ID and Employee ID identify the existing term; uploads edit personal and term
details only. Personal details must agree across CSV rows for the same Employee
ID. Blank detail cells clear saved values; identity and employment dates are not
editable through this CSV. The entire upload is saved together or rejected.

HR Tasks shows a separate Phone Number column. It uses the Employee Data
Contact No when personal details have been saved; otherwise it uses the candidate
linked to that assignment's application. A cleared saved contact stays blank.
Missing numbers display as a dash; names and the post's current occupant never
determine contact identity.

Pending HR Tasks links to the latest generated Offer Letter retained against
that assignment's Candidate Application. It opens the saved PDF in the attachment
viewer for users permitted to read employment letters. Assignments without a
linked, generated offer show a dash; the current post occupant never determines
which offer is shown.

When a combined job is split, an employee who stays employed may stop covering
one standalone Approved Post. HR records a Role Changed date for that post only.
The post becomes Vacant, its assignment history retains the employee and role end
date with a Role Changed status, and an audit event records the change. This is
not a resignation or departure; the employee's other posts remain occupied.
Role Changed is available only when the employee holds another occupied post.

For each joined assignment, HR sees a reminder as probation end approaches.
The date comes from the Offer Letter probation period when available, or HR
enters it when missing. The reminder is due on the probation end date and
completed when the Appointment Letter is issued and its PDF retained.
For employees carried over from the former system, HR may record that
probation was already completed there. That explicit migration record also
completes the reminder; a past due date alone does not. When HR supplies a
legacy workbook with joining and probation end dates and confirms completion
for its past-dated rows, those rows receive an explicit completion record.
Future-dated rows remain pending. A probation-date update may include an
optional remark retained in the assignment audit history and shown with the
current reminder.
Completed reminders leave the open HR task list and remain in a probation
completion log. The log identifies whether completion came from an issued
Appointment Letter or a recorded legacy completion; its recorded date is the
letter issue date or the legacy audit date, not an inferred probation end date.
If an employee leaves before probation is completed, the open reminder closes
on the actual last working date. Departure does not count as probation
completion; the exit remains in Employee Assignment History.
Assignment history includes departures recorded as Left Without Process as
well as formal resignations, with the actual last working date and exit note.

The Offer and Joining Register follows each candidate application through final
HR approval, response, Offer Letter issuance, joining or Did Not Join. A declined
response is shown even when no formal Offer Letter was generated. Joining is
derived from the retained employee assignment so vacating the post never changes
the historical Joined outcome.

## Interview Assessment Correction

The latest completed Recruitment Interview Round may correct its schedule,
interviewer, question scores, comments, and decision. Changing the decision
updates the Candidate Application status: Rejected closes it, Hold pauses it,
and Approved returns it to Interview or completes HR approval.

An earlier round cannot change decision while a later round exists. Confirmed
Candidate Appointment terms also lock the interview decision because changing
it would contradict the Approved Post assignment.
