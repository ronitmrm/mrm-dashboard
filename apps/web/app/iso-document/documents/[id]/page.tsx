import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"
import { revisionLabel } from "@workspace/db/branding-domain"
import {
  dataFrequencyLabels,
  documentTypeLabels,
} from "@workspace/db/document-control-domain"
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
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { BrandingIssueControls } from "@/components/branding/issue-controls"
import { DocumentControlMetadataForm } from "@/components/iso-document/document-control-metadata-form"
import { MonitoringConfirmationForm } from "@/components/iso-document/monitoring-confirmation-form"
import {
  ActionToolbar,
  FormSection,
  PageHeader,
} from "@/components/ui/golden-patterns"
import { brandingCapability } from "@/lib/auth/branding-capabilities"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import {
  documentControlAccess,
  withDocumentControl,
} from "@/lib/iso-document/server"

function workflowLabel(value: string) {
  if (value === "pending-approval") return "Pending Approval"
  if (value === "approved") return "Approved"
  if (value === "released") return "Released"
  return "Draft"
}

function auditLabel(value: string) {
  return value
    .replace(/^document\./, "")
    .split(".")
    .map((part) => part.replace(/-/g, " "))
    .join(" · ")
}

function reviewState(input: {
  cycleMonths: number | null
  releasedAt: string | null
  lastCompletedAt: string | null
}) {
  if (!input.cycleMonths || !input.releasedAt)
    return { label: "Not Applicable", tone: "inactive" as const, due: "—" }
  const baseline = new Date(input.lastCompletedAt ?? input.releasedAt)
  const due = new Date(baseline)
  due.setUTCMonth(due.getUTCMonth() + input.cycleMonths)
  const overdue = due.getTime() < Date.now()
  return {
    label: overdue ? "Overdue" : input.lastCompletedAt ? "Completed" : "Due",
    tone: overdue
      ? ("danger" as const)
      : input.lastCompletedAt
        ? ("positive" as const)
        : ("warning" as const),
    due: due.toISOString().slice(0, 10),
  }
}

function dataRecordState(input: {
  frequencyType: string
  intervalDays: number | null
  releasedAt: string | null
  lastCompletedAt: string | null
}) {
  if (input.frequencyType === "not-applicable")
    return { label: "Not Applicable", tone: "inactive" as const, due: null }
  if (
    input.frequencyType === "scheduled-interval" &&
    input.intervalDays &&
    input.releasedAt
  ) {
    const baseline = new Date(input.lastCompletedAt ?? input.releasedAt)
    const due = new Date(baseline)
    due.setUTCDate(due.getUTCDate() + input.intervalDays)
    const overdue = due.getTime() < Date.now()
    return {
      label: overdue ? "Overdue" : input.lastCompletedAt ? "Completed" : "Due",
      tone: overdue
        ? ("danger" as const)
        : input.lastCompletedAt
          ? ("positive" as const)
          : ("warning" as const),
      due: due.toISOString().slice(0, 10),
    }
  }
  return input.lastCompletedAt
    ? { label: "Completed", tone: "positive" as const, due: null }
    : { label: "Due", tone: "warning" as const, due: null }
}

export default async function DocumentDossierPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const result = await withDocumentControl(
    "read",
    async ({ repository, organizationId, userId }) => {
      const dossier = await repository.getControlDossier(organizationId, id)
      if (!dossier) return null
      const access = await documentControlAccess(userId)
      const granted = new Set(
        await listGrantedCapabilities(userId, [
          brandingCapability(dossier.type, "read"),
        ])
      )
      const draft = dossier.revisions.find(
        (revision) => revision.state === "draft"
      )
      const departments = access.canApprove
        ? await repository.approvalDepartments({ organizationId, userId })
        : []
      const canApproveHere =
        access.canApprove &&
        Boolean(
          draft &&
          (departments === null ||
            departments.some(
              (department) =>
                department.localeCompare(draft.content.department, undefined, {
                  sensitivity: "accent",
                }) === 0
            ))
        )
      return {
        dossier,
        access: { ...access, canApprove: canApproveHere },
        canViewContent:
          dossier.contentAccess === "all-signed-in" ||
          granted.has(brandingCapability(dossier.type, "read")) ||
          access.canManage ||
          access.canRelease ||
          canApproveHere,
      }
    }
  )
  if (!result) notFound()
  const { dossier, access, canViewContent } = result
  const draft = dossier.revisions.find((revision) => revision.state === "draft")
  const released = dossier.revisions.filter(
    (revision) => revision.state === "issued"
  )
  const current = released[0]
  const display = current ?? draft
  if (!display) notFound()
  const lastReview = dossier.monitoring.find(
    ({ obligationType }) => obligationType === "document-review"
  )
  const lastDataConfirmation = dossier.monitoring.find(
    ({ obligationType }) => obligationType === "data-record"
  )
  const review = reviewState({
    cycleMonths: dossier.reviewCycleMonths,
    releasedAt: current?.issuedAt ?? null,
    lastCompletedAt: lastReview?.completedAt ?? null,
  })
  const dataState = dataRecordState({
    frequencyType: dossier.dataFrequencyType,
    intervalDays: dossier.dataFrequencyIntervalDays,
    releasedAt: current?.issuedAt ?? null,
    lastCompletedAt: lastDataConfirmation?.completedAt ?? null,
  })
  const draftControl = draft
    ? {
        id: draft.id,
        version: draft.version,
        workflowState: draft.workflowState,
      }
    : undefined
  const controlMetadata = {
    contentAccess: dossier.contentAccess,
    dataFrequencyDetail: dossier.dataFrequencyDetail,
    dataFrequencyIntervalDays: dossier.dataFrequencyIntervalDays,
    dataFrequencyType: dossier.dataFrequencyType,
    dataRetention: dossier.dataRetention,
    documentType: dossier.documentType,
    metadataVersion: dossier.metadataVersion,
    recordLocations: dossier.recordLocations,
    responsibleRole: dossier.responsibleRole,
    reviewCycleMonths: dossier.reviewCycleMonths,
    useStatus: dossier.useStatus,
  }
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title={display.content.title}
        icon={FileText}
        description={`${dossier.number ?? `Draft ${dossier.id.slice(0, 8).toUpperCase()}`} · ${documentTypeLabels[dossier.documentType]}`}
        badge={
          <StatusBadge
            tone={dossier.useStatus === "in-use" ? "positive" : "inactive"}
            value={dossier.useStatus === "in-use" ? "In Use" : "Not In Use"}
          />
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/iso-document/documents">
                <ArrowLeft aria-hidden="true" />
                Back to Master List
              </Link>
            </Button>
            {current && canViewContent ? (
              <Button asChild variant="outline">
                <AttachmentViewerLink
                  fileName={`${dossier.number}-${revisionLabel(current.revision)}.pdf`}
                  href={`/branding/${dossier.type}/${dossier.id}/revisions/${current.id}/pdf`}
                  mediaType="application/pdf"
                >
                  Open Current Document
                </AttachmentViewerLink>
              </Button>
            ) : null}
          </>
        }
      />
      {draft ? (
        <ActionToolbar>
          <div className="grid gap-1">
            <span className="text-sm font-medium">
              Revision {revisionLabel(draft.revision)} ·{" "}
              {workflowLabel(draft.workflowState)}
            </span>
            <span className="text-xs text-muted-foreground">
              The current released revision remains effective until QA final
              release.
            </span>
          </div>
          {canViewContent ? (
            <Button asChild variant="outline">
              <AttachmentViewerLink
                fileName={`Draft-${revisionLabel(draft.revision)}.pdf`}
                href={`/branding/${dossier.type}/${dossier.id}/preview`}
                mediaType="application/pdf"
              >
                Review Draft PDF
              </AttachmentViewerLink>
            </Button>
          ) : null}
          <BrandingIssueControls
            type={dossier.type}
            documentId={dossier.id}
            draft={draftControl}
            canManage={access.canManage}
            canApprove={access.canApprove}
            canRelease={access.canRelease}
          />
        </ActionToolbar>
      ) : access.canManage && current ? (
        <ActionToolbar>
          <span className="text-sm text-muted-foreground">
            Create the next revision without changing the current release.
          </span>
          <BrandingIssueControls
            type={dossier.type}
            documentId={dossier.id}
            canManage={access.canManage}
          />
        </ActionToolbar>
      ) : null}
      <Tabs defaultValue="overview" className="min-w-0">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {access.canManage ? (
            <TabsTrigger value="control">Control Details</TabsTrigger>
          ) : null}
          <TabsTrigger value="revisions">Revisions</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="audit">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4">
          <FormSection title="Document information">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                [
                  "Document number",
                  dossier.number ?? "Assigned at final release",
                ],
                ["Department", display.content.department],
                ["Responsible role", dossier.responsibleRole || "—"],
                [
                  "Current revision",
                  current ? revisionLabel(current.revision) : "Not released",
                ],
                ["Last revision date", current?.issuedAt?.slice(0, 10) ?? "—"],
                [
                  "Content access",
                  dossier.contentAccess === "all-signed-in"
                    ? "All signed-in users"
                    : "Restricted",
                ],
                [
                  "Document review cycle",
                  dossier.reviewCycleMonths
                    ? `${dossier.reviewCycleMonths} months`
                    : "Not applicable",
                ],
                [
                  "Data / record frequency",
                  `${dataFrequencyLabels[dossier.dataFrequencyType]}${dossier.dataFrequencyIntervalDays ? ` · every ${dossier.dataFrequencyIntervalDays} days` : dossier.dataFrequencyDetail ? ` · ${dossier.dataFrequencyDetail}` : ""}`,
                ],
                ["Generated data retention", dossier.dataRetention || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-medium">{label}</dt>
                  <dd className="text-sm text-muted-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </FormSection>
          <FormSection title="Record locations">
            {dossier.recordLocations.length ? (
              <ul className="grid gap-2 text-sm">
                {dossier.recordLocations.map((location, index) => (
                  <li key={`${location.kind}:${location.label}:${index}`}>
                    <span className="font-medium">{location.label}</span>{" "}
                    <span className="text-muted-foreground">
                      ({location.kind})
                    </span>{" "}
                    {location.href ? (
                      <Link
                        className="text-primary hover:underline"
                        href={location.href}
                      >
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No generated record location applies.
              </p>
            )}
          </FormSection>
        </TabsContent>
        {access.canManage ? (
          <TabsContent value="control">
            <DocumentControlMetadataForm
              documentId={dossier.id}
              initial={controlMetadata}
            />
          </TabsContent>
        ) : null}
        <TabsContent value="revisions">
          <OperationalTable
            filterStorageKey={`iso-document:${dossier.id}:revisions`}
            containerClassName="max-h-[60vh] rounded-lg border"
            toolbarStart={
              <span className="text-sm font-medium">
                Permanent revision history
              </span>
            }
          >
            <TableHeader>
              <TableRow>
                {[
                  "Revision",
                  "Status",
                  "Revision date",
                  "Author",
                  "Change reason",
                  "Document",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.revisions.map((revision) => {
                const status =
                  revision.state === "draft"
                    ? workflowLabel(revision.workflowState)
                    : revision.id === current?.id
                      ? "Released"
                      : "Superseded"
                return (
                  <TableRow key={revision.id}>
                    <TableCell>{revisionLabel(revision.revision)}</TableCell>
                    <TableCell>
                      <StatusBadge value={status} />
                    </TableCell>
                    <TableCell>
                      {revision.issuedAt?.slice(0, 10) ?? "—"}
                    </TableCell>
                    <TableCell>{revision.authorName}</TableCell>
                    <TableCell className="max-w-96 whitespace-pre-wrap">
                      {revision.content.changeReason || "Initial release"}
                    </TableCell>
                    <TableCell>
                      {canViewContent && revision.state === "issued" ? (
                        <AttachmentViewerLink
                          className="text-primary hover:underline"
                          fileName={`${dossier.number}-${revisionLabel(revision.revision)}.pdf`}
                          href={`/branding/${dossier.type}/${dossier.id}/revisions/${revision.id}/pdf`}
                          mediaType="application/pdf"
                        >
                          Open PDF
                        </AttachmentViewerLink>
                      ) : canViewContent && revision.state === "draft" ? (
                        <AttachmentViewerLink
                          className="text-primary hover:underline"
                          fileName={`Draft-${revisionLabel(revision.revision)}.pdf`}
                          href={`/branding/${dossier.type}/${dossier.id}/preview`}
                          mediaType="application/pdf"
                        >
                          Preview PDF
                        </AttachmentViewerLink>
                      ) : (
                        "Restricted"
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </OperationalTable>
        </TabsContent>
        <TabsContent value="monitoring" className="grid gap-4">
          <FormSection title="Current obligation state">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Document review</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge tone={review.tone} value={review.label} />
                  <span className="text-sm text-muted-foreground">
                    Next due {review.due}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Data / record activity</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge tone={dataState.tone} value={dataState.label} />
                  <span className="text-sm text-muted-foreground">
                    {dataState.due
                      ? `Next due ${dataState.due}`
                      : dataFrequencyLabels[dossier.dataFrequencyType]}
                  </span>
                </div>
              </div>
            </div>
          </FormSection>
          {access.canMonitor ? (
            <MonitoringConfirmationForm documentId={dossier.id} />
          ) : null}
          <OperationalTable
            filterStorageKey={`iso-document:${dossier.id}:monitoring`}
            containerClassName="max-h-[50vh] rounded-lg border"
            toolbarStart={
              <span className="text-sm font-medium">Completion history</span>
            }
          >
            <TableHeader>
              <TableRow>
                {[
                  "Obligation",
                  "Period / event",
                  "Completed",
                  "Completed by",
                  "Evidence",
                  "Remarks",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.monitoring.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.obligationType === "document-review"
                      ? "Document review"
                      : "Data / record activity"}
                  </TableCell>
                  <TableCell>{entry.periodLabel}</TableCell>
                  <TableCell>{entry.completedAt.slice(0, 10)}</TableCell>
                  <TableCell>{entry.completedByName}</TableCell>
                  <TableCell>{entry.evidenceLocation || "—"}</TableCell>
                  <TableCell>{entry.remarks || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        </TabsContent>
        <TabsContent value="audit">
          <OperationalTable
            filterStorageKey={`iso-document:${dossier.id}:transactions`}
            containerClassName="max-h-[60vh] rounded-lg border"
            toolbarStart={
              <span className="text-sm font-medium">
                Append-only transaction history
              </span>
            }
          >
            <TableHeader>
              <TableRow>
                {["Time", "Transaction", "Actor", "Remarks"].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.audit.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    {event.occurredAt.slice(0, 19).replace("T", " ")}
                  </TableCell>
                  <TableCell className="capitalize">
                    {auditLabel(event.eventType)}
                  </TableCell>
                  <TableCell>{event.actorName}</TableCell>
                  <TableCell>{event.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </OperationalTable>
        </TabsContent>
      </Tabs>
    </div>
  )
}
