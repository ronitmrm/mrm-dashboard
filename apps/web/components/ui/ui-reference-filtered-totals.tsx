"use client"
import { useCallback, useState } from "react"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@workspace/ui/components/table"
const examples = [
  { id: "setup", stage: "Setup", pieces: 4 },
  { id: "checking", stage: "Checking", pieces: 6 },
]
export function UiReferenceFilteredTotals() {
  const [total, setTotal] = useState(10)
  const updateTotal = useCallback(
    (ids: string[]) =>
      setTotal(
        examples
          .filter((row) => ids.includes(row.id))
          .reduce((sum, row) => sum + row.pieces, 0)
      ),
    []
  )
  return (
    <OperationalTable
      onFilteredRowIdsChange={updateTotal}
      filterStorageKey="ui-reference-filtered-totals"
      containerClassName="rounded-lg border"
      toolbarStart={
        <span className="text-sm font-medium">Totals follow table filters</span>
      }
    >
      <TableHeader>
        <TableRow>
          <TableHead>Stage</TableHead>
          <TableHead>Pieces</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {examples.map((row) => (
          <TableRow key={row.id} data-row-id={row.id}>
            <TableCell>{row.stage}</TableCell>
            <TableCell>{row.pieces}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Filtered total</TableCell>
          <TableCell>{total}</TableCell>
        </TableRow>
      </TableFooter>
    </OperationalTable>
  )
}
