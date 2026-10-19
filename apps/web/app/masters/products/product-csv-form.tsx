"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { FormSection } from "@/components/ui/golden-patterns"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { importPortfolioCsvAction } from "./actions"

export function ProductCsvForm() {
  const [file, setFile] = useState<File | null>(null)
  const [validatedFile, setValidatedFile] = useState<File | null>(null)
  const [state, action, pending] = useActionState(
    async (
      previous: Parameters<typeof importPortfolioCsvAction>[0],
      form: FormData
    ) => {
      if (file) form.set("file", file)
      const result = await importPortfolioCsvAction(previous, form)
      setValidatedFile(result.preview.length ? file : null)
      return result
    },
    { error: "", message: "", preview: [] }
  )
  return (
    <FormSection
      title="Upload Products CSV"
      description="Register internal products without an RFQ or customer."
    >
      <form action={action} className="grid gap-4">
        <Button asChild variant="outline" className="w-fit">
          <Link href="/masters/products/template.csv">
            Download CSV Template
          </Link>
        </Button>
        <Field>
          <FieldLabel htmlFor="products-csv">Product CSV</FieldLabel>
          <Input
            id="products-csv"
            name="file"
            type="file"
            accept=".csv"
            disabled={pending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setValidatedFile(null)
            }}
          />
          {file ? <p className="text-sm">Selected: {file.name}</p> : null}
          <FieldDescription>
            Up to 500 products, 2 MB. Use existing master values. Separate
            processes with semicolons. Components: M855:2;M856:1. Add component
            products before assemblies/packages.
          </FieldDescription>
        </Field>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-sm">
            {state.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button name="intent" value="preview" disabled={pending || !file}>
            Preview CSV
          </Button>
          <Button
            name="intent"
            value="import"
            disabled={pending || !file || file !== validatedFile}
          >
            Import Products
          </Button>
        </div>
      </form>
      {state.preview.length ? (
        <OperationalTable>
          <TableHeader>
            <TableRow>
              <TableHead>UID</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Item Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.preview.map((row, index) => (
              <TableRow key={index}>
                <TableCell>{row.uid}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>{row.itemType}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      ) : null}
    </FormSection>
  )
}
