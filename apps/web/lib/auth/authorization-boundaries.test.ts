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
      "authorizedDashboardSession(",
      "authorizePostgresDashboardEvents(",
    ]
    const missing: string[] = []

    for (const path of files) {
      const source = await readFile(path, "utf8")
      if (!guards.some((guard) => source.includes(guard))) {
        missing.push(relativeAppPath(path))
      }
    }

    expect(missing).toEqual([])
  })

  it("pins narrow capabilities at representative sensitive boundaries", async () => {
    const boundaries = [
      {
        capabilities: [
          "administration.users.manage",
          "administration.roles.manage",
        ],
        path: "administration/access/actions.ts",
      },
      {
        capabilities: ["hr.employees.write", "hr.recruitment.write"],
        path: "hr/actions.ts",
      },
      {
        capabilities: [
          "pricing.enquiries.write",
          "pricing.technical_review.write",
          "pricing.design.write",
        ],
        path: "commercial/enquiries/actions.ts",
      },
      {
        capabilities: [
          "operations.shop_floor.write",
          "operations.production.write",
          "planning.priority.write",
        ],
        path: "api/[...path]/route.ts",
      },
    ]

    for (const boundary of boundaries) {
      const source = await readFile(`${appRoot}/${boundary.path}`, "utf8")
      for (const capability of boundary.capabilities) {
        expect(source, boundary.path).toContain(`"${capability}"`)
      }
    }
  })
})
