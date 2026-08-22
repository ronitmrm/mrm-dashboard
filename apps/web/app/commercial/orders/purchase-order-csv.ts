import { csvValue, type MasterCsvRow } from "../../../lib/master-data-csv"

export type PurchaseOrderCsvLine = {
  currencyCode: string
  customerPartCode: string
  description?: string
  lineNumber: number
  poPrice: number
  quantity: number
}

export type PurchaseOrderCsvImport = {
  currencyCode: string
  customerUid: string
  lines: PurchaseOrderCsvLine[]
  notes?: string
  poDate: string
  poNumber: string
}

function requiredCsvValue(
  row: MasterCsvRow,
  rowNumber: number,
  label: string,
  ...keys: string[]
) {
  const value = csvValue(row, ...keys)
  if (!value) throw new Error(`CSV row ${rowNumber}: ${label} is required.`)
  return value
}

function csvNumber(
  row: MasterCsvRow,
  rowNumber: number,
  label: string,
  keys: string[],
  valid: (value: number) => boolean
) {
  const value = Number(requiredCsvValue(row, rowNumber, label, ...keys))
  if (!Number.isFinite(value) || !valid(value)) {
    throw new Error(`CSV row ${rowNumber}: ${label} is invalid.`)
  }
  return value
}

export function parsePurchaseOrderCsvRows(
  rows: MasterCsvRow[]
): PurchaseOrderCsvImport {
  if (!rows.length) throw new Error("The PO CSV has no data rows.")

  const first = rows[0]!
  const customerUid = requiredCsvValue(
    first,
    2,
    "customer UID",
    "customer_uid",
    "customer"
  )
  const poNumber = requiredCsvValue(first, 2, "PO number", "po_number", "po")
  const poDate = requiredCsvValue(first, 2, "PO date", "po_date", "date")
  const currencyCode = csvValue(first, "currency_code", "currency") || "USD"
  const notes = csvValue(first, "notes", "remark") || undefined

  const lines = rows.map((row, index) => {
    const rowNumber = index + 2
    const header = {
      currencyCode: csvValue(row, "currency_code", "currency") || "USD",
      customerUid: requiredCsvValue(
        row,
        rowNumber,
        "customer UID",
        "customer_uid",
        "customer"
      ),
      poDate: requiredCsvValue(row, rowNumber, "PO date", "po_date", "date"),
      poNumber: requiredCsvValue(
        row,
        rowNumber,
        "PO number",
        "po_number",
        "po"
      ),
    }
    if (
      header.customerUid !== customerUid ||
      header.poNumber !== poNumber ||
      header.poDate !== poDate ||
      header.currencyCode !== currencyCode
    ) {
      throw new Error("Each CSV file must contain exactly one purchase order.")
    }

    return {
      currencyCode,
      customerPartCode: requiredCsvValue(
        row,
        rowNumber,
        "customer part code",
        "customer_part_code",
        "part_code",
        "item_code"
      ),
      description:
        csvValue(row, "description", "part_description") || undefined,
      lineNumber: csvValue(row, "line_number", "line")
        ? csvNumber(
            row,
            rowNumber,
            "line number",
            ["line_number", "line"],
            (value) => Number.isInteger(value) && value > 0
          )
        : index + 1,
      poPrice: csvNumber(
        row,
        rowNumber,
        "PO price",
        ["po_price", "unit_price", "price", "rate"],
        (value) => value >= 0
      ),
      quantity: csvNumber(
        row,
        rowNumber,
        "quantity",
        ["quantity", "qty"],
        (value) => value > 0
      ),
    }
  })

  if (
    new Set(lines.map(({ lineNumber }) => lineNumber)).size !== lines.length
  ) {
    throw new Error("PO line numbers must be unique.")
  }

  return { currencyCode, customerUid, lines, notes, poDate, poNumber }
}
