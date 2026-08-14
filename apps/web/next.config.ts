import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

import { browserSecurityHeaders } from "./lib/security-headers"
import { maxDashboardProxyRequestBytes } from "./lib/dashboard-route-policy"

const appDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.join(appDir, "../..")

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: maxDashboardProxyRequestBytes,
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
