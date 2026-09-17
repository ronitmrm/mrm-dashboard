# Quality and Checklist Masters

Rejection Type, Rejection Remark, and Defect / Downtime Reason are
company-wide masters. Their Production Unit is **Full Software / Not
Applicable**. Quality Inspection Parameter Master remains scoped to one
Production Unit.

The Job Card Rejection view presents three separate dimensions: Rejection Type
(the saved type), Rejection Reason (the saved remark/cause), and Defect (the saved
Defect / Downtime Reason). For example: Setup Rejection / Drawing Error / Length
Short. Its pattern tabs aggregate rejected pieces independently by each dimension;
the rejection log exposes each as a separate filterable column. Saved values and
quantities remain unchanged.

A referenced Parameter or Measuring Instrument can be deleted when a replacement from the
same organisation is selected. Replacement reassigns linked inspection parameter
definitions and their displayed names atomically, then deletes the old master.
Saved inspection snapshots retain their original definitions. Without a
replacement, a referenced master cannot be deleted.

Dimension tolerances may contain numeric values or text such as L1/L3.
Text tolerances must remain visible and require Text or Ok / Not Ok input;
Number cannot be selected or saved while either tolerance is non-numeric.
Imported `ok/not ok` values mean Ok / Not Ok, not Number.

## Generated master codes

Rejection Type, Defect / Downtime Reason, Rejection Remark, Setup Checklist,
and Maintenance Checklist codes are assigned by the system in their established
sequences (`RT`, `DC`, `RR`, `SC`, and `MC`). Users cannot choose these codes.

CSV templates therefore omit the code column. Older CSV files containing a code
remain importable, but that value is used only to group rows belonging to the
same checklist. It never becomes the saved master code or changes the sequence.

Every rejection-master CSV row receives its own next code. Checklist rows with
the same uploaded grouping value—or the same title when no grouping value is
present—receive one shared next checklist code.
