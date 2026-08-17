"use client"

import { useMemo, useState } from "react"

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
import { Pencil } from "lucide-react"

import { renameDepartmentMasterAction } from "@/app/hr/actions"

import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"

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
  const [codeFilter, setCodeFilter] = useState<string[] | null>(null)
  const [nameFilter, setNameFilter] = useState<string[] | null>(null)
  const [editingRow, setEditingRow] = useState<(typeof rows)[number] | null>(
    null
  )
  const [referenceMode, setReferenceMode] = useState<"clear" | "propagate">(
    "propagate"
  )
  const canEdit = canWrite && kind === "department"
  const options = useMemo(
    () => ({
      codes: uniqueFilterOptions(rows.map((row) => row.code)),
      names: uniqueFilterOptions(rows.map((row) => row.name)),
    }),
    [rows]
  )
  const visibleRows = rows.filter(
    (row) =>
      matchesColumnFilter(row.code, codeFilter) &&
      matchesColumnFilter(row.name, nameFilter)
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Showing {visibleRows.length} Of {rows.length} Active Records
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
                    onApply={setCodeFilter}
                    options={options.codes}
                    selected={codeFilter}
                  />
                </TableHead>
                <TableHead>
                  <ExcelColumnFilter
                    label={`${title} name`}
                    onApply={setNameFilter}
                    options={options.names}
                    selected={nameFilter}
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
                          setReferenceMode("propagate")
                          setEditingRow(row)
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil data-icon="inline-start" />
                        Edit
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
              <DialogTitle>Edit Department</DialogTitle>
              <DialogDescription>
                Change {editingRow.code} - {editingRow.name}. Should The New
                Name Be Applied To Every Existing Record?
              </DialogDescription>
            </DialogHeader>
            <form action={renameDepartmentMasterAction} className="grid gap-5">
              <input name="panel" type="hidden" value="mastersPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input
                name="department_id"
                type="hidden"
                value={editingRow.id}
              />
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
              <Field>
                <FieldLabel htmlFor="edit-department-reference-mode">
                  Apply Change To Existing Records?
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="edit-department-reference-mode"
                  name="reference_mode"
                  onChange={(event) =>
                    setReferenceMode(
                      event.target.value === "clear" ? "clear" : "propagate"
                    )
                  }
                  value={referenceMode}
                >
                  <NativeSelectOption value="propagate">
                    Yes - Update Everywhere
                  </NativeSelectOption>
                  <NativeSelectOption value="clear">
                    No - Clear Existing Department Selections
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {referenceMode === "clear" ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Existing Approved Posts, Templates, And Candidates Will Keep
                  Their Records, But Their Department Will Become Blank.
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="submit"
                  variant={
                    referenceMode === "clear" ? "destructive" : "default"
                  }
                >
                  Save Department Change
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
  masterView,
  masters,
}: {
  canWrite?: boolean
  masterView?: "dataEntry" | "masterTables"
  masters: RecruitmentMasterSnapshot
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <MasterTable
        canWrite={canWrite}
        kind="department"
        masterView={masterView}
        rows={masters.departments}
        title="Departments"
      />
      <MasterTable
        canWrite={canWrite}
        kind="designation"
        masterView={masterView}
        rows={masters.designations}
        title="Designations"
      />
    </div>
  )
}
