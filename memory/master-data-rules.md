# Master Data Rules

Last updated: 2026-07-14

- Master records should be viewed from the separate `Master Tables` dashboard tab, not from the `Data Entry` form list.
- `Data Entry` remains the create/edit/import surface for master rows.
- Master table browsing should show one master at a time because the schemas differ. Each table should provide global search plus per-column dropdown filters similar to Excel.
- The browser should reuse the existing dashboard snapshot/master row sources where possible, with `productionControl` rows preferred over raw data-entry fallback rows.
- Master Tables depends on normalized rows exposed from `productionControl` (`routeMasterRows`, `cycleMasterRows`, `toolingMasterRows`, etc.); if a master table is empty, verify the snapshot exposes that source before changing the UI.