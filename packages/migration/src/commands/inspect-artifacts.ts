import { basename } from "node:path"

import { inspectConvexExport } from "../convex-export"
import { inspectPricingExport } from "../pricing-database"

const [pricingExportPath, convexExportPath] = process.argv.slice(2)

if (!pricingExportPath || !convexExportPath) {
  throw new Error(
    "Usage: pnpm inspect:artifacts <pricing-export.zip> <convex-export.zip>"
  )
}

const [pricing, convex] = await Promise.all([
  inspectPricingExport(pricingExportPath),
  inspectConvexExport(convexExportPath),
])

process.stdout.write(
  `${JSON.stringify(
    {
      sources: {
        convex: {
          artifactFile: basename(convexExportPath),
          ...convex,
        },
        pricing: {
          artifactFile: basename(pricingExportPath),
          ...pricing,
        },
      },
    },
    null,
    2
  )}\n`
)
