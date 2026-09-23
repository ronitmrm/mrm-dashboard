import Link from "next/link"
import { Palette } from "lucide-react"
import { brandingTypeLabels } from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { BrandingDocumentTable } from "@/components/branding/document-table"
import { BrandingDocumentEditor } from "@/components/branding/document-editor"
import { ControlledDocumentEditor } from "@/components/branding/controlled-document-editor"
import {
  PageHeader,
  ActionToolbar,
  MetricSummary,
} from "@/components/ui/golden-patterns"
import { brandingType, withBranding } from "@/lib/branding/server"
import { brandingCapability } from "@/lib/auth/branding-capabilities"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { isoDocumentCapabilities } from "@/lib/auth/iso-document-capabilities"

export default async function BrandingRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const type = brandingType((await params).type)
  const requestedPage = Number((await searchParams).page ?? 1)
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1
  const { register, canWrite } = await withBranding(
    type,
    "read",
    async ({ repository, organizationId, userId }) => ({
      register: await repository.list(organizationId, type, page),
      canWrite:
        (
          await listGrantedCapabilities(userId, [
            brandingCapability(type, "write"),
            isoDocumentCapabilities.manage,
          ])
        ).length === 2,
    })
  )
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title={brandingTypeLabels[type]}
        icon={Palette}
        description={
          type === "controlled-document"
            ? "Upload prepared PDFs, release documents and retain every revision."
            : type === "notice"
              ? `Create and issue branded ${brandingTypeLabels[type].toLowerCase()}.`
              : "Create branded documents and retain every issued revision."
        }
      />
      <MetricSummary
        scope={`All ${brandingTypeLabels[type].toLowerCase()} · across all pages, before table filters`}
        items={[
          {
            label: `Total ${brandingTypeLabels[type]}`,
            value: register.summary.total,
            tone: "information",
          },
          {
            label: "Issued",
            value: register.summary.issued,
            tone: "positive",
            description: "Documents issued at least once",
          },
          {
            label: "Drafts",
            value: register.summary.drafts,
            tone: "warning",
            description: "Awaiting first issue",
          },
          ...(type === "notice"
            ? []
            : [
                {
                  label: "Revisions in progress",
                  value: register.summary.revisionsInProgress,
                  tone: "information" as const,
                  description: "Issued documents with an open draft",
                },
              ]),
        ]}
      />
      <Tabs defaultValue="records" className="min-w-0">
        <TabsList>
          {canWrite ? (
            <TabsTrigger value="entry">Data Entry</TabsTrigger>
          ) : null}
          <TabsTrigger value="records">View Records</TabsTrigger>
        </TabsList>
        {canWrite ? (
          <TabsContent value="entry">
            {type === "controlled-document" ? (
              <ControlledDocumentEditor />
            ) : (
              <BrandingDocumentEditor type={type} />
            )}
          </TabsContent>
        ) : null}
        <TabsContent value="records" className="grid min-w-0 gap-4">
          <BrandingDocumentTable rows={register.rows} type={type} />
          <ActionToolbar>
            <span className="text-xs text-muted-foreground">
              Page {page} · filters apply to these {register.rows.length}{" "}
              records
            </span>
            {page > 1 ? (
              <Button variant="outline" asChild>
                <Link href={`/branding/${type}?page=${page - 1}`}>
                  Previous
                </Link>
              </Button>
            ) : null}
            {register.hasNext ? (
              <Button variant="outline" asChild>
                <Link href={`/branding/${type}?page=${page + 1}`}>Next</Link>
              </Button>
            ) : null}
          </ActionToolbar>
        </TabsContent>
      </Tabs>
    </div>
  )
}
