import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

import {
  browserSecurityHeaders,
  privateDocumentSecurityHeaders,
} from "./lib/security-headers.ts"
import { maxDashboardProxyRequestBytes } from "./lib/dashboard-route-policy.ts"
import { commercialAttachmentRequestLimitBytes } from "./lib/commercial-attachment.ts"

const appDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.join(appDir, "../..")
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL
const nextConfig: NextConfig = {
  // Lets `next dev` serve HMR to the configured public origin (e.g. a tunnel).
  allowedDevOrigins: publicAppUrl ? [new URL(publicAppUrl).hostname] : [],
  experimental: {
    proxyClientMaxBodySize: Math.max(
      maxDashboardProxyRequestBytes,
      commercialAttachmentRequestLimitBytes
    ),
    serverActions: {
      bodySizeLimit: commercialAttachmentRequestLimitBytes,
    },
  },
  async headers() {
    return [
      { headers: [...browserSecurityHeaders], source: "/(.*)" },
      {
        headers: Object.entries(privateDocumentSecurityHeaders).map(
          ([key, value]) => ({ key, value })
        ),
        source: "/hr/employment-letters/:id/download",
      },
      {
        headers: Object.entries(privateDocumentSecurityHeaders).map(
          ([key, value]) => ({ key, value })
        ),
        source: "/commercial/quotes/enquiry/:id/pdf",
      },
    ]
  },
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/hr/**": ["./lib/hr/assets/**/*", "./lib/pricing/assets/Outfit-*.ttf"],
    "/commercial/**": ["./lib/pricing/assets/**/*"],
  },
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: ["@workspace/ui"],
  webpack(config) {
    // PDF.js's unminified bundle conflicts with Webpack's development eval wrapper.
    config.resolve.alias["pdfjs-dist$"] = "pdfjs-dist/build/pdf.min.mjs"
    return config
  },
}

export default nextConfig
