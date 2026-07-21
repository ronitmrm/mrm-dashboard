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
      "_tables/documents.jsonl": strToU8('{"name":"dataEntries"}\n'),
      "authSessions/documents.jsonl": strToU8(
        '{"_id":"session-1","userId":"user-1"}\n'
      ),
      "dashboardSnapshotChunks/documents.jsonl": strToU8(
        '{"_id":"chunk-1","version":1}\n'
      ),
      "dataEntries/documents.jsonl": strToU8(
        [
          '{"_id":"entry-1","entryType":"work_order","key":"JC-1","payload":{"jcNo":"JC-1","quantity":1}}',
          '{"_id":"entry-2","entryType":"machine_master","key":"M-1","payload":{"active":true}}',
          '{"_id":"entry-3","entryType":"work_order","key":"JC-1","payload":{"jcNo":"JC-1","quantity":"2"}}',
          '{"_id":"entry-4","entryType":"_summary","key":"counts","payload":{"counts":{}}}',
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
      disposition: "archive_only",
      name: "_tables",
      rowCount: 1,
    },
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
      rowCount: 4,
    },
    {
      disposition: "excluded_identity",
      name: "users",
      rowCount: 1,
    },
  ])
  expect(inventory.workingTables).toEqual(["dataEntries"])
  expect(inventory.dataEntryTypes).toEqual({
    _summary: 1,
    machine_master: 1,
    work_order: 2,
  })
  expect(inventory.dataEntryProfiles).toEqual({
    _summary: {
      duplicateLogicalKeyGroups: 0,
      duplicateLogicalKeyRows: 0,
      missingLogicalKeyRows: 0,
      payloadFields: {
        counts: ["object"],
      },
      rowCount: 1,
    },
    machine_master: {
      duplicateLogicalKeyGroups: 0,
      duplicateLogicalKeyRows: 0,
      missingLogicalKeyRows: 0,
      payloadFields: {
        active: ["boolean"],
      },
      rowCount: 1,
    },
    work_order: {
      duplicateLogicalKeyGroups: 1,
      duplicateLogicalKeyRows: 2,
      missingLogicalKeyRows: 0,
      payloadFields: {
        jcNo: ["string"],
        quantity: ["number", "string"],
      },
      rowCount: 2,
    },
  })
  expect(inventory.dataEntryDispositions).toEqual({
    _summary: "archive_only",
    machine_master: "canonical",
    work_order: "canonical",
  })
  expect(inventory.byteSize).toBeGreaterThan(0)
  expect(inventory.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test("Convex inspection rejects unsafe, incomplete, and malformed artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-convex-invalid-"))
  temporaryDirectories.push(directory)
  const unsafePath = join(directory, "unsafe.zip")
  const incompletePath = join(directory, "incomplete.zip")
  const malformedPath = join(directory, "malformed.zip")

  await writeFile(
    unsafePath,
    zipSync({
      "../ignored/documents.jsonl": strToU8('{"_id":"unsafe"}\n'),
      "dataEntries/documents.jsonl": strToU8(
        '{"_id":"entry-1","entryType":"work_order","payload":{}}\n'
      ),
    })
  )
  await writeFile(
    incompletePath,
    zipSync({
      "_tables/documents.jsonl": strToU8('{"_id":"table-1"}\n'),
    })
  )
  await writeFile(
    malformedPath,
    zipSync({
      "dataEntries/documents.jsonl": strToU8(
        '{"_id":"entry-1","entryType":"work_order","payload":{}}\n'
      ),
      "productionEntries/documents.jsonl": strToU8(
        '{"_id":"production-1"}\nnot-json\n'
      ),
    })
  )

  await expect(inspectConvexExport(unsafePath)).rejects.toThrow("unsafe")
  await expect(inspectConvexExport(incompletePath)).rejects.toThrow(
    "dataEntries/documents.jsonl"
  )
  await expect(inspectConvexExport(malformedPath)).rejects.toThrow(
    "productionEntries"
  )
})
