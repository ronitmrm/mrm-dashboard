import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

const transformUrl = new URL("./convex-logical.ts", import.meta.url)
const snapshotUrl = new URL("./convex-snapshot.ts", import.meta.url)

function insertColumns(source: string, table: string) {
  const match = source.match(
    new RegExp(`INSERT INTO quality\\.${table} \\(([\\s\\S]*?)\\)\\n    SELECT`)
  )
  expect(match, `missing ${table} insert`).not.toBeNull()
  return match?.[1] ?? ""
}

describe("Convex transformer final-schema compatibility", () => {
  test("supplies the normalized quality identity columns added after staging", async () => {
    const source = await readFile(transformUrl, "utf8")

    expect(insertColumns(source, "first_piece_inspections")).toContain(
      "check_key"
    )
    expect(insertColumns(source, "hourly_checks")).toContain("check_key")
    expect(insertColumns(source, "setup_checklist_sessions")).toContain(
      "session_key"
    )
  })

  test("marks a fully reconciled migration run complete", async () => {
    const source = await readFile(snapshotUrl, "utf8")

    expect(source).toContain("status = 'complete'")
    expect(source).toContain("completed_at = now()")
  })
})
