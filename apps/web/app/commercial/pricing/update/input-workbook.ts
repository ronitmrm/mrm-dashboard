import {
  pricingInputEntries,
  type PricingInputScope,
  type PricingInputTemplateRow,
  type PricingInputUploadRow,
} from "@workspace/db"
import * as XLSX from "xlsx"

const sheets = [
  ["Product Inputs", "product"],
  ["Customer Inputs", "customer"],
] as const
const identityHeaders = [
  "Reference | Row ID",
  "Reference | Version",
  "Reference | Product UID",
  "Reference | Description",
  "Reference | Customer",
  "Reference | Customer Part Code",
  "Reference | Package Customer Code (search only)",
  "Reference | Quote Number",
  "Reference | Item Type",
  "Reference | Pricing Method",
]
const inputHeader = (label: string) => `Input | ${label}`

export function buildPricingInputWorkbook(rows: PricingInputTemplateRow[]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["MRMPL Pricing Input Update — v1"],
      [
        "Edit only columns starting Input |. Keep Reference | Row ID and Version unchanged.",
      ],
      [
        "Product Inputs: one row per shared product. Changes can affect ALL customers and packages using it.",
      ],
      [
        "Customer Inputs: one row per customer quote/component. Customer codes are reference only.",
      ],
      ["Blank means keep current value. Enter 0 to clear a cost where valid."],
      [
        "Percent columns: enter 1 for 1%, or type 1%. FX and piece weight must be greater than zero.",
      ],
      [
        "Non-applicable inputs are blank. Entered values are ignored based on the part's BOM/process selections and pricing method. Do not enter Excel formulas in input columns.",
      ],
      [
        "You may delete unwanted rows. Keep both input sheets, headers, row IDs and versions.",
      ],
      [
        "Calculated columns are reference snapshots, ignored on upload. Software recalculates from inputs.",
      ],
      [
        "Upload, review ALL affected prices, then Apply. Existing history and trial revisions are preserved.",
      ],
      [
        "Changed pricing since download requires a fresh template. Never reuse an applied workbook for another update.",
      ],
    ]),
    "Instructions"
  )
  for (const [name, scope] of sheets) {
    const fields = pricingInputEntries.filter(
      ([, field]) => field.scope === scope
    )
    const priceHeader = `Calculated — ignored | ${scope === "product" ? "Product Base (INR/piece)" : "Current Price (USD/piece)"}`
    const data = [
      [
        ...identityHeaders,
        ...fields.map(([, field]) => inputHeader(field.label)),
        priceHeader,
      ],
      ...rows
        .filter((row) => row.scope === scope)
        .map((row) => [
          row.id,
          row.version,
          row.uid,
          row.description,
          row.customer,
          row.customerPartCode,
          row.packageCustomerCode ?? "",
          row.quoteNumber ?? "",
          row.itemType,
          row.pricingMethod,
          ...fields.map(([key, field]) =>
            row.values[key] === undefined
              ? ""
              : row.values[key]! * ("percent" in field ? 100 : 1)
          ),
          row.calculatedPrice,
        ]),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(data)
    sheet["!cols"] = data[0]!.map((_, index) => ({
      wch: index < 2 ? 38 : index === 3 ? 40 : 26,
    }))
    sheet["!autofilter"] = { ref: sheet["!ref"]! }
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  return workbook
}

export function parsePricingInputWorkbook(
  bytes: Buffer
): PricingInputUploadRow[] {
  const workbook = XLSX.read(bytes, {
    type: "buffer",
    cellFormula: true,
    cellNF: true,
    sheetRows: 20002,
  })
  const rows: PricingInputUploadRow[] = []
  for (const [name, scope] of sheets) {
    const sheet = workbook.Sheets[name]
    if (!sheet?.["!ref"])
      throw new Error(
        `Missing ${name} sheet. Use the Pricing Input Update template.`
      )
    const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"])
    if (range.e.r > 20000 || range.e.c > 100)
      throw new Error(`${name} exceeds the supported template size.`)
    const headers = Array.from({ length: range.e.c + 1 }, (_, column) =>
      String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? "")
    )
    const requiredHeaders = [
      identityHeaders[0]!,
      identityHeaders[1]!,
      ...pricingInputEntries
        .filter(([, field]) => field.scope === scope)
        .map(([, field]) => inputHeader(field.label)),
    ]
    for (const header of requiredHeaders)
      if (headers.filter((value) => value === header).length !== 1)
        throw new Error(`${name}: missing or duplicate column ${header}.`)
    const seen = new Set<string>()
    for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
      const getCell = (header: string): XLSX.CellObject | undefined =>
        sheet[
          XLSX.utils.encode_cell({ r: rowIndex, c: headers.indexOf(header) })
        ]
      const id = String(getCell(identityHeaders[0]!)?.v ?? "").trim()
      const version = String(getCell(identityHeaders[1]!)?.v ?? "").trim()
      const values: PricingInputUploadRow["values"] = {}
      for (const [key, field] of pricingInputEntries) {
        if (field.scope !== scope) continue
        const cell = getCell(inputHeader(field.label))
        if (cell?.f)
          throw new Error(
            `${name} row ${rowIndex + 1}: ${field.label} must be an input value, not an Excel formula.`
          )
        if (cell?.v === undefined || String(cell.v).trim() === "") continue
        if (
          (cell.t !== "s" && cell.t !== "n") ||
          (typeof cell.v !== "string" && typeof cell.v !== "number")
        )
          throw new Error(
            `${name} row ${rowIndex + 1}: invalid ${field.label}.`
          )
        const text = String(cell.v).trim()
        if (!/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?%?$/.test(text))
          throw new Error(
            `${name} row ${rowIndex + 1}: ${field.label} must be numeric.`
          )
        let number = Number(text.replace(/%$/, ""))
        if ("percent" in field) {
          if (
            !(typeof cell.v === "number" && String(cell.z ?? "").includes("%"))
          )
            number /= 100
        } else if (text.endsWith("%"))
          throw new Error(
            `${name} row ${rowIndex + 1}: ${field.label} is not a percentage.`
          )
        if (!Number.isFinite(number))
          throw new Error(
            `${name} row ${rowIndex + 1}: invalid ${field.label}.`
          )
        values[key] = number
      }
      if (!id && !version && !Object.keys(values).length) continue
      if (!id || !version)
        throw new Error(
          `${name} row ${rowIndex + 1}: keep the original row ID and version.`
        )
      if (seen.has(id)) throw new Error(`${name}: duplicate row ID ${id}.`)
      seen.add(id)
      rows.push({ scope: scope as PricingInputScope, id, version, values })
    }
  }
  return rows
}
