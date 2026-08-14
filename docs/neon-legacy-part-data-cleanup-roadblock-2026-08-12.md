# Neon Legacy Part Data Cleanup Roadblock

Date: 2026-08-12

Status: Cleanup prepared but blocked on Neon database-owner authentication. No data was deleted.

## Requested outcome

Remove the remaining legacy part data from the MRMPL staging database without
deleting or changing application rules, calculations, tables, functions,
triggers, or migrations.

The cleanup target is deliberately narrow:

```sql
organization.code = 'MRMPL'
catalog.items.source_system = 'convex'
catalog.items.source_table = 'part_reference'
```

This target currently contains 971 rows. It must not be widened to all rows in
`catalog.items` because future Route Master imports create legitimate planning
part references there.

## Verified database state

Connection inspected: Neon `staging` branch, database `neondb`.

Read-only inspection found:

| Record type | Rows tied to the 971 legacy parts |
| --- | ---: |
| `catalog.items` legacy part references | 971 |
| `manufacturing.route_options` | 2 |
| `manufacturing.operation_setups` | 2 |
| `sales.quote_items` | 3 |
| `sales.purchase_order_lines` | 1 |
| `sales.proforma_invoice_lines` | 1 |
| `sales.engineering_change_notes` | 1 |
| `sales.engineering_change_decisions` | 1 |
| `sales.design_tasks` references that use `ON DELETE SET NULL` | 1 |

The proforma invoice is `Approved` and contains one affected line. Its related
purchase order also has one affected line.

Schema inventory recorded before cleanup:

| Schema object | Count |
| --- | ---: |
| Tables | 121 |
| Views | 2 |
| Functions | 90 |
| User triggers | 42 |

These counts are verification evidence only. The cleanup must not issue `DROP`,
`TRUNCATE`, migration, or permanent trigger-alteration statements.

## Current access roadblock

The configured `MIGRATION_DATABASE_URL` connects as
`mrmpl_staging_migration`. That role:

- can delete from `catalog.items`;
- is not a member of `neondb_owner`;
- lacks complete commercial-table maintenance privileges; and
- cannot temporarily manage owner-controlled triggers.

The Neon CLI OAuth refresh token has expired. `neon roles list --branch staging`
opens the official browser authentication flow and waits for login. Owner access
cannot be obtained until that browser login is completed.

Do not store the owner connection string in `.env.local`, a script, this
document, logs, or Git. After login, obtain it through the Neon CLI and keep it
only in the cleanup process environment.

## Protection rules encountered

Two existing rules correctly prevented the cleanup from proceeding with the
migration role:

1. `proforma_invoice_lines_issued_immutable` blocks changes to lines whose
   invoice status is `Sent` or `Approved`.
2. `engineering_change_decisions_append_only` blocks every update or delete of
   an ECN decision.

Both rules must exist and be enabled after cleanup. The proforma chain can be
removed by changing the affected invoice's status to `Cancelled` inside the
cleanup transaction before deleting its only line/invoice. The ECN decision
requires the database owner to temporarily disable only the named append-only
trigger, delete the one targeted legacy decision, and re-enable that same
trigger before commit.

Do not use `session_replication_role = replica`; it disables protections too
broadly.

## Safe resume procedure

1. Complete Neon CLI login in the browser.
2. Obtain a `neondb_owner` connection for `staging/neondb` in process memory
   only.
3. Repeat the read-only target and dependency counts. Stop if the target is not
   exactly the scoped legacy source above or the dependency set has changed.
4. Start one database transaction.
5. Build temporary ID sets for the 971 items and their exact dependent rows.
6. Cancel and remove the single fully targeted proforma invoice chain.
7. Temporarily disable only
   `sales.engineering_change_decisions_append_only`, delete the targeted ECN
   decision/note, and re-enable the trigger before any commit.
8. Delete the targeted purchase-order line, quote items, route options, and
   catalog items. Let declared cascades remove the two operation setups. Let
   declared `ON DELETE SET NULL` constraints clear optional references.
9. Verify inside the transaction:
   - zero scoped legacy part rows remain;
   - zero blocking references remain;
   - all 121 tables, 2 views, 90 functions, and 42 user triggers remain;
   - both named protection triggers exist and are enabled; and
   - no migration ledger rows changed.
10. Commit only after every check passes. Otherwise roll back.
11. Refresh the dashboard read model and confirm Route Master starts empty for
    the removed legacy parts.

## Work completed non-destructively

- Enumerated the exact legacy item scope and direct foreign-key dependencies.
- Enumerated child dependencies for Route, setup, quote, purchase-order, and
  proforma records.
- Inspected both blocking trigger definitions.
- Exercised cleanup attempts only inside explicit transactions. Each attempt
  failed before commit and was rolled back.
- Rechecked the target after the failed attempts: all 971 legacy rows remain.
