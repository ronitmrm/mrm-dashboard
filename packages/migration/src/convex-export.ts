import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import { strFromU8, unzipSync } from "fflate"

import { convexDataEntryDisposition } from "./data-entry-classification"

const EXCLUDED_IDENTITY_TABLES = new Set([
  "authAccounts",
  "authRateLimits",
  "authRefreshTokens",
  "authSessions",
  "authVerificationCodes",
  "authVerifiers",
  "users",
])

const ARCHIVE_ONLY_TABLES = new Set([
  "_tables",
  "dashboardRefreshState",
  "dashboardSnapshots",
  "dashboardSnapshotChunks",
])

export type TableDisposition =
  | "archive_only"
  | "canonical"
  | "excluded_identity"

type ConvexTableInventory = {
  disposition: TableDisposition
  name: string
  rowCount: number
}

export type ConvexDataEntryProfile = {
  duplicateLogicalKeyGroups: number
  duplicateLogicalKeyRows: number
  missingLogicalKeyRows: number
  payloadFields: Record<string, string[]>
  rowCount: number
}

export type ConvexExportInventory = {
  byteSize: number
  dataEntryDispositions: Record<
    string,
    ReturnType<typeof convexDataEntryDisposition>
  >
  dataEntryProfiles: Record<string, ConvexDataEntryProfile>
  dataEntryTypes: Record<string, number>
  sha256: string
  tables: ConvexTableInventory[]
  workingTables: string[]
}

export function convexTableDisposition(name: string): TableDisposition {
  if (
    EXCLUDED_IDENTITY_TABLES.has(name) ||
    name === "_components" ||
    name.startsWith("_components/")
  ) {
    return "excluded_identity"
  }

  if (ARCHIVE_ONLY_TABLES.has(name)) {
    return "archive_only"
  }

  return "canonical"
}

function documentCount(contents: Uint8Array) {
  let count = 0
  let lineHasContent = false

  for (const byte of contents) {
    if (byte === 10) {
      if (lineHasContent) {
        count += 1
      }
      lineHasContent = false
    } else if (byte !== 9 && byte !== 13 && byte !== 32) {
      lineHasContent = true
    }
  }

  return lineHasContent ? count + 1 : count
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function jsonValueType(value: unknown) {
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "array"
  }
  return typeof value
}

function dataEntryProfile(contents: Uint8Array | undefined) {
  if (!contents) {
    return {
      profiles: {},
      types: {},
    }
  }

  const profiles = new Map<
    string,
    {
      keyCounts: Map<string, number>
      missingLogicalKeyRows: number
      payloadFields: Map<string, Set<string>>
      rowCount: number
    }
  >()
  const lines = strFromU8(contents)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  for (const [index, line] of lines.entries()) {
    const document: unknown = JSON.parse(line)

    if (!isRecord(document)) {
      throw new Error(`Invalid dataEntries document on line ${index + 1}`)
    }

    const entryType =
      typeof document.entryType === "string" ? document.entryType : "<missing>"
    const profile = profiles.get(entryType) ?? {
      keyCounts: new Map<string, number>(),
      missingLogicalKeyRows: 0,
      payloadFields: new Map<string, Set<string>>(),
      rowCount: 0,
    }
    profile.rowCount += 1

    if (typeof document.key === "string" && document.key.trim().length > 0) {
      profile.keyCounts.set(
        document.key,
        (profile.keyCounts.get(document.key) ?? 0) + 1
      )
    } else {
      profile.missingLogicalKeyRows += 1
    }

    if (isRecord(document.payload)) {
      for (const [field, value] of Object.entries(document.payload)) {
        const fieldTypes = profile.payloadFields.get(field) ?? new Set<string>()
        fieldTypes.add(jsonValueType(value))
        profile.payloadFields.set(field, fieldTypes)
      }
    } else {
      const fieldTypes =
        profile.payloadFields.get("<payload>") ?? new Set<string>()
      fieldTypes.add(jsonValueType(document.payload))
      profile.payloadFields.set("<payload>", fieldTypes)
    }

    profiles.set(entryType, profile)
  }

  const sortedProfiles = [...profiles.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )

  return {
    profiles: Object.fromEntries(
      sortedProfiles.map(([entryType, profile]) => {
        const duplicateCounts = [...profile.keyCounts.values()].filter(
          (count) => count > 1
        )
        return [
          entryType,
          {
            duplicateLogicalKeyGroups: duplicateCounts.length,
            duplicateLogicalKeyRows: duplicateCounts.reduce(
              (total, count) => total + count,
              0
            ),
            missingLogicalKeyRows: profile.missingLogicalKeyRows,
            payloadFields: Object.fromEntries(
              [...profile.payloadFields.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([field, types]) => [field, [...types].sort()])
            ),
            rowCount: profile.rowCount,
          },
        ]
      })
    ),
    types: Object.fromEntries(
      sortedProfiles.map(([entryType, profile]) => [
        entryType,
        profile.rowCount,
      ])
    ),
  }
}

export async function inspectConvexExport(
  artifactPath: string
): Promise<ConvexExportInventory> {
  const artifact = await readFile(artifactPath)
  const archive = unzipSync(artifact)
  const dataEntries = dataEntryProfile(archive["dataEntries/documents.jsonl"])
  const tables = Object.entries(archive)
    .filter(([path]) => path.endsWith("/documents.jsonl"))
    .map(([path, contents]) => {
      const name = path.slice(0, -"/documents.jsonl".length)
      return {
        disposition: convexTableDisposition(name),
        name,
        rowCount: documentCount(contents),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    byteSize: artifact.byteLength,
    dataEntryDispositions: Object.fromEntries(
      Object.keys(dataEntries.types).map((entryType) => [
        entryType,
        convexDataEntryDisposition(entryType),
      ])
    ),
    dataEntryProfiles: dataEntries.profiles,
    dataEntryTypes: dataEntries.types,
    sha256: createHash("sha256").update(artifact).digest("hex"),
    tables,
    workingTables: tables
      .filter((table) => table.disposition === "canonical")
      .map((table) => table.name),
  }
}
