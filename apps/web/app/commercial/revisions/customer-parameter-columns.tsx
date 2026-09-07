import {
  customerRevisionParameterColumns,
  type CustomerRevisionParameters,
} from "@workspace/db"
import { TableCell, TableHead } from "@workspace/ui/components/table"

export const customerParameterColumnCount =
  customerRevisionParameterColumns.length

const formatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export function CustomerParameterHeaders() {
  return customerRevisionParameterColumns.map(({ label }) => (
    <TableHead key={label}>{label}</TableHead>
  ))
}

export function CustomerParameterCells({
  values,
}: {
  values: CustomerRevisionParameters
}) {
  return customerRevisionParameterColumns.map(({ label, format }) => {
    const value = values[label]
    const display =
      value === null || value === ""
        ? "—"
        : format === "text"
          ? value
          : Number.isFinite(Number(value))
            ? format === "percent"
              ? `${formatter.format(Number(value) * 100)}%`
              : formatter.format(Number(value))
            : "—"
    return (
      <TableCell
        className="max-w-64 min-w-32 break-words whitespace-normal tabular-nums"
        key={label}
      >
        {display}
      </TableCell>
    )
  })
}
