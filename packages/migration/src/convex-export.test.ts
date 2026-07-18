import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { strToU8, zipSync } from "fflate"
import { afterEach, expect, test } from "vitest"

import { inspectConvexExport } from "./convex-export"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

test("Convex working inventory excludes identity and derived snapshot tables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-convex-export-"))
  temporaryDirectories.push(directory)
  const artifactPath = join(directory, "snapshot.zip")

  await writeFile(
    artifactPath,
    zipSync({
      "authSessions/documents.jsonl": strToU8(
        '{"_id":"session-1","userId":"user-1"}\n'
      ),
      "dashboardSnapshotChunks/documents.jsonl": strToU8(
        '{"_id":"chunk-1","version":1}\n'
      ),
      "dataEntries/documents.jsonl": strToU8(
        [
          '{"_id":"entry-1","entryType":"work_order"}',
          '{"_id":"entry-2","entryType":"machine_master"}',
        ].join("\n") + "\n"
      ),
      "users/documents.jsonl": strToU8(
        '{"_id":"user-1","email":"legacy@example.test"}\n'
      ),
    })
  )

  const inventory = await inspectConvexExport(artifactPath)

  expect(inventory.tables).toEqual([
    {
      disposition: "excluded_identity",
      name: "authSessions",
      rowCount: 1,
    },
    {
      disposition: "archive_only",
      name: "dashboardSnapshotChunks",
      rowCount: 1,
    },
    {
      disposition: "canonical",
      name: "dataEntries",
      rowCount: 2,
    },
    {
      disposition: "excluded_identity",
      name: "users",
      rowCount: 1,
    },
  ])
  expect(inventory.workingTables).toEqual(["dataEntries"])
  expect(inventory.byteSize).toBeGreaterThan(0)
  expect(inventory.sha256).toMatch(/^[a-f0-9]{64}$/)
})
