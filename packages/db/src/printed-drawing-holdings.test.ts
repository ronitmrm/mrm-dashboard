import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createPrintedDrawingHoldingsRepository } from "./printed-drawing-holdings"

const input = {
  organizationCode: "MRMPL",
  drawingId: "drawing-1",
  productionFloorCode: "cnc" as const,
  quantity: 3,
  location: "  Cabinet A  ",
  actorUserId: "user-1",
}

describe("Printed drawing holdings", () => {
  it("saves and reads copies for a specific drawing revision and unit", async () => {
    const updatedAt = new Date("2026-10-11T12:00:00Z")
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            drawing_revision_id: input.drawingId,
            production_floor_code: "cnc",
            quantity: 3,
            location: "Cabinet A",
            updated_at: updatedAt,
            updated_by: "Unit HOD",
          },
        ],
      })
    const repository = createPrintedDrawingHoldingsRepository({
      pool: { query } as unknown as Pool,
    })
    await repository.saveForOrganization(input)
    expect(query.mock.calls[0]?.[1]).toEqual([
      "MRMPL",
      "drawing-1",
      "cnc",
      3,
      "Cabinet A",
      "user-1",
    ])
    await expect(
      repository.listForOrganization("MRMPL", { floor: "cnc", uid: "M1" })
    ).resolves.toEqual([
      {
        drawingId: "drawing-1",
        productionFloorCode: "cnc",
        quantity: 3,
        location: "Cabinet A",
        updatedAt,
        updatedBy: "Unit HOD",
      },
    ])
    expect(query.mock.calls[1]?.[1]).toEqual(["MRMPL", "cnc", "M1"])
  })

  it("requires a location when printed copies are available", async () => {
    const query = vi.fn()
    const repository = createPrintedDrawingHoldingsRepository({
      pool: { query } as unknown as Pool,
    })
    await expect(
      repository.saveForOrganization({ ...input, location: " " })
    ).rejects.toThrow("Enter a storage location")
    expect(query).not.toHaveBeenCalled()
  })
})
