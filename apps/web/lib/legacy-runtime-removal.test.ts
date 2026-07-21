import { access, readFile, readdir } from "node:fs/promises"

import { describe, expect, test } from "vitest"

const webRoot = new URL("../", import.meta.url)
const repositoryRoot = new URL("../../../", import.meta.url)

async function sourceFiles(root: URL): Promise<URL[]> {
  const files: URL[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if ([".next", "node_modules"].includes(entry.name)) continue
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root)
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(url))
    } else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      files.push(url)
    }
  }
  return files
}

describe("legacy runtime removal", () => {
  test("web and workspace runtime contracts no longer advertise Convex", async () => {
    const webPackage = JSON.parse(await readFile(new URL("package.json", webRoot), "utf8")) as {
      dependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const rootPackage = JSON.parse(await readFile(new URL("package.json", repositoryRoot), "utf8")) as {
      scripts: Record<string, string>
    }
    const turbo = await readFile(new URL("turbo.json", repositoryRoot), "utf8")
    const envExample = await readFile(new URL(".env.example", webRoot), "utf8")

    expect(webPackage.dependencies).not.toHaveProperty("@auth/core")
    expect(webPackage.dependencies).not.toHaveProperty("@convex-dev/auth")
    expect(webPackage.dependencies).not.toHaveProperty("convex")
    expect(JSON.stringify(webPackage.scripts)).not.toMatch(/convex/i)
    expect(JSON.stringify(rootPackage.scripts)).not.toMatch(/convex/i)
    expect(turbo).not.toMatch(/CONVEX_|NEXT_PUBLIC_CONVEX|dev:convex/)
    expect(envExample).not.toMatch(/CONVEX_|NEXT_PUBLIC_CONVEX/)
  })

  test("production source has no Convex or SQLite driver imports", async () => {
    const roots = [
      webRoot,
      new URL("packages/db/src/", repositoryRoot),
      new URL("packages/runtime/src/", repositoryRoot),
    ]
    const files = (await Promise.all(roots.map(sourceFiles))).flat()
    const offenders: string[] = []
    const importPattern = /(?:from\s+|import\s*\()\s*["'](?:@convex-dev\/auth|convex(?:\/[^"']*)?|better-sqlite3)["']/

    for (const file of files) {
      if (importPattern.test(await readFile(file, "utf8"))) offenders.push(file.pathname)
    }

    expect(offenders).toEqual([])
  })

  test("obsolete Convex runtime files and compose stack are absent", async () => {
    const paths = [
      new URL("convex/", webRoot),
      new URL("components/convex-client-provider.tsx", webRoot),
      new URL("lib/convex-env.ts", webRoot),
      new URL("scripts/generate-convex-auth-keys.mjs", webRoot),
      new URL("docker-compose.convex.yml", repositoryRoot),
    ]

    const existing: string[] = []
    for (const path of paths) {
      if (await access(path).then(() => true, () => false)) existing.push(path.pathname)
    }

    expect(existing).toEqual([])
  })
})
