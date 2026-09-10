import Link from "next/link"
import { notFound } from "next/navigation"
import { createCommercialCostingRepository } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@workspace/ui/components/table"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function QuoteDrawingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ revision?: string; draft?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  if (query.revision !== undefined && !/^\d+$/.test(query.revision)) notFound()
  const session = await requireCapability(
    "pricing.quotes.read",
    "/commercial/quotes"
  )
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const drawings = await (async () => {
    try {
      return await repository.getQuotationDrawings(id, session.user.id, {
        revision:
          query.revision === undefined ? undefined : Number(query.revision),
        draft: query.draft === "true",
      })
    } catch (error) {
      if (
        error instanceof Error &&
        ["Enquiry was not found.", "Quote revision was not found."].includes(
          error.message
        )
      )
        notFound()
      throw error
    } finally {
      await repository.close()
    }
  })()
  const suffix =
    query.revision !== undefined
      ? `?revision=${query.revision}`
      : query.draft === "true"
        ? "?draft=true"
        : ""
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Customer Drawings"
        description="Drawings accompanying this quote. Open a drawing to preview or download its original file."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link
                href={`/commercial/enquiries/${id}${query.revision === undefined ? "" : `?revision=${query.revision}`}`}
              >
                Open Enquiry
              </Link>
            </Button>
            <Button asChild variant="outline">
              <AttachmentViewerLink
                fileName="quote.pdf"
                mediaType="application/pdf"
                href={`/commercial/quotes/enquiry/${id}/pdf${suffix}`}
              >
                Open Quote PDF
              </AttachmentViewerLink>
            </Button>
          </div>
        }
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Quote Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <OperationalTable state={drawings.length ? "ready" : "empty"}
            stateTitle="No drawings attached"
            stateDescription="This quotation has no available customer drawings.">
            <TableHeader>
              <TableRow>
                <TableHead>Part / Line</TableHead>
                <TableHead>Drawing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drawings.map((drawing) => (
                <TableRow key={`${drawing.enquiryItemId}-${drawing.fileId}`}>
                  <TableCell>{drawing.lineNumber}</TableCell>
                  <TableCell>
                    <AttachmentViewerLink
                      fileName={drawing.fileName}
                      mediaType={drawing.mediaType ?? undefined}
                      href={`/commercial/quotes/enquiry/${id}/drawings/${drawing.fileId}${suffix}`}
                    />
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
