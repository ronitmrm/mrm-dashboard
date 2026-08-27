import Link from "next/link"
import { notFound } from "next/navigation"

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
import { TechnicalReviewForm } from "@/components/technical-review-form"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function TechnicalReviewItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  await requireCapability(
    "pricing.technical_review.read",
    `/commercial/technical-review/${itemId}`
  )
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const item = await workflow
    .getTechnicalReviewItem("MRMPL", itemId)
    .finally(() => workflow.close())
  if (!item) notFound()

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <Button asChild className="w-fit px-0" variant="link">
            <Link href="/commercial/technical-review">
              ← Back To Technical Review
            </Link>
          </Button>
          <h2 className="text-2xl font-semibold tracking-tight">
            {item.enquiryNumber} / Line {item.lineNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {item.customerUid} · {item.companyName} · {item.customerPartCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{item.technicalReviewStatus}</Badge>
          <Button asChild size="sm" variant="outline">
            <Link href={`/commercial/enquiries/${item.enquiryId}`}>
              Open Enquiry
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Focused Technical Review</CardTitle>
          <CardDescription>
            Complete This Line Without Other Queue Items On Screen. Released
            Lines Return To This Team&apos;s Queue And Become Available To
            Design.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TechnicalReviewForm item={item} />
        </CardContent>
      </Card>
    </div>
  )
}
