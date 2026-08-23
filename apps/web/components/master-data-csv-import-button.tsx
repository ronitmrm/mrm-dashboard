"use client"

import { Download, Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"

type CsvImportAction = (formData: FormData) => void | Promise<void>

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function MasterDataCsvDownloadButton({
  columns,
  fileName,
  href,
}: {
  columns?: readonly string[]
  fileName?: string
  href?: string
}) {
  const content = columns?.length
    ? `\uFEFF${columns.map(csvCell).join(",")}\r\n`
    : ""
  const label = (
    <>
      <Download className="size-4" />
      Download CSV
    </>
  )

  return href ? (
    <Button asChild size="sm" variant="outline">
      <a href={href}>{label}</a>
    </Button>
  ) : (
    <Button
      disabled={!content}
      size="sm"
      type="button"
      variant="outline"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([content], { type: "text/csv;charset=utf-8" })
        )
        const link = document.createElement("a")
        link.href = url
        link.download = fileName || "master-template.csv"
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      }}
    >
      {label}
    </Button>
  )
}

export function MasterDataCsvImportButton({
  action,
  fields = {},
  fileField = "master_csv_file",
}: {
  action: CsvImportAction
  fields?: Record<string, string>
  fileField?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action={action}
      className="contents"
      ref={formRef}
      onSubmit={() => setSubmitting(true)}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <input
        accept=".csv,text/csv"
        className="sr-only"
        name={fileField}
        ref={inputRef}
        required
        type="file"
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            formRef.current?.requestSubmit()
          }
        }}
      />
      <Button
        disabled={submitting}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {submitting ? "Importing CSV..." : "Upload CSV"}
      </Button>
    </form>
  )
}

export function MasterDataCsvClientImportButton({
  onFile,
  disabled = false,
}: {
  disabled?: boolean
  onFile: (file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  return (
    <>
      <input
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled || pending}
        ref={inputRef}
        type="file"
        onChange={async (event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          if (!file) return
          setPending(true)
          try {
            await onFile(file)
            input.value = ""
          } finally {
            setPending(false)
          }
        }}
      />
      <Button
        disabled={disabled || pending}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {pending ? "Importing CSV..." : "Upload CSV"}
      </Button>
    </>
  )
}
