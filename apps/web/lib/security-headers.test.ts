import { describe, expect, it } from "vitest"

import { browserSecurityHeaders } from "./security-headers"

describe("browser security headers", () => {
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
