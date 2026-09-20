import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

import {
  formatOnePieceWeight,
  formatPiecesPerKg,
} from "./job-card-master-display"

const workspaceSource = readFileSync(
  new URL("./job-card-workspace.tsx", import.meta.url),
  "utf8"
)

test("labels the Product Master value as One-Piece Weight", () => {
  expect(workspaceSource).toContain(
    '<Field label="One-Piece Weight" value={formatOnePieceWeight(jobCard.weight100Pieces)}'
  )
})

test("formats Product Master weights for operators", () => {
  expect(formatOnePieceWeight("0.90000000")).toBe("0.90")
  expect(formatPiecesPerKg("1111.11111111")).toBe("1112")
})
