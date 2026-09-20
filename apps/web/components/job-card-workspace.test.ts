import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

const workspaceSource = readFileSync(
  new URL("./job-card-workspace.tsx", import.meta.url),
  "utf8"
)

test("labels the Product Master value as One-Piece Weight", () => {
  expect(workspaceSource).toContain(
    '<Field label="One-Piece Weight" value={jobCard.weight100Pieces}'
  )
})
