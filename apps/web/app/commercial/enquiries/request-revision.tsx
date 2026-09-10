"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { requestEnquiryRevisionAction } from "./actions"

export function RequestRevision({
  enquiryId,
  lines,
  disabled,
}: {
  enquiryId: string
  lines: Array<{ id: string; lineNumber: number; description: string }>
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState("Terms")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        Request Revision
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <StandardDialogContent
          title="Request Revision"
          description="Keep this enquiry and retain previous quotations. Enter the customer's requested changes."
        >
          <form
            className="grid gap-4"
            action={async (data) => {
              setPending(true)
              setError(null)
              try {
                const result = await requestEnquiryRevisionAction(data)
                if (result.error) setError(result.error)
                else {
                  setOpen(false)
                  router.refresh()
                }
              } finally {
                setPending(false)
              }
            }}
          >
            <input type="hidden" name="enquiry_id" value={enquiryId} />
            <Field>
              <FieldLabel htmlFor="revision-kind">Revision Type</FieldLabel>
              <NativeSelect
                id="revision-kind"
                name="revision_kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <NativeSelectOption value="Terms">
                  Terms only — Sales
                </NativeSelectOption>
                <NativeSelectOption value="Pricing">
                  Pricing — Customer Costing
                </NativeSelectOption>
                <NativeSelectOption value="Technical">
                  Technical — Design and Costing
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <p className="text-sm text-muted-foreground">
              {kind === "Terms"
                ? "After requesting, update the enquiry terms to prepare a new PDF with the same prices. Incoterms, Packaging or Currency changes require Pricing."
                : kind === "Pricing"
                  ? "Selected lines return to Customer Costing. Update any pricing terms on the enquiry before costing begins."
                  : "Selected parts enter controlled Design revision, approval, Product Costing and Customer Costing."}
            </p>
            {kind !== "Terms" ? (
              <fieldset className="grid max-h-52 gap-2 overflow-auto">
                <legend className="mb-2 text-sm font-medium">
                  Affected Lines
                </legend>
                {lines.map((line) => (
                  <label
                    key={line.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="enquiry_item_id"
                      value={line.id}
                    />
                    <span>
                      Line {line.lineNumber}: {line.description}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <Field>
              <FieldLabel htmlFor="revision-reason">
                Customer&apos;s Requested Changes
              </FieldLabel>
              <Textarea id="revision-reason" name="reason" required />
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Requesting…" : "Request Revision"}
              </Button>
            </DialogFooter>
          </form>
        </StandardDialogContent>
      </Dialog>
    </>
  )
}
