import { describe, expect, it } from "vitest"

import nextConfig from "../next.config"
import { commercialAttachmentRequestLimitBytes } from "./commercial-attachment"
import {
  dashboardErrorResponse,
  dashboardMutationCapabilities,
  enforceDashboardRequestSize,
  maxDashboardProxyRequestBytes,
  maxDashboardRequestBytes,
  requiredDashboardText,
  readDashboardJsonBody,
} from "./dashboard-route-policy"

describe("dashboard route policy", () => {
  it("keeps the framework proxy ceiling above the application request limit", () => {
    expect(maxDashboardProxyRequestBytes).toBeGreaterThan(
      maxDashboardRequestBytes
    )
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(
      Math.max(
        maxDashboardProxyRequestBytes,
        commercialAttachmentRequestLimitBytes
      )
    )
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(
      commercialAttachmentRequestLimitBytes
    )
  })

  it("resolves minimum capabilities before mutation bodies are read", () => {
    expect(dashboardMutationCapabilities("reverse-entry")).toEqual([
      "operations.corrections.write",
    ])
    expect(dashboardMutationCapabilities("attendance")).toEqual([
      "operations.attendance.write",
    ])
    expect(dashboardMutationCapabilities("data-import")).toContain(
      "quality.hourly.write"
    )
    expect(dashboardMutationCapabilities("job-card-delivery-target")).toEqual([
      "planning.override.write",
    ])
    expect(dashboardMutationCapabilities("master-delete")).toEqual([
      "operations.corrections.write",
    ])
    expect(dashboardMutationCapabilities("unknown")).toBeUndefined()
  })

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

  it("classifies blank correction reasons as client errors", () => {
    expect(() => requiredDashboardText("   ", "Reversal reason")).toThrowError(
      expect.objectContaining({
        message: "Reversal reason is required.",
        status: 400,
      })
    )
  })

  it("rejects oversized JSON requests before parsing", () => {
    expect(() =>
      enforceDashboardRequestSize(String(10 * 1024 * 1024))
    ).not.toThrow()
    expect(() =>
      enforceDashboardRequestSize(String(10 * 1024 * 1024 + 1))
    ).toThrowError(expect.objectContaining({ status: 413 }))
  })

  it("enforces the limit when content length is absent", async () => {
    const request = new Request("http://localhost/api/data-entry", {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"large"}'))
          controller.close()
        },
      }),
      duplex: "half",
      headers: { "content-type": "application/json" },
      method: "POST",
    } as RequestInit & { duplex: "half" })

    await expect(readDashboardJsonBody(request, 8)).rejects.toMatchObject({
      status: 413,
    })
  })
})
