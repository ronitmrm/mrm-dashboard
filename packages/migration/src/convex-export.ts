import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import { strFromU8, unzipSync } from "fflate"

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
  "dashboardRefreshState",
  "dashboardSnapshotChunks",
])

type TableDisposition = "archive_only" | "canonical" | "excluded_identity"

type ConvexTableInventory = {
  disposition: TableDisposition
  name: string
  rowCount: number
}

export type ConvexExportInventory = {
  byteSize: number
  sha256: string
  tables: ConvexTableInventory[]
  workingTables: string[]
}

function dispositionFor(name: string): TableDisposition {
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
  return strFromU8(contents)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length
}

export async function inspectConvexExport(
  artifactPath: string
): Promise<ConvexExportInventory> {
  const artifact = await readFile(artifactPath)
  const archive = unzipSync(artifact)
  const tables = Object.entries(archive)
    .filter(([path]) => path.endsWith("/documents.jsonl"))
    .map(([path, contents]) => {
      const name = path.slice(0, -"/documents.jsonl".length)
      return {
        disposition: dispositionFor(name),
        name,
        rowCount: documentCount(contents),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    byteSize: artifact.byteLength,
    sha256: createHash("sha256").update(artifact).digest("hex"),
    tables,
    workingTables: tables
      .filter((table) => table.disposition === "canonical")
      .map((table) => table.name),
  }
}
