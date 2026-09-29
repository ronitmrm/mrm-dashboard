import { describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { parsePendingUploadIntent } from "./artifact-upload-contract"
import {
  authorizePendingUploadIntent,
  validatePendingUploadBytes,
} from "./pending-artifact-upload-policy"

describe("calibration certificate upload", () => {
  test("accepts a returned visit with maintenance permission and a PDF", async () => {
    const intent = parsePendingUploadIntent({
      kind: "store-calibration-certificate",
      visitId: "visit-id",
    })
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "organization-id" }] })
      .mockResolvedValueOnce({ rows: [{ organization_id: "organization-id" }] })

    await expect(
      authorizePendingUploadIntent(
        { query } as never,
        intent,
        {
          grantedCapabilities: new Set(["store.asset_maintenance.write"]),
          userId: "user-id",
        }
      )
    ).resolves.toBe("organization-id")
    expect(query.mock.calls[1]?.[0]).toContain("status = 'RETURNED'")
    expect(
      validatePendingUploadBytes({
        bytes: Buffer.from("%PDF-1.7\ncertificate"),
        fileName: "certificate.pdf",
        intent,
        mediaType: "application/pdf",
      })
    ).toEqual({ fileName: "certificate.pdf", mediaType: "application/pdf" })
  })

  test("rejects a certificate upload without maintenance permission", async () => {
    const query = vi.fn()
    await expect(
      authorizePendingUploadIntent(
        { query } as never,
        { kind: "store-calibration-certificate", visitId: "visit-id" },
        { grantedCapabilities: new Set(), userId: "user-id" }
      )
    ).rejects.toThrow("Upload operation is not permitted.")
    expect(query).not.toHaveBeenCalled()
  })
})
