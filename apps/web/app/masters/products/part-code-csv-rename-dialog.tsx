"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PartCodeRename } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { DataDownloadButton } from "@/components/data-download-button"
import { applyPartCodeCsvAction, previewPartCodeCsvAction } from "./actions"

export function PartCodeCsvRenameDialog({
  onRenamed,
}: {
  onRenamed: (message: string, changes: PartCodeRename[]) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PartCodeRename[]>([])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setFile(null)
          setPreview([])
          setError("")
          setOpen(true)
        }}
      >
        Rename Codes CSV
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next)
        }}
      >
        <StandardDialogContent
          title="Universal Part Code Rename"
          description="Updates the same parts across every production unit. Routes, cycle times, types and other details stay the same. Issued documents retain their original codes."
          className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        >
          <DataDownloadButton
            href="/masters/products/rename-template.csv"
            label="Download Current Codes"
          />
          <form
            action={(form) =>
              startTransition(async () => {
                if (!file) return
                form.set("file", file)
                setError("")
                const result = await previewPartCodeCsvAction(form)
                setError(result.error)
                setPreview(result.preview)
              })
            }
            className="flex flex-col gap-3"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="part-code-csv">Part Code CSV</FieldLabel>
                <Input
                  id="part-code-csv"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={pending}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null)
                    setPreview([])
                    setError("")
                  }}
                />
                {file ? <p className="text-sm">Selected: {file.name}</p> : null}
                <FieldDescription>
                  Fill new_part_code beside current_part_code. Leave new codes
                  blank to skip those parts. New codes must be unique and
                  unused. Up to 5,000 rows, 2 MB.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              variant="outline"
              className="w-fit"
              disabled={pending || !file}
            >
              {pending ? "Processing…" : "Preview Changes"}
            </Button>
          </form>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {preview.length ? (
            <>
              <p role="status" className="text-sm">
                {preview.length} universal code changes validated. No codes
                changed yet.
              </p>
              <OperationalTable
                containerClassName="max-h-72"
                filterMode="external"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Current Part Code</TableHead>
                    <TableHead>New Part Code</TableHead>
                    <TableHead>Part</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row) => (
                    <TableRow key={row.itemId}>
                      <TableCell translate="no">{row.currentCode}</TableCell>
                      <TableCell translate="no">{row.newCode}</TableCell>
                      <TableCell className="whitespace-normal">
                        {row.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </OperationalTable>
            </>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !preview.length}
              onClick={() =>
                startTransition(async () => {
                  const form = new FormData()
                  form.set("changes", JSON.stringify(preview))
                  setError("")
                  const result = await applyPartCodeCsvAction(form)
                  if (result.error) {
                    setError(result.error)
                    setPreview([])
                    return
                  }
                  onRenamed(result.message, preview)
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending
                ? "Processing…"
                : `Apply ${preview.length || ""} Code Changes`}
            </Button>
          </DialogFooter>
        </StandardDialogContent>
      </Dialog>
    </>
  )
}
