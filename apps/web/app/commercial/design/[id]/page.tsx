import type { ReactNode } from "react"

import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { technicalReviewChecklist } from "@/lib/pricing/technical-review"

import { startDesignWorkAction } from "../../enquiries/actions"

export const dynamic = "force-dynamic"

function display(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? "—" : value
}

function ReviewField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <Field className="gap-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="min-h-5 text-sm font-medium">{children}</div>
    </Field>
  )
}

export default async function DesignTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCapability("pricing.design.read", `/commercial/design/${id}`)
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const selectedItem = await workflow
    .getDesignTask("MRMPL", id)
    .finally(() => workflow.close())

  if (!selectedItem) notFound()
  if (selectedItem.portfolioMatchStatus === "New Quoted Part") {
    redirect(`/commercial/design/${id}/new`)
  }
  if (selectedItem.portfolioMatchStatus === "Matches Existing Portfolio") {
    redirect("/commercial/design")
  }

  const portfolioSearch =
    selectedItem.customerPartCode?.trim() || selectedItem.description

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit" size="sm" variant="ghost">
            <Link href="/commercial/design">Back To Design Tasks</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {selectedItem.enquiryNumber} / Line {selectedItem.lineNumber}
            </h2>
            <Badge variant="outline">
              {selectedItem.technicalReviewStatus}
            </Badge>
            <Badge variant="secondary">{selectedItem.designStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedItem.customerUid} · {selectedItem.companyName}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/commercial/enquiries/${selectedItem.enquiryId}`}>
            Open Enquiry
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Technical Review Details</CardTitle>
          <CardDescription>
            Review the complete released line before searching the portfolio or
            opening the Design form.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <FieldSet>
            <FieldLegend>Enquiry Line</FieldLegend>
            <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
              <ReviewField label="Customer Part">
                {display(selectedItem.customerPartCode)}
              </ReviewField>
              <ReviewField label="Description">
                {selectedItem.description}
              </ReviewField>
              <ReviewField label="Quantity">
                {display(selectedItem.quantity)}
              </ReviewField>
              <ReviewField label="Grade">
                {display(selectedItem.grade)}
              </ReviewField>
              <ReviewField label="Target Price">
                {display(selectedItem.targetPrice)}
              </ReviewField>
              <ReviewField label="Drawing Reference">
                {display(selectedItem.drawingReference)}
              </ReviewField>
              <ReviewField label="Delivery Terms">
                {display(selectedItem.deliveryTerms)}
              </ReviewField>
              <ReviewField label="Payment Terms">
                {display(selectedItem.paymentTerms)}
              </ReviewField>
              <ReviewField label="Line Remarks">
                {display(selectedItem.lineRemarks)}
              </ReviewField>
              <ReviewField label="Enquiry Remarks">
                {display(selectedItem.enquiryRemarks)}
              </ReviewField>
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Technical Checklist</FieldLegend>
            <div className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-3">
              {technicalReviewChecklist.map(([key, label]) => (
                <Field
                  className="items-center"
                  key={key}
                  orientation="horizontal"
                >
                  <Checkbox
                    defaultChecked={Boolean(
                      selectedItem.technicalChecklist[key]
                    )}
                    disabled
                    id={`design-${selectedItem.enquiryItemId}-${key}`}
                  />
                  <FieldLabel
                    htmlFor={`design-${selectedItem.enquiryItemId}-${key}`}
                  >
                    {label}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Technical Review Result</FieldLegend>
            <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
              <ReviewField label="Review Status">
                <Badge variant="outline">
                  {selectedItem.technicalReviewStatus}
                </Badge>
              </ReviewField>
              <ReviewField label="Reviewed Grade">
                {display(selectedItem.grade)}
              </ReviewField>
              <ReviewField label="Missing Information">
                {display(selectedItem.missingInformation)}
              </ReviewField>
              <ReviewField label="Feasibility Reason">
                {display(selectedItem.feasibilityReason)}
              </ReviewField>
              <div className="md:col-span-2 xl:col-span-4">
                <ReviewField label="Technical Remarks">
                  {display(selectedItem.technicalRemarks)}
                </ReviewField>
              </div>
            </div>
          </FieldSet>

          {selectedItem.latestClarificationMessage ? (
            <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
              <p className="font-medium">
                {selectedItem.latestClarificationSource ?? "Clarification"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {selectedItem.latestClarificationMessage}
              </p>
            </div>
          ) : null}

          {selectedItem.customerDrawingFileName ? (
            <Button asChild className="w-fit" size="sm" variant="outline">
              <Link
                href={`/commercial/enquiry-items/${selectedItem.enquiryItemId}/drawing`}
                target="_blank"
              >
                Open Customer Drawing
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Choose Next Step</CardTitle>
          <CardDescription>
            Search the Current Portfolio in its own page, or proceed to the
            separate Design form for this part.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link
              href={{
                pathname: "/commercial/products",
                query: { q: portfolioSearch },
              }}
            >
              Search Part In Portfolio
            </Link>
          </Button>
          <form action={startDesignWorkAction}>
            <input
              name="enquiry_item_id"
              type="hidden"
              value={selectedItem.enquiryItemId}
            />
            <Button type="submit">Open Design Form</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
