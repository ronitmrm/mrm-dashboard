import { notFound } from "next/navigation"
import {
  brandingLanguageLabels,
  revisionLabel,
  type BrandingLanguage,
} from "@workspace/db/branding-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { PageHeader, MetricSummary } from "@/components/ui/golden-patterns"
import { withPublishedRegister } from "@/lib/branding/published-server"
import { publishedRegisterNavigation } from "@/lib/unified-navigation"

export default async function PublishedRegisterPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  const register = publishedRegisterNavigation.find(
    (item) => item.type === type
  )
  if (!register) notFound()
  const rows = await withPublishedRegister(
    register.type,
    ({ repository, organizationId }) =>
      repository.listPublished(organizationId, register.type)
  )
  const hasRevision = register.type !== "work-instruction"
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title={register.label}
        icon={register.icon}
        description="Latest published documents currently in use."
      />
      <MetricSummary
        scope="All published documents · before table filters"
        items={[
          {
            label: "Published documents",
            value: rows.length,
            tone: "positive",
          },
        ]}
      />
      <OperationalTable
        filterStorageKey={`published-register:${register.type}`}
        containerClassName="max-h-[65vh] rounded-lg border"
        toolbarStart={
          <span className="text-sm font-medium">{register.label}</span>
        }
      >
        <TableHeader>
          <TableRow>
            {[
              "Number",
              "Name",
              "Department",
              ...(type === "controlled-document" ? [] : ["Languages"]),
              ...(hasRevision ? ["Current revision"] : []),
              "Status",
              "Effective date",
              "Published date",
              "Author",
              "Document",
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.number}</TableCell>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell>{row.department}</TableCell>
                {type !== "controlled-document" ? (
                  <TableCell>
                    {row.languages
                      .map(
                        (language) =>
                          brandingLanguageLabels[language as BrandingLanguage]
                      )
                      .join(", ")}
                  </TableCell>
                ) : null}
                {hasRevision ? (
                  <TableCell>{revisionLabel(row.revision)}</TableCell>
                ) : null}
                <TableCell>
                  <StatusBadge tone="positive" value="Published" />
                </TableCell>
                <TableCell>{row.effectiveDate}</TableCell>
                <TableCell>{row.issuedAt.slice(0, 10)}</TableCell>
                <TableCell>{row.authorName}</TableCell>
                <TableCell>
                  <AttachmentViewerLink
                    className="text-primary hover:underline"
                    href={`/registers/${register.type}/${row.id}/pdf`}
                    fileName={`${row.number}${hasRevision ? `-${revisionLabel(row.revision)}` : ""}.pdf`}
                    mediaType="application/pdf"
                  >
                    View PDF
                  </AttachmentViewerLink>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={hasRevision && type !== "controlled-document" ? 10 : 9}
              >
                <StandardState
                  variant="empty"
                  title="No published documents"
                  description="Documents appear here after they are issued."
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
