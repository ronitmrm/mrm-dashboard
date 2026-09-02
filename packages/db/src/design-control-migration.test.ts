import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

const migrationUrl = new URL(
  "../migrations/0109_design_bom_ecn_drawing_control.sql",
  import.meta.url
)
const pendingUploadMigrationUrl = new URL(
  "../migrations/0110_legacy_drawing_pending_upload.sql",
  import.meta.url
)

describe("Design BOM, drawing, and ECN control migration", () => {
  test("creates immutable current-only Product Design and Drawing revisions", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(/CREATE TABLE catalog\.product_design_revisions/i)
    expect(migration).toMatch(/CREATE TABLE catalog\.drawing_revisions/i)
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX product_design_revisions_current_unique[\s\S]*WHERE is_current/i
    )
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX drawing_revisions_current_unique[\s\S]*WHERE is_current/i
    )
    expect(migration).toMatch(/prevent_released_design_revision_mutation/i)
  })

  test("adds HOD review, cost impact, drawing requirements, and revision-00 backfills", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(/design_approved_by_user_id/i)
    expect(migration).toMatch(/design_rejection_remarks/i)
    expect(migration).toMatch(/cost_impact_drivers_json/i)
    expect(migration).toMatch(/drawing_requirement/i)
    expect(migration).toMatch(/processesRequired/i)
    expect(migration).toMatch(/'00'/)
    expect(migration).toMatch(/pricing\.ecns\.engineering_approve/i)
  })

  test("allows a Required legacy drawing to remain Draft until its file is attached", async () => {
    const migration = await readFile(pendingUploadMigrationUrl, "utf8")

    expect(migration).toMatch(/DROP CONSTRAINT drawing_revisions_check2/i)
    expect(migration).toMatch(
      /status NOT IN \('Released', 'Superseded'\)[\s\S]*requirement_status = 'Not Required'[\s\S]*file_id IS NOT NULL/i
    )
  })
})
