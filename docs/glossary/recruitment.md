# Recruitment

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

## Employment Letter

An immutable, generated PDF retained against one employment lifecycle record.
The Offer Letter belongs to the Candidate through the Candidate Application that
produced it. A Candidate's Offer Letter count is the number of completed,
generated Offer Letter files across all of that Candidate's applications; it is
derived from the retained letter history rather than stored as a mutable counter.
The Offer Letter is issued after the candidate accepts the final joining terms;
the Appointment Letter is issued only after the employee has joined and HR
confirms probation completion; the Experience Letter is issued only after the
employee is marked Resigned and reaches the recorded Last Working Date. Each
letter keeps the employee identity, employment facts, entered letter details,
reference number, issue date, and exact generated file that were current at
issuance. A later person filling the same Approved Post never replaces the
former employee's letter history.

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
