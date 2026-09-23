import { expect, it } from "vitest"

import {
  normalizePermissionKeys,
  permissionAccessRows,
  permissionKeysForPreset,
} from "./permission-access"

it("keeps a production task executable when another task sharing its write permission is removed", () => {
  const material = "operations.floors.cnc.shop_floor_tasks.shop_floor_material.write"
  const progress = "operations.floors.cnc.machinist_tasks.machinist_progress.write"
  const legacy = "operations.shop_floor.write"
  const rows = permissionAccessRows([material, progress, legacy].map((key) => ({
    key, module: "operations", name: key,
  })))
  const progressRow = rows.find((row) => row.id === "task:production.cnc.machinist_progress")!
  const saved = normalizePermissionKeys(permissionKeysForPreset(
    progressRow, [material, progress, legacy], "none"
  ))

  expect(saved).toContain(material)
  expect(saved).toContain(legacy)
  expect(saved).not.toContain(progress)
  expect(saved).not.toContain("operations.floors.forging.shop_floor_tasks.shop_floor_material.write")
})
