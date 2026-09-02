import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import {
  buildLegacyDrawingBaselinePlan,
  createArtifactService,
  createLegacyDrawingBaselineRepository,
  migrateDatabase,
  type LegacyDrawingRegisterRow,
} from "@workspace/db"
import * as XLSX from "xlsx"

import { createUploadThingArtifactProvider } from "../lib/uploadthing-artifact-provider"

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getFullYear()).padStart(4, "0")}-${String(
      value.getMonth() + 1
    ).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return value
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (match) {
      const [, day, month, year] = match
      return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`
    }
  }
  return value
}

async function registerRows(
  workbookPath: string
): Promise<LegacyDrawingRegisterRow[]> {
  const workbook = XLSX.read(await readFile(workbookPath), {
    cellDates: true,
    type: "buffer",
  })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("The drawing workbook has no worksheet.")
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Worksheet ${sheetName} was not found.`)
  const [headerRow = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: false,
    header: 1,
  })
  const headers = new Set(
    headerRow.map((header) => String(header ?? "").trim())
  )
  const missingHeaders = [
    "UID",
    "Drawing No.",
    "Revision No.",
    "Rev Date",
  ].filter((header) => !headers.has(header))
  if (missingHeaders.length) {
    throw new Error(
      `Drawing workbook is missing headers: ${missingHeaders.join(", ")}.`
    )
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  })
  return rows.map((row) => ({
    drawingNumber: row["Drawing No."],
    revision: row["Revision No."],
    revisionDate: isoDate(row["Rev Date"]),
    uid: row.UID,
  }))
}

async function drawingFiles(directory: string) {
  const files: Array<{ fileName: string; filePath: string }> = []
  async function visit(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(filePath)
      else if (entry.isFile()) files.push({ fileName: entry.name, filePath })
    }
  }
  await visit(directory)
  return files
}

function mediaType(fileName: string) {
  switch (path.extname(fileName).toLowerCase()) {
    case ".pdf":
      return "application/pdf"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".dwg":
      return "application/acad"
    case ".dxf":
      return "image/vnd.dxf"
    default:
      return "application/octet-stream"
  }
}

function summarized(values: readonly string[]) {
  return { count: values.length, sample: values.slice(0, 50) }
}

const workbookPath = argument("--workbook")
const drawingsDirectory = argument("--drawings-dir")
const apply = process.argv.includes("--apply")
const organizationCode = argument("--organization") ?? "MRMPL"
const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.WEB_DATABASE_URL ??
  process.env.DATABASE_URL

if (!workbookPath) throw new Error("--workbook is required.")
if (!connectionString) {
  throw new Error(
    "MIGRATION_DATABASE_URL, WEB_DATABASE_URL, or DATABASE_URL is required."
  )
}
// eslint-disable-next-line turbo/no-undeclared-env-vars -- one-time managed migration guard
if (apply && process.env.MRM_NEON_BRANCH !== "staging") {
  throw new Error(
    "This one-time migration is restricted to the staging branch."
  )
}

if (apply) {
  const migrationConnectionString = process.env.MIGRATION_DATABASE_URL
  if (!migrationConnectionString) {
    throw new Error("MIGRATION_DATABASE_URL is required with --apply.")
  }
  await migrateDatabase({ connectionString: migrationConnectionString })
}

const repository = createLegacyDrawingBaselineRepository({ connectionString })
try {
  const products = await repository.listReleasedProducts(organizationCode)
  const files = drawingsDirectory ? await drawingFiles(drawingsDirectory) : []
  const plan = buildLegacyDrawingBaselinePlan({
    fileNames: files.map((file) => file.fileName),
    registerRows: await registerRows(workbookPath),
    releasedProducts: products,
  })
  const report = {
    ambiguousFileUids: summarized(plan.ambiguousFileUids),
    baselines: plan.baselines.length,
    ignoredRegisterUids: summarized(plan.ignoredRegisterUids),
    missingFileUids: summarized(plan.missingFileUids),
    mode: apply
      ? drawingsDirectory
        ? "apply-with-files"
        : "apply-metadata"
      : "dry-run",
    ready: plan.ready.length,
    releasedProducts: products.length,
    unmatchedFileNames: summarized(plan.unmatchedFileNames),
  }
  if (!apply) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const staged = await repository.stageBaselines({
      baselines: plan.baselines,
      organizationCode,
    })
    if (!drawingsDirectory) {
      console.log(JSON.stringify({ ...report, staged }, null, 2))
    } else {
      const filePaths = new Map(
        files.map((file) => [file.fileName.toLowerCase(), file.filePath])
      )
      const artifactService = createArtifactService({
        connectionString,
        provider: createUploadThingArtifactProvider(),
      })
      const results = new Map<string, number>()
      try {
        for (const [index, baseline] of plan.ready.entries()) {
          const fileName = baseline.fileName
          if (!fileName) {
            throw new Error(`File name was not found for ${baseline.uid}.`)
          }
          const filePath = filePaths.get(fileName.toLowerCase())
          if (!filePath)
            throw new Error(`File path was not found for ${baseline.uid}.`)
          const artifact = await artifactService.store({
            actorUserId: null,
            bytes: await readFile(filePath),
            fileName,
            idempotencyKey: `legacy-drawing-baseline:${baseline.uid}:${baseline.revisionLabel}`,
            mediaType: mediaType(fileName),
            organizationId: baseline.organizationId,
            origin: "uploaded",
            purpose: "legacy_drawing_baseline",
            target: {
              id: baseline.itemId,
              schema: "catalog",
              table: "items",
            },
          })
          const outcome = await repository.applyBaseline({
            baseline,
            fileId: artifact.id,
            organizationCode,
          })
          results.set(outcome.status, (results.get(outcome.status) ?? 0) + 1)
          if ((index + 1) % 50 === 0) {
            console.log(`Processed ${index + 1}/${plan.ready.length}`)
          }
        }
      } finally {
        await artifactService.close()
      }
      console.log(
        JSON.stringify(
          { ...report, outcomes: Object.fromEntries(results), staged },
          null,
          2
        )
      )
    }
  }
} finally {
  await repository.close()
}
