import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const appDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.join(appDir, "../..")

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
