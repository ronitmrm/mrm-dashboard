import { expect, it } from "vitest"

import {
  normalizePermissionKeys,
  permissionAccessLevelForKeys,
  permissionAccessRows,
  permissionKeysForPreset,
} from "./permission-access"

it("keeps CNC machinist access when Conventional-01 machinist access is removed", () => {
  const cnc = "operations.floors.cnc.machinist_tasks.machinist_progress.write"
  const conventional = "operations.floors.conventional.machinist_tasks.machinist_progress.write"
  const legacy = "operations.shop_floor.write"
  const rows = permissionAccessRows([cnc, conventional, legacy].map((key) => ({
    key, module: "operations", name: key,
  })))
  const cncRow = rows.find((row) => row.id === "task:production.cnc.machinist_progress")!
  const conventionalRow = rows.find((row) => row.id === "task:production.conventional.machinist_progress")!
  const selected = permissionKeysForPreset(conventionalRow, [cnc, conventional], "none")
  const saved = normalizePermissionKeys(selected)

  expect(permissionAccessLevelForKeys(cncRow, selected)).toBe("full")
  expect(permissionAccessLevelForKeys(conventionalRow, selected)).toBe("none")
  expect(saved).toContain(cnc)
  expect(saved).toContain(legacy)
  expect(saved).not.toContain(conventional)
})
