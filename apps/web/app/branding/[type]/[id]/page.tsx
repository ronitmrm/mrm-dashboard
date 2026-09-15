import { BrandingBookContent } from "@/components/branding/book-content"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"
import {
  revisionLabel,
  brandingStepNumber,
  brandingLanguageLabels,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  PageHeader,
  FormSection,
  ActionToolbar,
} from "@/components/ui/golden-patterns"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { BrandingDocumentEditor } from "@/components/branding/document-editor"
import { BrandingIssueControls } from "@/components/branding/issue-controls"
import { brandingType, withBranding } from "@/lib/branding/server"
import { brandingCapability } from "@/lib/auth/branding-capabilities"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"

export const maxDuration = 60

export default async function BrandingDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>
  searchParams: Promise<{ revision?: string }>
}) {
  const { type: rawType, id } = await params
  const type = brandingType(rawType)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { document, canWrite } = await withBranding(
    type,
    "read",
    async ({ repository, organizationId, userId }) => ({
      document: await repository.get(organizationId, type, id),
      canWrite:
        (
          await listGrantedCapabilities(userId, [
            brandingCapability(type, "write"),
          ])
        ).length > 0,
    })
  )
  if (!document?.revisions.length) notFound()
  const availableRevisions = document.revisions.filter(
    (revision) =>
      (type !== "notice" && type !== "work-instruction") ||
      !document.number ||
      revision.state === "issued"
  )
  const selectedId = (await searchParams).revision
  const selected = selectedId
    ? availableRevisions.find((revision) => revision.id === selectedId)
    : availableRevisions[0]
  if (!selected) notFound()
  const draft = availableRevisions.find(
    (revision) => revision.state === "draft"
  )
  const reference = `${document.number ?? "Number assigned on first issue"}${type === "notice" || type === "work-instruction" ? "" : ` · ${revisionLabel(selected.revision)}`}`
  const fileName = `${document.number ?? "Draft"}${type === "notice" || type === "work-instruction" ? "" : `-${revisionLabel(selected.revision)}`}.pdf`
  const pdfHref =
    selected.state === "issued"
      ? `/branding/${type}/${id}/revisions/${selected.id}/pdf`
      : `/branding/${type}/${id}/preview`
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title={selected.content.title}
        icon={FileText}
        description={reference}
        badge={
          <StatusBadge
            tone={selected.state === "issued" ? "positive" : "neutral"}
            value={selected.state === "issued" ? "Issued" : "Draft"}
          />
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/branding/${type}`}>
                <ArrowLeft aria-hidden="true" />
                Back to Records
              </Link>
            </Button>
            {selected.content.translations.length ? (
              <Button variant="outline" asChild>
                <AttachmentViewerLink
                  href={pdfHref}
                  fileName={fileName}
                  mediaType="application/pdf"
                >
                  {selected.state === "draft" ? "Preview PDF" : "Open PDF"}
                </AttachmentViewerLink>
              </Button>
            ) : null}
            {canWrite &&
            !draft &&
            type !== "notice" &&
            type !== "work-instruction" ? (
              <BrandingIssueControls
                type={type}
                documentId={id}
                draft={draft}
              />
            ) : null}
          </>
        }
      />
      <Tabs
        key={`${selected.id}:${selected.version}`}
        defaultValue="content"
        className="min-w-0"
      >
        <TabsList>
          {selected.state === "draft" && canWrite ? (
            <TabsTrigger value="edit">Data Entry</TabsTrigger>
          ) : null}
          <TabsTrigger value="content">Saved Content</TabsTrigger>
          {(type !== "notice" && type !== "work-instruction") ||
          document.revisions.filter((revision) => revision.state === "issued")
            .length > 1 ? (
            <TabsTrigger value="history">
              {type === "notice" || type === "work-instruction"
                ? "Earlier PDFs"
                : "Revision History"}
            </TabsTrigger>
          ) : null}
        </TabsList>
        {selected.state === "draft" && canWrite ? (
          <TabsContent value="edit">
            <p className="mb-4 text-sm text-muted-foreground">
              Save changes before previewing or issuing. Issue PDF freezes the
              saved document.
            </p>
            <BrandingDocumentEditor
              key={`${selected.id}:${selected.version}`}
              type={type}
              documentId={id}
              version={selected.version}
              initial={selected.content}
            />
          </TabsContent>
        ) : null}
        <TabsContent value="content" className="grid gap-4">
          {canWrite && draft?.id === selected.id ? (
            <ActionToolbar>
              <span className="text-sm text-muted-foreground">
                Issue this saved document after reviewing its text and PDF.
              </span>
              <BrandingIssueControls
                type={type}
                documentId={id}
                draft={draft}
              />
            </ActionToolbar>
          ) : null}
          <FormSection title="Document details">
            <p>
              {selected.content.department} · Effective{" "}
              {selected.content.effectiveDate || "date pending"} ·{" "}
              {selected.authorName}
            </p>
            {selected.content.changeReason ? (
              <p className="mt-2 whitespace-pre-wrap">
                {selected.content.changeReason}
              </p>
            ) : null}
          </FormSection>
          {selected.content.translations.map((translation) => (
            <FormSection
              key={translation.language}
              title={
                type === "notice"
                  ? `Body · ${brandingLanguageLabels[translation.language]}`
                  : translation.title
              }
            >
              <div lang={translation.language} className="grid gap-4">
                {type === "sop" || type === "policy" ? (
                  <BrandingBookContent translation={translation} />
                ) : (
                  translation.sections.map((section, index) => (
                    <section key={index}>
                      {section.layout === "visual-guide" ? (
                        <p className="mb-2 text-sm font-medium">
                          {section.assessment === "bad"
                            ? "Bad · fixed red cross"
                            : "Good · fixed green tick"}
                        </p>
                      ) : section.layout && section.layout !== "text" ? (
                        <p className="mb-2 text-sm font-medium">
                          Step{" "}
                          {brandingStepNumber(translation.language, index + 1)}
                        </p>
                      ) : null}
                      {section.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Bounded private document picture.
                        <img
                          src={section.picture}
                          alt={
                            section.heading ||
                            `Picture for step ${brandingStepNumber(translation.language, index + 1)}`
                          }
                          className="mb-2 max-h-64 max-w-full rounded-md border object-contain"
                        />
                      ) : null}
                      {section.heading ? (
                        <h3 className="mb-2 font-semibold">
                          {section.heading}
                        </h3>
                      ) : null}
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {section.body}
                      </p>
                    </section>
                  ))
                )}
              </div>
            </FormSection>
          ))}
          {type !== "notice" ? (
            <FormSection title="Original inputs">
              <dl className="grid gap-3">
                {Object.entries(selected.content.inputs).map(
                  ([field, value]) => (
                    <div key={field}>
                      <dt className="text-sm font-medium">{field}</dt>
                      <dd className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                        {value || "—"}
                      </dd>
                    </div>
                  )
                )}
              </dl>
            </FormSection>
          ) : null}
        </TabsContent>
        <TabsContent value="history">
          <OperationalTable
            filterStorageKey={`branding:${id}:revisions`}
            containerClassName="max-h-[60vh] rounded-lg border"
            toolbarStart={
              <span className="text-sm font-medium">
                {type === "notice" || type === "work-instruction"
                  ? "Retained PDFs from earlier issues"
                  : "Revision history"}
              </span>
            }
          >
            <TableHeader>
              <TableRow>
                {[
                  ...(type === "notice" || type === "work-instruction"
                    ? []
                    : ["Revision"]),
                  "Name",
                  "Status",
                  "Author",
                  "Issued",
                  "Change reason",
                  "PDF",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.revisions
                .filter(
                  (revision) =>
                    (type !== "notice" && type !== "work-instruction") ||
                    revision.state === "issued"
                )
                .map((revision) => (
                  <TableRow key={revision.id}>
                    {type !== "notice" && type !== "work-instruction" ? (
                      <TableCell>{revisionLabel(revision.revision)}</TableCell>
                    ) : null}
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/branding/${type}/${id}?revision=${revision.id}`}
                      >
                        {revision.content.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={revision.state === "issued" ? "Issued" : "Draft"}
                        tone={
                          revision.state === "issued" ? "positive" : "neutral"
                        }
                      />
                    </TableCell>
                    <TableCell>{revision.authorName}</TableCell>
                    <TableCell>
                      {revision.issuedAt?.slice(0, 10) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-pre-wrap">
                      {revision.content.changeReason || "Initial issue"}
                    </TableCell>
                    <TableCell>
                      {revision.state === "issued" ? (
                        <AttachmentViewerLink
                          className="text-primary hover:underline"
                          href={`/branding/${type}/${id}/revisions/${revision.id}/pdf`}
                          fileName={`${document.number}-${revisionLabel(revision.revision)}.pdf`}
                          mediaType="application/pdf"
                        >
                          Open PDF
                        </AttachmentViewerLink>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </OperationalTable>
        </TabsContent>
      </Tabs>
    </div>
  )
}
