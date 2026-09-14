# Recruitment

## Combined Approved Post Deletion

Deleting a combined role removes the grouping, not its individual Approved Posts
or employee assignments. Member posts regain their individual vacancy codes;
job templates remain available with their combined-role link cleared. The audit
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

Search Candidate shows candidate profiles before a job is selected. HR may select
candidates first and then an Open job, or select the job first. Choosing or changing
the job retains eligible selections; candidates with an active application for
that job are excluded, and the form reports any removed selections. Assignment
requires both an Open job and at least one selected candidate.

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

## Interview Assessment Correction

The latest completed Recruitment Interview Round may correct its schedule,
interviewer, question scores, comments, and decision. Changing the decision
updates the Candidate Application status: Rejected closes it, Hold pauses it,
and Approved returns it to Interview or completes HR approval.

An earlier round cannot change decision while a later round exists. Confirmed
Candidate Appointment terms also lock the interview decision because changing
it would contradict the Approved Post assignment.
