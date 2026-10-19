"use server"

import {
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
