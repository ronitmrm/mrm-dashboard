"use client"

import { useState, useTransition } from "react"
import { Copy, FileCode2, FilePlus2, Save } from "lucide-react"
import type { SavedEmailSignature } from "@workspace/db"

import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  deleteSignatureAction,
  saveSignatureAction,
} from "@/app/brand-kit/signature/actions"

import { FormSection } from "@/components/ui/golden-patterns"
import {
  buildSignature,
  mailApps,
  type MailApp,
  type SignatureDetails,
} from "@/lib/brand-kit/signature"
import { formatIstDateTime } from "@/lib/date-time"

const fields = [
  { key: "name", label: "Name" },
  { key: "designation", label: "Designation", placeholder: "Manufacturing Lead" },
  { key: "phone", label: "Phone", placeholder: "(+91) 94279 44311" },
  { key: "email", label: "Email", type: "email" },
  { key: "linkedin", label: "LinkedIn Link (optional)", placeholder: "https://www.linkedin.com/in/…", type: "url" },
  { key: "website", label: "Website" },
  { key: "company", label: "Company Name", help: "Shown in the text-only signature." },
  { key: "imageHost", label: "Picture Address", help: "Public web address the logo, icons and banner load from. Change only if pictures do not show for people you email.", type: "url" },
] as const satisfies readonly {
  key: keyof SignatureDetails
  label: string
  placeholder?: string
  help?: string
  type?: string
}[]

const asMailApp = (value: string): MailApp =>
  value in mailApps ? (value as MailApp) : "outlook"

export function SignatureGenerator({
  canSave,
  defaults,
  saved,
}: {
  canSave: boolean
  defaults: SignatureDetails
  saved: readonly SavedEmailSignature[]
}) {
  const [details, setDetails] = useState(defaults)
  const [app, setApp] = useState<MailApp>("outlook")
  const [status, setStatus] = useState("")
  const [editingId, setEditingId] = useState<string>()
  const [pending, startTransition] = useTransition()
  const editing = saved.find((row) => row.id === editingId)

  function startNew() {
    setDetails(defaults)
    setApp("outlook")
    setEditingId(undefined)
    setStatus("")
  }

  function open(row: SavedEmailSignature) {
    const { mailApp, ...fields } = row.fields
    setDetails(fields)
    setApp(asMailApp(mailApp))
    setEditingId(row.id)
    setStatus(`Opened ${fields.name}. Changes are saved to this signature.`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function save() {
    if (!details.name.trim()) {
      setStatus("Enter a name before saving.")
      return
    }
    startTransition(async () => {
      try {
        const id = await saveSignatureAction({ id: editingId, details, mailApp: app })
        setEditingId(id)
        setStatus(editingId ? "Signature updated." : "Signature saved.")
      } catch {
        setStatus("Could not save the signature. Please try again.")
      }
    })
  }

  function remove(row: SavedEmailSignature) {
    if (!window.confirm(`Delete the saved signature for ${row.fields.name}?`)) return
    startTransition(async () => {
      try {
        await deleteSignatureAction(row.id)
        if (row.id === editingId) startNew()
        setStatus(`Deleted ${row.fields.name}.`)
      } catch {
        setStatus("Could not delete the signature. Please try again.")
      }
    })
  }

  const signature = buildSignature(details, app)
  const backup = signature.html ?? signature.text

  async function copySignature() {
    try {
      if (signature.html) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([signature.html], { type: "text/html" }),
            "text/plain": new Blob([signature.text], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(signature.text)
      }
      setStatus("Signature copied. Paste it into your mail app's signature settings.")
    } catch {
      setStatus("The browser blocked copying. Select the preview with your mouse and copy it.")
    }
  }

  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(backup)
      setStatus(signature.html ? "HTML copied." : "Text copied.")
    } catch {
      setStatus("The browser blocked copying. Select the backup text and copy it.")
    }
  }

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <FormSection
        description={
          editing
            ? `Editing the saved signature for ${editing.fields.name}.`
            : "Every detail can be changed. The preview updates as you type."
        }
        title={editing ? "Edit Saved Signature" : "New Signature"}
        width="compact"
      >
        <div className="grid gap-4">
          {fields.map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`signature-${field.key}`}>{field.label}</FieldLabel>
              <Input
                id={`signature-${field.key}`}
                onChange={(event) => {
                  const value = event.target.value
                  setDetails((current) => ({ ...current, [field.key]: value }))
                  setStatus("")
                }}
                placeholder={"placeholder" in field ? field.placeholder : undefined}
                type={"type" in field ? field.type : "text"}
                value={details[field.key]}
              />
              {"help" in field ? <FieldDescription>{field.help}</FieldDescription> : null}
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="signature-mail-app">Mail App</FieldLabel>
            <NativeSelect
              id="signature-mail-app"
              onChange={(event) => {
                setApp(event.target.value as MailApp)
                setStatus("")
              }}
              value={app}
            >
              {Object.entries(mailApps).map(([value, { label }]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>{mailApps[app].help}</FieldDescription>
          </Field>
        </div>
      </FormSection>

      <div className="grid min-w-0 gap-6">
        <SectionCard size="sm">
          <CardHeader className="border-b">
            <CardTitle>Signature Preview</CardTitle>
            <CardDescription>This is exactly what gets copied.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="overflow-x-auto rounded-md border bg-white p-4 text-black">
              {signature.html ? (
                <div dangerouslySetInnerHTML={{ __html: signature.html }} />
              ) : (
                <pre className="m-0 font-[Verdana,Arial,sans-serif] text-[13px] leading-relaxed whitespace-pre-wrap">
                  {signature.text}
                </pre>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={copySignature} type="button">
                <Copy aria-hidden="true" /> Copy Signature
              </Button>
              <Button onClick={copyBackup} type="button" variant="outline">
                <FileCode2 aria-hidden="true" />{" "}
                {signature.html ? "Copy HTML" : "Copy Text"}
              </Button>
              {canSave ? (
                <>
                  <Button disabled={pending} onClick={save} type="button" variant="outline">
                    <Save aria-hidden="true" /> {editing ? "Update Signature" : "Save Signature"}
                  </Button>
                  {editing ? (
                    <Button disabled={pending} onClick={startNew} type="button" variant="ghost">
                      <FilePlus2 aria-hidden="true" /> New Signature
                    </Button>
                  ) : null}
                </>
              ) : null}
              <p aria-live="polite" className="text-sm font-medium text-primary">
                {status}
              </p>
            </div>
          </CardContent>
        </SectionCard>

        <SectionCard size="sm">
          <CardHeader className="border-b">
            <CardTitle>{signature.html ? "HTML Backup" : "Text Backup"}</CardTitle>
            <CardDescription>
              Use this only if pasting the preview does not work in your mail app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              aria-label="Signature backup"
              className="h-44 font-mono text-xs"
              readOnly
              value={backup}
            />
          </CardContent>
        </SectionCard>
      </div>

      <SectionCard className="xl:col-span-2" size="sm">
        <CardHeader className="border-b">
          <CardTitle>Saved Signatures</CardTitle>
          <CardDescription>
            Open a saved signature to copy it again or change it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalTable
            // The table's filters move rows in the DOM; redraw it when rows are added or removed.
            key={saved.map((row) => row.id).join()}
            containerClassName="max-h-[28rem] rounded-md border"
            filterStorageKey="brand-kit:saved-signatures"
            state={saved.length ? "ready" : "empty"}
            stateDescription="Saved signatures will appear here."
            stateTitle="No saved signatures yet"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Saved</TableHead>
                <TableHead>Saved By</TableHead>
                <TableHead data-filter-label="Actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saved.map((row) => (
                <TableRow data-state={row.id === editingId ? "selected" : undefined} key={row.id}>
                  <TableCell className="font-medium">{row.fields.name}</TableCell>
                  <TableCell>{row.fields.designation || "—"}</TableCell>
                  <TableCell>{row.fields.email || "—"}</TableCell>
                  <TableCell>{row.fields.phone || "—"}</TableCell>
                  <TableCell>{formatIstDateTime(row.updatedAt)}</TableCell>
                  <TableCell>{row.updatedByName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button onClick={() => open(row)} size="sm" type="button" variant="outline">
                        Open
                      </Button>
                      {canSave ? (
                        <Button
                          disabled={pending}
                          onClick={() => remove(row)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
