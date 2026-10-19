"use client"

import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import type {
  DrawingRevisionHistoryRow,
  PrintedDrawingHolding,
} from "@workspace/db"
import {
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState, useId, useState, useTransition } from "react"

import { savePrintedDrawingHoldingAction } from "@/app/commercial/drawing-history/actions"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import {
  StandardDialogContent,
  StandardState,
} from "@/components/ui/golden-patterns"

type DrawingRegisterRow = Pick<
  DrawingRevisionHistoryRow,
  | "drawingId"
  | "uid"
  | "itemDescription"
  | "drawingNumber"
  | "revision"
  | "pendingUpload"
  | "status"
  | "effectiveOn"
  | "ecnNumber"
  | "fileName"
  | "mediaType"
> & { holding: PrintedDrawingHolding | null }

const path = "/commercial/drawing-history"

export function DrawingRegister({
  rows,
  unit,
  canUpdate,
}: {
  rows: DrawingRegisterRow[]
  unit: ProductionFloorCode
  canUpdate: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [switching, startTransition] = useTransition()
  const [selected, setSelected] = useState<DrawingRegisterRow | null>(null)
  const [message, setMessage] = useState("")
  const unitLabel =
    productionFloors.find((floor) => floor.code === unit)?.shortLabel ?? unit

  function changeUnit(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("unit", value)
    setMessage("")
    startTransition(() =>
      router.push(`${path}?${params.toString()}`, { scroll: false })
    )
  }

  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Drawing Records</CardTitle>
        <CardDescription>
          {rows.length.toLocaleString()} products. Printed copies and locations
          belong to the selected production unit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={unit} onValueChange={changeUnit}>
          <div className="overflow-x-auto">
            <TabsList aria-label="Production unit">
              {productionFloors.map((floor) => (
                <TabsTrigger
                  key={floor.code}
                  value={floor.code}
                  disabled={switching}
                >
                  {floor.shortLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent
            value={unit}
            className="grid min-w-0 gap-3"
            aria-busy={switching}
          >
            {message ? <p role="status">{message}</p> : null}
            <OperationalTable
              excelFilters
              filterStorageKey="drawing-history-register"
              containerClassName="max-h-[70vh] rounded-xl border"
              state={rows.length ? "ready" : "empty"}
              stateTitle="No drawing records"
              stateDescription="Drawing records will appear here when available."
              toolbarStart={
                <p className="text-sm text-muted-foreground">
                  {unitLabel} ·{" "}
                  {rows
                    .reduce(
                      (total, row) => total + (row.holding?.quantity ?? 0),
                      0
                    )
                    .toLocaleString()}{" "}
                  recorded copies · before table filters
                </p>
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead data-filterable="true">Product UID</TableHead>
                  <TableHead data-filterable="true">Part</TableHead>
                  <TableHead data-filterable="true">Drawing No.</TableHead>
                  <TableHead data-filterable="true">Revision</TableHead>
                  <TableHead data-filterable="true">Printed Copies</TableHead>
                  <TableHead data-filterable="true">
                    Internal Location
                  </TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead data-filterable="true">Effective</TableHead>
                  <TableHead data-filterable="true">ECN</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.drawingId}>
                    <TableCell className="font-mono">{row.uid}</TableCell>
                    <TableCell>{row.itemDescription}</TableCell>
                    <TableCell className="font-mono">
                      {row.drawingNumber}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={row.revision} tone="neutral" />
                    </TableCell>
                    <TableCell>
                      {row.holding ? row.holding.quantity : "Not recorded"}
                    </TableCell>
                    <TableCell>{row.holding?.location || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        value={
                          row.pendingUpload
                            ? "Pending Drawing Upload"
                            : row.status
                        }
                        tone={row.pendingUpload ? "warning" : undefined}
                      />
                    </TableCell>
                    <TableCell>{formatCalendarDate(row.effectiveOn || "—")}</TableCell>
                    <TableCell>
                      {row.pendingUpload
                        ? "Legacy Baseline"
                        : row.ecnNumber || "Initial Design"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {canUpdate ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected(row)}
                            aria-label={`Record printed copies for ${row.uid}`}
                          >
                            Record Copies
                          </Button>
                        ) : null}
                        {row.fileName ? (
                          <Button asChild size="sm" variant="outline">
                            <AttachmentViewerLink
                              fileName={row.fileName}
                              href={`${path}/${encodeURIComponent(row.uid)}/file/${row.revision}`}
                              mediaType={row.mediaType}
                            >
                              View
                            </AttachmentViewerLink>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`${path}/${encodeURIComponent(row.uid)}`}>
                            History
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </TabsContent>
        </Tabs>
        {selected ? (
          <PrintedCopiesEditor
            key={`${unit}-${selected.drawingId}`}
            row={selected}
            unit={unit}
            unitLabel={unitLabel}
            onClose={() => setSelected(null)}
            onSaved={() => {
              setMessage(
                `Printed copies saved for ${selected.uid} · ${unitLabel}.`
              )
              setSelected(null)
            }}
          />
        ) : null}
      </CardContent>
    </SectionCard>
  )
}

function PrintedCopiesEditor({
  row,
  unit,
  unitLabel,
  onClose,
  onSaved,
}: {
  row: DrawingRegisterRow
  unit: ProductionFloorCode
  unitLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [quantity, setQuantity] = useState(
    row.holding?.quantity.toString() ?? ""
  )
  const [state, formAction, pending] = useActionState(
    async (previous: { error: string; saved: boolean }, data: FormData) => {
      const result = await savePrintedDrawingHoldingAction(previous, data)
      if (result.saved) onSaved()
      return result
    },
    { error: "", saved: false }
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <StandardDialogContent
        title="Printed Drawing Copies"
        description={`${unitLabel} · ${row.uid} · Drawing ${row.drawingNumber} · Revision ${row.revision}`}
      >
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="unit" value={unit} />
          <input type="hidden" name="drawing_id" value={row.drawingId} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-quantity`}>
                Copies Available
              </FieldLabel>
              <Input
                id={`${id}-quantity`}
                name="quantity"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={pending}
              />
              <FieldDescription>
                Enter 0 if this unit has no printed copies of this revision.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-location`}>
                Internal Storage Location
              </FieldLabel>
              <Input
                id={`${id}-location`}
                name="location"
                maxLength={200}
                defaultValue={row.holding?.location ?? ""}
                required={Number(quantity) > 0}
                placeholder="e.g. Shop floor cabinet A, folder 3"
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {state.error ? (
            <StandardState
              variant="error"
              title="Could not save copies"
              description={state.error}
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Drawing History"}
            </Button>
          </DialogFooter>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}
