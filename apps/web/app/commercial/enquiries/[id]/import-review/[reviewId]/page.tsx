import Link from "next/link"

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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { applyEnquiryImportReviewAction } from "../../../actions"

export const dynamic = "force-dynamic"

function decisions(row: {
  matchedEnquiryItemId: string | null
  matchedProductId: string | null
  matchedQuoteItemId: string | null
  status: string
}) {
  if (row.status === "Missing Information") {
    return ["Skip", "Ask Sales", "Add New Line"]
  }
  if (row.matchedQuoteItemId || row.matchedProductId) {
    return [
      "Commercial Requote",
      "Technical Revision",
      "Ask Sales",
      "Add New Line",
      "Skip",
    ]
  }
  if (row.matchedEnquiryItemId) {
    return [
      "Link to existing work",
      "Technical Revision",
      "Ask Sales",
      "Add New Line",
      "Skip",
    ]
  }
  return ["Ask Sales", "Add New Line", "Skip"]
}

export default async function EnquiryImportReviewPage({
  params,
}: {
  params: Promise<{ id: string; reviewId: string }>
}) {
  const { id, reviewId } = await params
  await requireCapability(
    "pricing.enquiries.read",
    `/commercial/enquiries/${id}/import-review/${reviewId}`
  )
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const review = await workflow
    .getImportReview(reviewId)
    .finally(() => workflow.close())
  if (review.enquiryId !== id) {
    throw new Error("Import review does not belong to this enquiry.")
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <Link href={`/commercial/enquiries/${id}`}>Back To Enquiry</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Import Review
          </h2>
          <Badge variant="secondary">{review.status}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Classification Is Read-Only. Every Nonblank Source Row Requires An
          Explicit Sales Decision Before The Import Is Applied.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Classified Rows</CardTitle>
          <CardDescription>
            Exact Quoted Matches, In-Progress Work, Possible Codes, Description
            Matches, And New Lines Follow The Recovered Precedence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={applyEnquiryImportReviewAction}>
            <input type="hidden" name="enquiry_id" value={id} />
            <input type="hidden" name="review_id" value={review.id} />
            <input
              type="hidden"
              name="row_numbers"
              value={JSON.stringify(review.rows.map((row) => row.rowNumber))}
            />
            <FieldGroup>
              <div className="overflow-hidden rounded-3xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead className="min-w-64">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {review.rows.map((row) => {
                      const options = decisions(row)
                      const suggested = options.includes(
                        row.suggestedAction ?? ""
                      )
                        ? row.suggestedAction!
                        : options[0]!
                      return (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>
                            {String(row.rawValues.part ?? "") || "—"}
                          </TableCell>
                          <TableCell>
                            {String(row.rawValues.description ?? "") || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                            {row.matchNote || "No matching evidence"}
                          </TableCell>
                          <TableCell>
                            <Field>
                              <FieldLabel
                                className="sr-only"
                                htmlFor={`decision-${row.rowNumber}`}
                              >
                                Decision For Row {row.rowNumber}
                              </FieldLabel>
                              <NativeSelect
                                id={`decision-${row.rowNumber}`}
                                name={`action_${row.rowNumber}`}
                                defaultValue={suggested}
                                disabled={review.status !== "Pending"}
                                required
                              >
                                {options.map((option) => (
                                  <NativeSelectOption
                                    key={option}
                                    value={option}
                                  >
                                    {option}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </Field>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {review.status === "Pending" ? (
                <Button className="w-fit" type="submit">
                  Apply Reviewed Decisions
                </Button>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
