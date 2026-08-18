"use client"

import { useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
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

import {
  deleteCommercialMasterAction,
  renameCommercialMasterAction,
} from "./actions"

type CommercialMasterRow = {
  id: string
  kind: string
  label: string
}

function kindLabel(kind: string) {
  return kind
    .replace(/^commercial_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function CommercialMasterTable({
  canWrite,
  rows,
}: {
  canWrite: boolean
  rows: CommercialMasterRow[]
}) {
  const [kind, setKind] = useState(rows[0]?.kind ?? "")
  const [editing, setEditing] = useState<CommercialMasterRow | null>(null)
  const [deleting, setDeleting] = useState<CommercialMasterRow | null>(null)
  const kinds = useMemo(() => [...new Set(rows.map((row) => row.kind))], [rows])
  const visibleRows = rows.filter((row) => row.kind === kind)
  const replacementRows = deleting
    ? rows.filter((row) => row.kind === deleting.kind && row.id !== deleting.id)
    : []

  return (
    <div className="grid gap-4">
      <Field className="max-w-md">
        <FieldLabel htmlFor="commercial-master-table-kind">Master</FieldLabel>
        <NativeSelect
          id="commercial-master-table-kind"
          onChange={(event) => setKind(event.target.value)}
          value={kind}
        >
          {kinds.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {kindLabel(value)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {canWrite ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.label}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {row.kind !== "commercial_material_rate" ? (
                        <Button
                          onClick={() => setEditing(row)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => setDeleting(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        open={editing !== null}
      >
        {editing ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {kindLabel(editing.kind)}</DialogTitle>
              <DialogDescription>
                The master identity stays fixed. The new name is used
                everywhere.
              </DialogDescription>
            </DialogHeader>
            <form action={renameCommercialMasterAction} className="grid gap-4">
              <input name="master_view" type="hidden" value="masterTables" />
              <input name="master_id" type="hidden" value={editing.id} />
              <input name="master_kind" type="hidden" value={editing.kind} />
              <Field>
                <FieldLabel htmlFor="commercial-master-edit-name">
                  Name
                </FieldLabel>
                <Input
                  defaultValue={editing.label}
                  id="commercial-master-edit-name"
                  name="name"
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  onClick={() => setEditing(null)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        open={deleting !== null}
      >
        {deleting ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {kindLabel(deleting.kind)}</DialogTitle>
              <DialogDescription>
                Unused records delete immediately. If used, select the correct
                replacement first.
              </DialogDescription>
            </DialogHeader>
            <form action={deleteCommercialMasterAction} className="grid gap-4">
              <input name="master_view" type="hidden" value="masterTables" />
              <input name="master_id" type="hidden" value={deleting.id} />
              <input name="master_kind" type="hidden" value={deleting.kind} />
              <Field>
                <FieldLabel htmlFor="commercial-master-replacement">
                  Replacement (Required Only If Used)
                </FieldLabel>
                <NativeSelect
                  id="commercial-master-replacement"
                  name="replacement_master_id"
                >
                  <NativeSelectOption value="">
                    No replacement — record must be unused
                  </NativeSelectOption>
                  {replacementRows.map((row) => (
                    <NativeSelectOption key={row.id} value={row.id}>
                      {row.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="commercial-master-deletion-reason">
                  Reason For Deletion
                </FieldLabel>
                <Input
                  id="commercial-master-deletion-reason"
                  name="deletion_reason"
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  onClick={() => setDeleting(null)}
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
    </div>
  )
}
