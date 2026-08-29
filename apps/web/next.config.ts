import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

import { browserSecurityHeaders } from "./lib/security-headers.ts"
import { maxDashboardProxyRequestBytes } from "./lib/dashboard-route-policy.ts"
import { commercialAttachmentRequestLimitBytes } from "./lib/commercial-attachment.ts"

const appDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.join(appDir, "../..")

const nextConfig: NextConfig = {
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
    return [{ headers: [...browserSecurityHeaders], source: "/(.*)" }]
  },
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
