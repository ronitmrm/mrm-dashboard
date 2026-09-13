"use client"

import { useMemo, useState, useTransition } from "react"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { applyPricingInputs, previewPricingInputs } from "./actions"

type Preview = Extract<
  Awaited<ReturnType<typeof previewPricingInputs>>,
  { ok: true }
>["preview"]
const pageSize = 100
const price = (value: number) => value.toFixed(4)

export function PricingInputUpdate() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState("")
  const [applied, setApplied] = useState("")
  const [reason, setReason] = useState("Pricing Excel input update")
  const [pending, startTransition] = useTransition()

  function submit(apply: boolean) {
    if (!file) {
      setError("Choose the completed pricing input template.")
      return
    }
    const data = new FormData()
    data.set("workbook", file)
    data.set("reason", reason)
    data.set("preview_token", preview?.token ?? "")
    setError("")
    startTransition(async () => {
      try {
        if (apply) {
          const result = await applyPricingInputs(data)
          if (!result.ok) {
            setError(result.error)
            setPreview(null)
            return
          }
          setApplied(result.revision.revisionNumber)
          setPreview(null)
          setFile(null)
        } else {
          const result = await previewPricingInputs(data)
          if (!result.ok) {
            setError(result.error)
            setPreview(null)
            return
          }
          setPreview(result.preview)
        }
      } catch {
        setError(
          "The request could not finish. Retry; an already-applied preview will not create another revision."
        )
      }
    })
  }

  return (
    <div className="grid gap-6">
      <SectionCard>
        <CardHeader>
          <CardTitle>1. Download And Edit Inputs</CardTitle>
          <CardDescription>
            Product inputs are shared across customers. Customer inputs apply to
            their own price rows. Calculated columns are ignored on upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Edit only Input columns. Blank keeps the current value; 0 explicitly
            clears a cost where allowed. Enter 1 for 1%. Keep row IDs and
            versions unchanged. Non-applicable inputs stay blank.
          </p>
          <Button asChild variant="outline" className="w-fit">
            <a href="/commercial/pricing/update/template.xlsx">
              Download Input Template
            </a>
          </Button>
        </CardContent>
      </SectionCard>
      <SectionCard>
        <CardHeader>
          <CardTitle>2. Upload And Preview</CardTitle>
          <CardDescription>
            Preview does not change saved prices. Old pricing and trial revision
            history are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="pricing-workbook">
              Completed Input Template (.xlsx, up to 10 MB)
            </FieldLabel>
            <Input
              id="pricing-workbook"
              type="file"
              accept=".xlsx"
              disabled={pending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setPreview(null)
                setApplied("")
                setError("")
              }}
            />
          </Field>
          <Button
            className="w-fit"
            disabled={pending || !file}
            onClick={() => submit(false)}
          >
            {pending ? "Processing…" : "Preview Calculated Prices"}
          </Button>
          {error && (
            <StandardState
              variant="error"
              title="Workbook Not Applied"
              description={error}
            />
          )}
          {applied && (
            <StandardState
              variant="empty"
              title={`Applied ${applied}`}
              description="Inputs and calculated prices were saved as a new revision. Download a fresh template for the next update."
              action={
                <Button asChild>
                  <Link href="/commercial/pricing">View Pricing</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </SectionCard>
      {preview && (
        <>
          <SectionCard>
            <CardHeader>
              <CardTitle>Input Changes ({preview.changes.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PreviewTable
                key={`${preview.token}:inputs`}
                rows={preview.changes.map((change) => ({
                  id: `${change.scope}:${change.id}:${change.field}`,
                  values: {
                    Product: change.uid,
                    "Scope / Customer": change.customer,
                    Input: change.label,
                    "Old Value": change.field.endsWith("_percent")
                      ? `${(change.oldValue * 100).toFixed(4)}%`
                      : String(change.oldValue),
                    "New Value": change.field.endsWith("_percent")
                      ? `${(change.newValue * 100).toFixed(4)}%`
                      : String(change.newValue),
                  },
                }))}
              />
            </CardContent>
          </SectionCard>
          <SectionCard>
            <CardHeader>
              <CardTitle>
                Affected Customer Prices ({preview.prices.length})
              </CardTitle>
              <CardDescription>
                Includes affected components and package ancestors. All amounts
                below are USD per piece.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PreviewTable
                key={`${preview.token}:prices`}
                rows={preview.prices.map((row) => ({
                  id: row.id,
                  values: {
                    Product: row.uid,
                    Customer: row.customer,
                    "Own Customer Part Code": row.customerPartCode || "-",
                    "Package Code (search only)":
                      row.packageCustomerCode || "-",
                    Quote: row.quoteNumber,
                    "Current USD/piece": price(row.oldPrice),
                    "Calculated USD/piece": price(row.newPrice),
                  },
                }))}
              />
            </CardContent>
          </SectionCard>
          <SectionCard>
            <CardHeader>
              <CardTitle>3. Apply Reviewed Prices</CardTitle>
              <CardDescription>
                This accepts the listed prices for every affected customer and
                records a new bulk revision. No quote documents are sent.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="pricing-update-reason">Reason</FieldLabel>
                <Input
                  id="pricing-update-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={pending}
                />
              </Field>
              <Button
                className="w-fit"
                disabled={pending || !reason.trim()}
                onClick={() => submit(true)}
              >
                {pending ? "Applying…" : "Apply Reviewed Inputs And Prices"}
              </Button>
            </CardContent>
          </SectionCard>
        </>
      )}
    </div>
  )
}

function PreviewTable({
  rows,
}: {
  rows: Array<{ id: string; values: Record<string, string> }>
}) {
  const [page, setPage] = useState(0)
  const columns = useMemo(
    () =>
      Object.keys(rows[0]?.values ?? {}).map((key) => ({
        key,
        label: key,
        values: (row: (typeof rows)[number]) => [row.values[key]],
      })),
    [rows]
  )
  const table = useExcelTable({ rows, columns })
  const pages = Math.max(1, Math.ceil(table.visibleRows.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {table.visibleRows.length} matching rows of {rows.length}; filters
          include all pages.
        </span>
        <Button
          variant="outline"
          disabled={!table.hasFilters}
          onClick={() => {
            table.clearFilters()
            setPage(0)
          }}
        >
          Clear Filters
        </Button>
      </div>
      <OperationalTable
        filterMode="external"
        state={rows.length ? "ready" : "empty"}
        stateTitle="No Active Customer Prices Affected"
      >
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className="min-w-40">
                <span className="block">{column.label}</span>
                <ExcelColumnFilter
                  label={column.label}
                  {...table.filterProps(column.key)}
                  onApply={(selected) => {
                    table.setFilter(column.key, selected)
                    setPage(0)
                  }}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.visibleRows
            .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
            .map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {row.values[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </OperationalTable>
      <div className="flex items-center gap-3 text-sm">
        <Button
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </Button>
        <span>
          Page {currentPage + 1} of {pages}
        </span>
        <Button
          variant="outline"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </>
  )
}
