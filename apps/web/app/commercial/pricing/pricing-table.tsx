import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"

import {
  pricingHeaders,
  toPricingViewRow,
  type PricingRegisterRow,
} from "./pricing-workbook"

export function PricingTable({
  filterStorageKey,
  revisionLinks = true,
  rows,
}: {
  filterStorageKey?: string
  revisionLinks?: boolean
  rows: PricingRegisterRow[]
}) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border">
      <Table
        containerClassName="max-h-none overflow-visible"
        className="min-w-max text-xs"
        filterStorageKey={filterStorageKey}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {pricingHeaders.map((header) => (
              <TableHead
                className="max-w-56 whitespace-nowrap"
                data-filterable="true"
                key={header}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => {
              const view = toPricingViewRow(row)
              return (
                <TableRow
                  className="[contain-intrinsic-size:auto_48px] [content-visibility:auto]"
                  key={row.rowKey}
                >
                  {pricingHeaders.map((header) => {
                    const cell = view[header]
                    return (
                      <TableCell
                        className="max-w-56 whitespace-nowrap"
                        key={header}
                      >
                        {header === "Customer Part Code" &&
                        cell &&
                        revisionLinks ? (
                          <Link
                            className="font-mono text-primary underline-offset-4 hover:underline"
                            href={
                              "/commercial/pricing/revisions?customer=" +
                              encodeURIComponent(row.customerId) +
                              "&code=" +
                              encodeURIComponent(String(cell))
                            }
                          >
                            {cell}
                          </Link>
                        ) : header === "Quote Status" && cell ? (
                          <Badge variant="secondary">{cell}</Badge>
                        ) : (
                          cell
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                className="h-32 text-center text-muted-foreground"
                colSpan={pricingHeaders.length}
              >
                No Pricing Rows Match This View.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
