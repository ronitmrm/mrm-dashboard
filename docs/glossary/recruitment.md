# Recruitment

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
