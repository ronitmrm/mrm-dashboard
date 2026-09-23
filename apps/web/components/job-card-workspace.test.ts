import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

import {
  formatMasterDecimal,
  formatPiecesPerKg,
} from "./job-card-master-display"

const workspaceSource = readFileSync(
  new URL("./job-card-workspace.tsx", import.meta.url),
  "utf8"
)

test("labels the Product Master value as One-Piece Weight", () => {
  expect(workspaceSource).toContain(
    '<Field label="One-Piece Weight" value={formatMasterDecimal(jobCard.weight100Pieces)}'
  )
})

test("formats Product Master weights for operators", () => {
  expect(formatMasterDecimal("0.90000000")).toBe("0.90")
  expect(formatPiecesPerKg("1111.11111111")).toBe("1112")
})

test("displays Casting to two decimal places without exposing floating-point noise", () => {
  expect(workspaceSource).toContain('<Field label="Casting" value={formatMasterDecimal(jobCard.casting)}')
  expect(formatMasterDecimal(3.8700000000000006)).toBe("3.87")
  expect(formatMasterDecimal(4)).toBe("4.00")
  expect(formatMasterDecimal(null)).toBe("-")
})
