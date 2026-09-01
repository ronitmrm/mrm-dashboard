import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

describe("TableHeader", () => {
  it("uses the available viewport while its header stays visible", () => {
    const markup = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Value</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(markup).toContain("sticky top-0 z-10")
    expect(markup).toContain(
      "max-h-[calc(100svh-var(--header-height)-8rem)]"
    )
    expect(markup).toContain("overflow-auto")
  })
})
