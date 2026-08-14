import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("dashboard source projection migrations", () => {
  it("projects and backfills Route Master rows saved by the dashboard", () => {
    const migrationsDirectory = join(import.meta.dirname, "../migrations")
    const sql = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
      .join("\n")
    const repository = readFileSync(
      join(import.meta.dirname, "dashboard-planning.ts"),
      "utf8"
    )

    expect(repository).toContain(
      "'mrm-dashboard', 'dataEntries', $9, $10"
    )
    expect(sql).toMatch(
      /UPDATE manufacturing\.operation_setups[\s\S]*?SET source_table = 'dataEntries'[\s\S]*?source_system = 'mrm-dashboard'/
    )
  })
})
