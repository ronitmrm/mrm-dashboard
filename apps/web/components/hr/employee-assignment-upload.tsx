"use client"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { LoaderCircle } from "lucide-react"
import { useFormStatus } from "react-dom"

import { bulkAssignEmployeesAction } from "@/app/hr/actions"

function EmployeeAssignmentUploadFields() {
  const { pending } = useFormStatus()

  return (
    <>
      <Field>
        <FieldLabel htmlFor="employee-assignments-file">
          Completed Excel Workbook
        </FieldLabel>
        <Input
          accept=".xlsx,.xls"
          disabled={pending}
          id="employee-assignments-file"
          name="employee_assignments_file"
          required
          type="file"
        />
      </Field>
      <Button disabled={pending} type="submit">
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
            Uploading…
          </>
        ) : (
          "Upload Assignments"
        )}
      </Button>
      {pending ? (
        <div
          aria-live="assertive"
          className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-6 backdrop-blur-sm"
          role="status"
        >
          <div className="grid max-w-md justify-items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-xl">
            <LoaderCircle className="size-10 animate-spin text-primary" />
            <p className="text-lg font-semibold">
              Uploading Employee Assignments…
            </p>
            <p className="text-sm text-muted-foreground">
              Please Wait. Do Not Press Another Button Or Close This Screen. You
              Can Continue When The Upload Finishes.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function EmployeeAssignmentUpload() {
  return (
    <form
      action={bulkAssignEmployeesAction}
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      encType="multipart/form-data"
    >
      <input name="panel" type="hidden" value="employeeMasterPanel" />
      <EmployeeAssignmentUploadFields />
    </form>
  )
}
