export const browserSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  },
] as const

// Private file routes can be previewed by our authenticated attachment viewer.
// The application pages retain the stricter no-framing policy above.
export const privateDocumentSecurityHeaders = {
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "base-uri 'self'; frame-ancestors 'self'",
} as const
