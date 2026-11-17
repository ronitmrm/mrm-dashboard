import Link from "next/link"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { TableCell, TableHead } from "@workspace/ui/components/table"

export function PlanningRecordHeaders() {
  return <><TableHead>Machine Number</TableHead><TableHead>Item Code</TableHead>
    <TableHead>Setup Number</TableHead><TableHead>Job Card Number</TableHead></>
}

function columnValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null
  const text = String(value).trim()
  return text && text !== "-" && text !== "—" ? text : null
}

export function PlanningRecordCells({ floor, machine, part, setup, job }: {
  floor: ProductionFloorCode
  machine?: unknown
  part?: unknown
  setup?: unknown
  job?: unknown
}) {
  const jobCard = columnValue(job)
  return (
    <>
      <TableCell className="align-top font-medium">{columnValue(machine) ?? "—"}</TableCell>
      <TableCell className="align-top">{columnValue(part) ?? "—"}</TableCell>
      <TableCell className="align-top">{columnValue(setup) ?? "—"}</TableCell>
      <TableCell className="align-top">{jobCard
        ? <Link className="font-medium underline underline-offset-4" href={`/dashboard/job-cards/${encodeURIComponent(jobCard)}?floor=${floor}`}>{jobCard}</Link>
        : "—"}</TableCell>
    </>
  )
}
