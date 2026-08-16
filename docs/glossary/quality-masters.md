# Quality and Checklist Masters

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
