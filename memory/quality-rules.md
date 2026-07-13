# Quality Rules
- 2026-07-13: First-piece inspection and hourly quality checks share `quality_parameter_master` rows as a Quality Inspection Parameter Set keyed by item, option, setup, and parameter code. Data Entry maintains the full setup parameter set in a table; legacy `first_piece_inspection_master` rows remain read-only fallback for existing data.
