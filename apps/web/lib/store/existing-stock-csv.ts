import { createHash } from "node:crypto"
import { csvDateValue } from "../csv-date"
import { csvValue, type MasterCsvRow } from "../master-data-csv"

type Reference = { id: string; code: string }
export function existingStockCsvInputs(
  rows: MasterCsvRow[],
  references: {
    items: Array<{ id: string; typeCode: string; trackingMode: string }>
    locations: Reference[]
    suppliers: Reference[]
  },
  organizationId: string
) {
  if (rows.length > 100) throw new Error("Upload at most 100 rows at a time.")
  const seen = new Set<string>()
  let units = 0
  return rows.map((row, index) => {
    const rowNumber = index + 2
    const value = (key: string) => csvValue(row, key)
    const fail = (message: string): never => {
      throw new Error(`CSV row ${rowNumber}: ${message}`)
    }
    const find = (values: Reference[], code: string, label: string) => {
      const matches = values.filter(
        (item) => item.code.toLowerCase() === code.toLowerCase()
      )
      return code && matches.length === 1
        ? matches[0]!.id
        : fail(`Choose an existing ${label} code.`)
    }
    const reference = value("Entry Reference")
    if (!reference || seen.has(reference.toLowerCase()))
      fail("Entry Reference is required and must be unique within the file.")
    seen.add(reference.toLowerCase())
    const itemTypeId = find(
      references.items.map((item) => ({ id: item.id, code: item.typeCode })),
      value("Asset Code"),
      "Asset"
    )
    const quantityText = value("Quantity")
    if (!/^\d+(?:\.\d{1,3})?$/.test(quantityText) || Number(quantityText) <= 0)
      fail("Quantity must be positive, with at most three decimal places.")
    const quantity = Number(quantityText)
    if (
      references.items.find((item) => item.id === itemTypeId)?.trackingMode ===
      "SERIALIZED"
    ) {
      if (!Number.isInteger(quantity))
        fail("Non Consumables require a whole number quantity.")
      units += quantity
      if (units > 100) fail("Upload at most 100 physical units at a time.")
    }
    const condition = value("Condition").toLowerCase()
    if (!["usable", "available", "needs repair", "broken"].includes(condition))
      fail("Condition must be Usable or Needs repair.")
    const hash = createHash("sha256")
      .update(`${organizationId}|existing-stock-csv|${reference.toLowerCase()}`)
      .digest("hex")
    return {
      entryKey: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`,
      itemTypeId,
      quantity,
      locationId: find(
        references.locations,
        value("Storage Location Code"),
        "Main Store location"
      ),
      condition: ["usable", "available"].includes(condition)
        ? "AVAILABLE"
        : "BROKEN",
      purchasedOn: csvDateValue(
        value("Purchase Date"),
        rowNumber,
        "Purchase Date"
      ),
      supplierId: value("Supplier Code")
        ? find(references.suppliers, value("Supplier Code"), "Supplier")
        : null,
      unitPrice: value("Price Per Unit"),
      billNumber: value("Bill Number"),
      billDate: csvDateValue(value("Bill Date"), rowNumber, "Bill Date"),
      manufacturerMake: value("Manufacturer Make"),
      serialNumbers: value("Serial Numbers").split(/[|\r\n]/),
      installedOn: csvDateValue(
        value("Installation Date"),
        rowNumber,
        "Installation Date"
      ),
      warrantyPeriod: value("Warranty Period Days"),
      warrantyUntil: csvDateValue(
        value("Warranty Expiry Date"),
        rowNumber,
        "Warranty Expiry Date"
      ),
      remark: value("Notes"),
    }
  })
}
