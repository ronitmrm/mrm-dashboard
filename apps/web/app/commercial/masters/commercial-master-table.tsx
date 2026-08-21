"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

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
import {
  commercialMasterKinds,
  commercialMasterSelection,
  commercialMasterViewHref,
  commercialMasterWorkspaceKind,
} from "@/lib/commercial-master-workspace"

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
  initialKind,
  rows,
}: {
  canWrite: boolean
  initialKind: string
  rows: CommercialMasterRow[]
}) {
  const router = useRouter()
  const [workspaceKind, setWorkspaceKind] = useState(() =>
    commercialMasterWorkspaceKind(commercialMasterSelection(initialKind))
  )
  const [editing, setEditing] = useState<CommercialMasterRow | null>(null)
  const [deleting, setDeleting] = useState<CommercialMasterRow | null>(null)
  const selection = commercialMasterSelection(workspaceKind)
  const visibleRows = rows.filter((row) => row.kind === selection.tableKind)
  const replacementRows = deleting
    ? rows.filter((row) => row.kind === deleting.kind && row.id !== deleting.id)
    : []

  return (
    <div className="grid gap-4">
      <Field className="max-w-md">
        <FieldLabel htmlFor="commercial-master-table-kind">Master</FieldLabel>
        <NativeSelect
          id="commercial-master-table-kind"
          onChange={(event) => {
            const nextKind = commercialMasterSelection(event.target.value)
            const nextWorkspaceKind = commercialMasterWorkspaceKind(nextKind)
            setWorkspaceKind(nextWorkspaceKind)
            router.replace(
              commercialMasterViewHref("masterTables", nextWorkspaceKind),
              { scroll: false }
            )
          }}
          value={workspaceKind}
        >
          {commercialMasterKinds.map((option) => {
            const optionKind = commercialMasterWorkspaceKind(option)
            return (
              <NativeSelectOption key={optionKind} value={optionKind}>
                {option.label}
              </NativeSelectOption>
            )
          })}
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
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={canWrite ? 2 : 1}
                >
                  No {selection.label.toLowerCase()} records yet.
                </TableCell>
              </TableRow>
            ) : null}
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
              <input
                name="workspace_kind"
                type="hidden"
                value={workspaceKind}
              />
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
              <input
                name="workspace_kind"
                type="hidden"
                value={workspaceKind}
              />
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
