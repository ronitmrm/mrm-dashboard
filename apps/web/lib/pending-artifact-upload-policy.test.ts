import { describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { parsePendingUploadIntent } from "./artifact-upload-contract"
import {
  authorizePendingUploadIntent,
  validatePendingUploadBytes,
} from "./pending-artifact-upload-policy"

describe("calibration certificate upload", () => {
  test("accepts a returned visit with QC calibration permission and a PDF", async () => {
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
          grantedCapabilities: new Set(["quality.control.calibration.write"]),
          userId: "user-id",
        }
      )
    ).resolves.toBe("organization-id")
    expect(query.mock.calls[1]?.[0]).toContain("status = 'RETURNED'")
    expect(query.mock.calls[1]?.[0]).toContain("method = 'IN_HOUSE'")
    expect(
      validatePendingUploadBytes({
        bytes: Buffer.from("%PDF-1.7\ncertificate"),
        fileName: "certificate.pdf",
        intent,
        mediaType: "application/pdf",
      })
    ).toEqual({ fileName: "certificate.pdf", mediaType: "application/pdf" })
  })

  test("rejects a certificate upload without QC calibration permission", async () => {
    const query = vi.fn()
    await expect(
      authorizePendingUploadIntent(
        { query } as never,
        { kind: "store-calibration-certificate", visitId: "visit-id" },
        { grantedCapabilities: new Set(["store.asset_maintenance.write"]), userId: "user-id" }
      )
    ).rejects.toThrow("Upload operation is not permitted.")
    expect(query).not.toHaveBeenCalled()
  })
})

test("maintenance work photos require task write access and verified image bytes", async () => {
  const intent = parsePendingUploadIntent({ kind: "maintenance-work-photo", index: 1 })
  const query = vi.fn().mockResolvedValue({ rows: [{ id: "organization-id" }] })
  await expect(authorizePendingUploadIntent(
    { query } as never,
    intent,
    { grantedCapabilities: new Set(["maintenance.tasks.write"]), userId: "user-id" }
  )).resolves.toBe("organization-id")
  expect(validatePendingUploadBytes({
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    fileName: "repair.jpeg",
    intent,
    mediaType: "image/jpeg",
  })).toEqual({ fileName: "repair.jpeg", mediaType: "image/jpeg" })
  await expect(authorizePendingUploadIntent(
    { query } as never,
    intent,
    { grantedCapabilities: new Set(), userId: "user-id" }
  )).rejects.toThrow("Upload operation is not permitted.")
})

test("maintenance work upload accepts twelve photos and rejects a thirteenth", () => {
  expect(parsePendingUploadIntent({ kind: "maintenance-work-photo", index: 12 }))
    .toEqual({ kind: "maintenance-work-photo", index: 12 })
  expect(() => parsePendingUploadIntent({ kind: "maintenance-work-photo", index: 13 }))
    .toThrow("Upload intent photo index is invalid.")
})
