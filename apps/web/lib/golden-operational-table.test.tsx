import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { tableFilterStorageKey } from "@workspace/ui/lib/table-filter-state"

describe("Golden OperationalTable", () => {
  it("renders the shared operational-table boundary", () => {
    const markup = renderToStaticMarkup(
      <OperationalTable filterStorageKey="golden:test">
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Ready</TableCell>
          </TableRow>
        </TableBody>
      </OperationalTable>
    )

    expect(markup).toContain('data-slot="operational-table"')
    expect(markup).toContain('data-filter-storage-key="golden:test"')
  })

  it("renders canonical empty, loading, and error states", () => {
    for (const state of ["empty", "loading", "error"] as const) {
      const markup = renderToStaticMarkup(
        <OperationalTable
          state={state}
          stateDescription="No operational rows are available."
          stateTitle="Table state"
        />
      )

      expect(markup).toContain(`data-state="${state}"`)
      expect(markup).toContain('data-slot="standard-state"')
    }
  })
})

it("creates stable page-scoped persistence keys when none is supplied", () => {
  expect(tableFilterStorageKey(undefined, "/store/stock", ":R2:")).toBe(
    "mrmpl:/store/stock:operational-table:R2"
  )
  expect(tableFilterStorageKey("mrmpl:pricing", "/ignored", ":R2:")).toBe(
    "mrmpl:pricing"
  )
})
