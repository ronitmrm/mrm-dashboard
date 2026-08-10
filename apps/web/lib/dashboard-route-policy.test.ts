import { describe, expect, it } from "vitest"

import {
  dashboardErrorResponse,
  enforceDashboardRequestSize,
} from "./dashboard-route-policy"

describe("dashboard route policy", () => {
  it("keeps correctable client errors and hides internal details", () => {
    expect(dashboardErrorResponse(new Error("Fix this field"), 400)).toEqual({
      error: "Fix this field",
      status: 400,
    })
    expect(
      dashboardErrorResponse(
        new Error("password=secret /private/path SQL SELECT"),
        500
      )
    ).toEqual({ error: "Request failed", status: 500 })
  })

  it("rejects oversized JSON requests before parsing", () => {
    expect(() =>
      enforceDashboardRequestSize(String(10 * 1024 * 1024))
    ).not.toThrow()
    expect(() =>
      enforceDashboardRequestSize(String(10 * 1024 * 1024 + 1))
    ).toThrowError(expect.objectContaining({ status: 413 }))
  })
})
