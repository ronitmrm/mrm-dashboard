import * as XLSX from "xlsx"
import { expect, test } from "vitest"
import { prepareCncOpeningWorkbook } from "./cnc-opening-workbook"

test("reconciles the six-sheet template and refuses overlapping running/completed output", () => {
  const book = XLSX.utils.book_new()
  const sheet = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], [], ...rows]), name)
  sheet("1 Work Orders", [["Work Order No.", "Job Card No.", "Part No.", "Order Qty (pcs)", "Due Date"], ["WO", "001", "PART", 10000, "2026-10-01"]])
  sheet("2 Running Setups", [["Machine No.", "Job Card No.", "Part No.", "Route / Option", "Setup No."], ["CNC-1", "001", "PART", "1", 2], ["CNC-2", "001", "PART", "1", 2]])
  sheet("3 Running Production", [["Machine No.", "Job Card No.", "Part No.", "Route / Option", "Setup No.", "Good Qty (pcs)", "Rejected Qty (pcs)"], ["CNC-1", "001", "PART", "1", 2, 5000, 20], ["CNC-2", "001", "PART", "1", 2, 2000, 5]])
  sheet("4 Completed Setups", [["Job Card No.", "Part No.", "Route / Option", "Setup No.", "Good Qty (pcs)", "Rejected Qty (pcs)"], ["001", "PART", "1", 1, 10000, 0]])
  sheet("5 Raw Material", [["Job Card No.", "Part No.", "RM PO No.", "RM Received Date", "Total Received (kg)", "Unused Available (kg)"], ["001", "PART", "RM", "2026-09-17", 500, 100]])
  sheet("6 Cutoff", [["Cutoff Date", "Cutoff Time (IST)"], ["2026-09-18", 22 / 24]])
  const bytes = () => XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer
  expect(prepareCncOpeningWorkbook(bytes())).toMatchObject({ cutoffAt: "2026-09-18T22:00:00+05:30", rows: [
    { jobCardNumber: "001", setupNumber: 1, goodPieces: 10000, status: "completed" },
    { jobCardNumber: "001", setupNumber: 2, machineNumber: "CNC-2", goodPieces: 2000, rejectedPieces: 5, status: "running" },
    { jobCardNumber: "001", setupNumber: 2, machineNumber: "CNC-1", goodPieces: 5000, rejectedPieces: 20, status: "running" },
  ], rawMaterial: [{ "Unused Available (kg)": 100 }] })
  delete book.Sheets["5 Raw Material"]!.F4
  const prepared = prepareCncOpeningWorkbook(bytes())
  expect(prepared.rawMaterial[0]).toMatchObject({ "Total Received (kg)": 500 })
  expect(prepared.rawMaterial[0]).not.toHaveProperty("Unused Available (kg)")
  delete book.Sheets["5 Raw Material"]!.E4
  expect(() => prepareCncOpeningWorkbook(bytes())).toThrow("Total Received (kg) is required")
  book.Sheets["5 Raw Material"]!.E4 = { t: "n", v: 500 }
  book.Sheets["4 Completed Setups"]!.D4 = { t: "n", v: 2 }
  expect(() => prepareCncOpeningWorkbook(bytes())).toThrow("Duplicate opening setup")
})
