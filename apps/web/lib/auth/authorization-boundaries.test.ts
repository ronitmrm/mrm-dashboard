import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const appRoot = fileURLToPath(new URL("../../app", import.meta.url))

async function serverBoundaryFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) return serverBoundaryFiles(path)
      if (entry.name === "actions.ts" || entry.name === "route.ts") {
        return [path]
      }
      return []
    })
  )
  return nested.flat()
}

function relativeAppPath(path: string) {
  return path.slice(appRoot.length + 1)
}

describe("protected server boundaries", () => {
  it("keeps every sensitive action and route behind a server authorization check", async () => {
    const files = (await serverBoundaryFiles(appRoot)).filter(
      (path) => relativeAppPath(path) !== "api/auth/[...all]/route.ts"
    )
    const guards = [
      "requireCapability(",
      "requireHrPage(",
      "requireProductionPage(",
      "authorizedDashboardSession(",
      "authorizePostgresDashboardEvents(",
    ]
    const authenticatedAccountOnlyBoundaries = new Map([
      ["home/actions.ts", "requireAuthenticatedSession("],
    ])
    const missing: string[] = []

    for (const path of files) {
      const source = await readFile(path, "utf8")
      const relativePath = relativeAppPath(path)
      const accountGuard = authenticatedAccountOnlyBoundaries.get(relativePath)
      if (
        !guards.some((guard) => source.includes(guard)) &&
        !(accountGuard && source.includes(accountGuard))
      ) {
        missing.push(relativePath)
      }
    }

    expect(missing).toEqual([])
  })

  it("pins narrow capabilities at representative sensitive boundaries", async () => {
    const boundaries = [
      {
        markers: [
          "administrationTaskCapabilities.provisionStaff",
          "administrationTaskCapabilities.updateRolePermissions",
        ],
        path: "administration/access/actions.ts",
      },
      {
        markers: [
          "hrTaskCapabilities.assignEmployee",
          "hrTaskCapabilities.recordInterview",
        ],
        path: "hr/actions.ts",
      },
      {
        markers: [
          "commercialTaskCapabilities.createEnquiry",
          "commercialTaskCapabilities.updateTechnicalReview",
          "commercialTaskCapabilities.saveDesign",
        ],
        path: "commercial/enquiries/actions.ts",
      },
      {
        markers: [
          '"operations.shop_floor.write"',
          '"operations.production.write"',
          '"planning.priority.write"',
        ],
        path: "api/[...path]/route.ts",
      },
    ]

    for (const boundary of boundaries) {
      const source = await readFile(`${appRoot}/${boundary.path}`, "utf8")
      for (const marker of boundary.markers) {
        expect(source, boundary.path).toContain(marker)
      }
    }
  })
})
