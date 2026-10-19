import type { PortfolioEntryInput } from "@workspace/db"
import type { MasterCsvRow } from "./master-data-csv"

export const portfolioCsvColumns = [
  "uid",
  "item_type",
  "product_size",
  "category",
  "subcategory",
  "product_type",
  "production_type",
  "grade",
  "rod_type",
  "rod_size",
  "piece_weight",
  "blank_piece_weight",
  "die_code",
  "processes_required",
  "remarks",
  "components",
] as const

export function portfolioCsvInput(
  row: MasterCsvRow,
  actorUserId: string
): PortfolioEntryInput {
  const type = row.item_type
  if (type !== "List" && type !== "Package" && type !== "Assembly")
    throw new Error("Item Type must be List, Package or Assembly.")
  const unknown = Object.keys(row).find(
    (key) => !(portfolioCsvColumns as readonly string[]).includes(key)
  )
  if (unknown)
    throw new Error(
      `Unknown column: ${unknown}. Use the product template; customer and pricing fields are not accepted.`
    )
  return {
    actorUserId,
    organizationCode: "MRMPL",
    uid: row.uid,
    itemType: type,
    productSize: row.product_size ?? "",
    category: row.category ?? "",
    subcategory: row.subcategory ?? "",
    productType: row.product_type,
    productionType: row.production_type ?? "",
    grade: row.grade,
    rodType: row.rod_type,
    rodSize: row.rod_size,
    pieceWeight: Number(row.piece_weight),
    blankPieceWeight: Number(row.blank_piece_weight),
    dieCode: row.die_code,
    remarks: row.remarks,
    processesRequired: (row.processes_required ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
    components: (row.components ?? "")
      .split(";")
      .filter((value) => value.trim())
      .map((value) => {
        const separator = value.lastIndexOf(":")
        if (separator < 1)
          throw new Error(
            "Components must use UID:quantity, separated by semicolons."
          )
        return {
          uid: value.slice(0, separator).trim(),
          quantity: Number(value.slice(separator + 1)),
        }
      }),
  }
}
