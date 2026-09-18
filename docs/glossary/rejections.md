# Rejection Register and Quality Control

The Rejection Register consolidates individual setup, in-process setting and
in-process rejection entries with additional Checking, Assembly and Quality
Control rejections. Existing production records are projected, never copied or
entered again. Session event details take precedence over their production-entry
summary, preventing double-counting. Reversed entries are excluded.

Quality Control records additional rejected material against a saved Job Card.
Users can find the Job Card by production unit, part code, or both, across all
units. Stage is required and limited to Checking, Assembly, Quality Control.
Date, type, defect, reason, pieces and kilograms are required. Type/defect/reason
use the existing rejection masters (reason table = Defect; remark table = Reason).
Unit and part are derived from the Job Card. These entries do not rewrite machine
production output or session counters. Re-entering an existing rejection is not
a classification workflow and would double-count it.

The register shows each entry's Job Card, part, date, unit, stage, type, defect,
reason, pieces and kg. Date-range and unit filters apply before display; table
filters and filtered totals support further analysis. Historical kg unavailable
at source is shown as missing, never invented or treated as measured zero. Session
kg is calculated using the session's frozen piece weight and labelled as such;
it is not a measured weight. Legacy production stages follow the saved rejection
type (Setup, In-process setting or In-process); the original type is also retained.
Cumulative opening balances are not dated individual rejection events and are
excluded from this register.
