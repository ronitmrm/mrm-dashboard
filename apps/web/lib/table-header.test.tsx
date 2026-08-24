import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

describe("TableHeader", () => {
  it("stays visible at the top while a table scrolls", () => {
    const markup = renderToStaticMarkup(
      <table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
          </TableRow>
        </TableHeader>
      </table>
    )

    expect(markup).toContain("sticky top-0 z-10")
  })
})
