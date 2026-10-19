import { expect, test } from "vitest"

import { importProposedOrder } from "./order-acceptance-workbook"

const proposedOrder = (date: string) =>
  new File(
    [
      `Line reference,Product,Route option,Quantity pcs,RM ready date (DD/MM/YYYY)\n1,M6,1,50,${date}`,
    ],
    "proposed.csv",
    { type: "text/csv" }
  )

test("imports DD/MM/YYYY CSV RM dates as calendar ISO without changing the day", async () => {
  expect(await importProposedOrder(proposedOrder("09/10/2026"))).toEqual([
    { id: "1", part: "M6", option: "1", quantity: 50, rmDate: "2026-10-09" },
  ])
})

test("rejects other CSV date formats and impossible dates with row and column", async () => {
  await expect(
    importProposedOrder(proposedOrder("2026-10-09"))
  ).rejects.toThrow(/row 2.*RM ready date.*DD\/MM\/YYYY/)
  await expect(
    importProposedOrder(proposedOrder("31/02/2026"))
  ).rejects.toThrow(/row 2.*RM ready date.*DD\/MM\/YYYY/)
})
