import { describe, expect, it } from "vitest"

import nextConfig from "../next.config"
import { browserSecurityHeaders } from "./security-headers"

describe("browser security headers", () => {
  it.each([
    "/hr/employment-letters/:id/download",
    "/commercial/quotes/enquiry/:id/pdf",
  ])("allows the private document route %s inside the same-origin viewer", async (path) => {
    const rules = await nextConfig.headers!()
    const rule = rules.find(
      ({ source }) => source === path
    )
    expect(rule).toBeDefined()
    const headers = Object.fromEntries(
      rule!.headers.map(({ key, value }) => [key, value])
    )
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN")
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'self'"
    )
    expect(rules.indexOf(rule!)).toBeGreaterThan(
      rules.findIndex(({ source }) => source === "/(.*)")
    )
  })
  it("blocks sniffing, framing, embedded objects, and unsafe referrers", () => {
    expect(
      Object.fromEntries(
        browserSecurityHeaders.map(({ key, value }) => [key, value])
      )
    ).toEqual({
      "Content-Security-Policy":
        "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    })
  })
})
