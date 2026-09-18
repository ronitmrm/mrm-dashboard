import { readFile, writeFile } from "node:fs/promises"
import { prepareCncOpeningWorkbook } from "../lib/cnc-opening-workbook"

const [source, destination] = process.argv.slice(2)
if (!source || !destination) throw new Error("Usage: cnc:prepare <filled.xlsx> <review.json>")
const review = prepareCncOpeningWorkbook(await readFile(source))
await writeFile(destination, JSON.stringify(review, null, 2), { flag: "wx" })
console.log(`Prepared ${review.rows.length} opening setups, ${review.workOrders.length} work orders, ${review.rawMaterial.length} RM rows. Review file: ${destination}`)
