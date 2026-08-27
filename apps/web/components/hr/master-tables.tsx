"use client"

import { useState } from "react"

import type { RecruitmentMasterSnapshot } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import { FilterX, Pencil, Trash2 } from "lucide-react"

import {
  deleteRecruitmentMasterAction,
  renameRecruitmentMasterAction,
} from "@/app/hr/actions"

import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"

function MasterTable({
  canWrite,
  kind,
  masterView,
  rows,
  title,
}: {
  canWrite: boolean
  kind: "department" | "designation"
  masterView?: "dataEntry" | "masterTables"
  rows: RecruitmentMasterSnapshot["departments"]
  title: string
}) {
  const [editingRow, setEditingRow] = useState<(typeof rows)[number] | null>(
    null
  )
  const [deletingRow, setDeletingRow] = useState<(typeof rows)[number] | null>(
    null
  )
  const canEdit = canWrite
  const table = useExcelTable({
    rows,
    columns: [
      {
        key: "code",
        label: `${title} code`,
        values: (row) => [row.code],
      },
      {
        key: "name",
        label: `${title} name`,
        values: (row) => [row.name],
      },
    ],
  })
  const visibleRows = table.visibleRows

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Showing {visibleRows.length} Of {rows.length} Active Records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          <div className="flex justify-end">
            <Button
              disabled={!table.hasFilters}
              onClick={table.clearFilters}
              size="sm"
              type="button"
              variant="outline"
            >
              <FilterX data-icon="inline-start" />
              Clear All Filters
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                {canEdit ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>
                  <ExcelColumnFilter
                    label={`${title} code`}
                    {...table.filterProps("code")}
                  />
                </TableHead>
                <TableHead>
                  <ExcelColumnFilter
                    label={`${title} name`}
                    {...table.filterProps("name")}
                  />
                </TableHead>
                {canEdit ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <Button
                        aria-label={`Edit ${row.name}`}
                        onClick={() => {
                          setEditingRow(row)
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                      <Button
                        aria-label={`Delete ${row.name}`}
                        className="ml-1"
                        onClick={() => setDeletingRow(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 data-icon="inline-start" />
                        Delete
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!visibleRows.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={canEdit ? 3 : 2}
                  >
                    No Records Match The Selected Filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setEditingRow(null)
        }}
        open={editingRow !== null}
      >
        {editingRow ? (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                Edit {kind === "department" ? "Department" : "Designation"}
              </DialogTitle>
              <DialogDescription>
                Change {editingRow.code} - {editingRow.name}. The code remains
                fixed and the new name is used everywhere.
              </DialogDescription>
            </DialogHeader>
            <form action={renameRecruitmentMasterAction} className="grid gap-5">
              <input name="panel" type="hidden" value="mastersPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input name="master_id" type="hidden" value={editingRow.id} />
              <input name="master_kind" type="hidden" value={kind} />
              <Field>
                <FieldLabel htmlFor="edit-department-code">Code</FieldLabel>
                <Input
                  id="edit-department-code"
                  readOnly
                  value={editingRow.code}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-department-name">Name</FieldLabel>
                <Input
                  defaultValue={editingRow.name}
                  id="edit-department-name"
                  name="name"
                  required
                />
              </Field>
              <DialogFooter>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null)
        }}
        open={deletingRow !== null}
      >
        {deletingRow ? (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                Delete {kind === "department" ? "Department" : "Designation"}
              </DialogTitle>
              <DialogDescription>
                Unused records delete immediately. If used, select the correct
                replacement first.
              </DialogDescription>
            </DialogHeader>
            <form action={deleteRecruitmentMasterAction} className="grid gap-5">
              <input name="panel" type="hidden" value="mastersPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input name="master_id" type="hidden" value={deletingRow.id} />
              <input name="master_kind" type="hidden" value={kind} />
              <Field>
                <FieldLabel htmlFor={`replacement-${kind}`}>
                  Replacement (Required Only If Used)
                </FieldLabel>
                <NativeSelect
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id={`replacement-${kind}`}
                  name="replacement_master_id"
                >
                  <NativeSelectOption value="">
                    No replacement — record must be unused
                  </NativeSelectOption>
                  {rows
                    .filter((row) => row.id !== deletingRow.id)
                    .map((row) => (
                      <NativeSelectOption key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`deletion-reason-${kind}`}>
                  Reason For Deletion
                </FieldLabel>
                <Input
                  id={`deletion-reason-${kind}`}
                  name="deletion_reason"
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  onClick={() => setDeletingRow(null)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

export function MasterTables({
  canWrite = false,
  kind,
  masterView,
  masters,
}: {
  canWrite?: boolean
  kind: "department" | "designation"
  masterView?: "dataEntry" | "masterTables"
  masters: RecruitmentMasterSnapshot
}) {
  const rows =
    kind === "department" ? masters.departments : masters.designations
  return (
    <MasterTable
      canWrite={canWrite}
      kind={kind}
      masterView={masterView}
      rows={rows}
      title={kind === "department" ? "Departments" : "Designations"}
    />
  )
}
