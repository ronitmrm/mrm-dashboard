"use server"

import {
  createPartCodeRepository,
  type PartCodeRename,
  createPortfolioEntryRepository,
  PortfolioEntryError,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { withCsvImportTransaction } from "@/lib/csv-import-transaction"
import { readMasterCsv } from "@/lib/master-data-csv"
import { portfolioCsvInput } from "@/lib/portfolio-csv"

type ImportState = {
  error: string
  message: string
  preview: Array<{ uid: string; description: string; itemType: string }>
}
class PreviewComplete extends Error {}

type PartCodeCsvState = {
  error: string
  message: string
  preview: PartCodeRename[]
}

export async function previewPartCodeCsvAction(
  form: FormData
): Promise<PartCodeCsvState> {
  const session = await requireCapability(
    masterCapability("products", "rename"),
    "/masters/products"
  )
  const repository = createPartCodeRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const file = form.get("file")
    if (file instanceof File && file.size > 2_000_000)
      throw new Error("CSV must be smaller than 2 MB.")
    const rows = await readMasterCsv(file, "Part code CSV")
    if (rows.length > 5000)
      throw new Error("Upload at most 5,000 part codes at a time.")
    if (!("current_part_code" in rows[0]!) || !("new_part_code" in rows[0]!))
      throw new Error(
        "Use the Current Part Code and New Part Code columns from the downloaded CSV."
      )
    const changes = rows.flatMap((row, index) => {
      if (!row.new_part_code?.trim()) return []
      if (!row.current_part_code?.trim())
        throw new Error(`Row ${index + 2}: Current Part Code is required.`)
      return [
        { currentCode: row.current_part_code, newCode: row.new_part_code },
      ]
    })
    if (!changes.length)
      throw new Error(
        "Fill New Part Code for the parts you want to rename. Blank new codes are skipped."
      )
    const preview = await repository.renameMany({
      organizationCode: "MRMPL",
      actorUserId: session.user.id,
      changes,
      preview: true,
    })
    return {
      error: "",
      message: `Validated ${preview.length} universal code changes. No codes changed yet.`,
      preview,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "CSV could not be validated.",
      message: "",
      preview: [],
    }
  } finally {
    await repository.close()
  }
}

export async function applyPartCodeCsvAction(
  form: FormData
): Promise<PartCodeCsvState> {
  const session = await requireCapability(
    masterCapability("products", "rename"),
    "/masters/products"
  )
  const repository = createPartCodeRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const rows: unknown = JSON.parse(String(form.get("changes") ?? "[]"))
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
      throw new Error("Preview a CSV with 1–5,000 changes first.")
    const changes = rows.map((row: unknown) => {
      if (
        !row ||
        typeof row !== "object" ||
        !("itemId" in row) ||
        typeof row.itemId !== "string" ||
        !("currentCode" in row) ||
        typeof row.currentCode !== "string" ||
        !("newCode" in row) ||
        typeof row.newCode !== "string"
      )
        throw new Error("Preview the CSV again before applying changes.")
      return {
        itemId: row.itemId,
        currentCode: row.currentCode,
        newCode: row.newCode,
      }
    })
    const renamed = await repository.renameMany({
      organizationCode: "MRMPL",
      actorUserId: session.user.id,
      changes,
    })
    revalidatePath("/", "layout")
    return {
      error: "",
      message: `Renamed ${renamed.length} part codes across all production units.`,
      preview: [],
    }
  } catch (error) {
    return {
      error: `${error instanceof Error ? error.message : "Rename failed."} No part codes were changed. Preview the CSV again.`,
      message: "",
      preview: [],
    }
  } finally {
    await repository.close()
  }
}

export async function renamePartCodeAction(form: FormData) {
  const session = await requireCapability(
    masterCapability("products", "rename"),
    "/masters/products"
  )
  const repository = createPartCodeRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const result = await repository.rename({
      organizationCode: "MRMPL",
      itemId: String(form.get("itemId") ?? ""),
      currentCode: String(form.get("currentCode") ?? ""),
      newCode: String(form.get("newCode") ?? ""),
      actorUserId: session.user.id,
    })
    revalidatePath("/", "layout")
    return {
      error: "",
      message: `${result.oldCode} renamed to ${result.newCode}.`,
      newCode: result.newCode,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Part code could not be renamed.",
      message: "",
      newCode: "",
    }
  } finally {
    await repository.close()
  }
}

export async function importPortfolioCsvAction(
  _state: ImportState,
  form: FormData
): Promise<ImportState> {
  const session = await requireCapability(
    masterCapability("products", "import"),
    "/masters/products"
  )
  const previewOnly = form.get("intent") !== "import"
  const preview: ImportState["preview"] = []
  try {
    const file = form.get("file")
    if (file instanceof File && file.size > 2_000_000)
      throw new Error("CSV must be smaller than 2 MB.")
    const rows = await readMasterCsv(file, "Product CSV")
    if (rows.length > 500)
      throw new Error("Upload at most 500 products at a time.")
    const inputs = rows.map((row, index) => {
      try {
        return portfolioCsvInput(row, session.user.id)
      } catch (error) {
        throw new Error(
          `Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid product."}`
        )
      }
    })
    try {
      await withCsvImportTransaction(async () => {
        const repository = createPortfolioEntryRepository({
          connectionString: readAuthEnvironment().connectionString,
        })
        try {
          for (const [index, input] of inputs.entries()) {
            try {
              await repository.create(input)
            } catch (error) {
              if (error instanceof PortfolioEntryError)
                throw new Error(`Row ${index + 2}: ${error.message}`)
              throw error
            }
            preview.push({
              uid: input.uid || "Assigned on import",
              description: [
                input.productSize,
                input.category,
                input.subcategory,
              ].join(" "),
              itemType: input.itemType,
            })
          }
          // Validate the complete batch with the same writes, then roll back the preview.
          if (previewOnly) throw new PreviewComplete()
        } finally {
          await repository.close()
        }
      })
    } catch (error) {
      if (!(error instanceof PreviewComplete)) throw error
    }
  } catch (error) {
    return {
      error: `${error instanceof Error ? error.message : "Import failed."} No products saved.`,
      message: "",
      preview: [],
    }
  }
  if (previewOnly)
    return {
      error: "",
      message: "Validated. Review products, then import.",
      preview,
    }
  revalidatePath("/commercial/products")
  revalidatePath("/masters/products")
  return {
    error: "",
    message: `${preview.length} products imported. Open View Records to see them.`,
    preview: [],
  }
}
