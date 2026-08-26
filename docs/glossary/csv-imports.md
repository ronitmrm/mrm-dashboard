# CSV Import Deduplication

Every CSV or spreadsheet import keeps the first exact business row and skips
later copies before validation or persistence. Differences in real fields—such
as setup number, checklist sequence, quantity, date, or machine—keep rows
distinct.

Uploading the same data again must reuse the existing database identity instead
of creating another record. Existing repository identities continue to govern
planning and operational masters. Auto-coded quality and checklist masters
match by their normalized name or title and reuse only a valid generated code.
Production-output and commercial-register imports use stable import identities.

This rule prevents new duplicates. It does not delete or merge historical
duplicates automatically, because doing so could remove linked operational
history.

The original enquiry-line import file is retained as an uploaded Artifact on
its Import Review. Operational-master, enquiry-register, Commercial Master,
Purchase Order-line, and employee-assignment imports are parse-and-discard:
their parsed business rows persist, but their uploaded workbook or CSV does
not create an Artifact.
