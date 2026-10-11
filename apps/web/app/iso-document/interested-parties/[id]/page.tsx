import Link from "next/link"
import { notFound } from "next/navigation"
import {
  requirementAttention,
  requirementReference,
} from "@workspace/db/interested-parties-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { PageHeader, RecordDetails } from "@/components/ui/golden-patterns"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { DataDownloadButton } from "@/components/data-download-button"
import {
  RequirementForm,
  MonitoringForm,
  MonitoringDecisionForm,
} from "@/components/iso-document/interested-parties-forms"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import {
  requirementDetails,
  requirementTone,
} from "@/lib/iso-document/interested-parties-display"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
export default async function RequirementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withInterestedParties(async ({ repository, access }) => {
    const dossier = await repository.dossier(access, id)
    if (!dossier) notFound()
    const { entry, reviews, history } = dossier,
      pendingReview = reviews.find((review) => review.status === "Submitted"),
      attention = requirementAttention(entry)
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={`${requirementReference(entry.number)} · ${entry.partyGroup}`}
          description={entry.requirement}
          badge={
            <StatusBadge value={attention} tone={requirementTone(attention)} />
          }
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/iso-document/interested-parties">
                  Back to requirements
                </Link>
              </Button>
              <Button asChild variant="outline">
                <AttachmentViewerLink
                  href={`/iso-document/interested-parties/${id}/record.pdf`}
                  fileName={`${requirementReference(entry.number)}-monitoring.pdf`}
                  mediaType="application/pdf"
                >
                  Preview document
                </AttachmentViewerLink>
              </Button>
              <DataDownloadButton
                href={`/iso-document/interested-parties/export.xlsx?requirement=${id}`}
                label="Download Excel"
              />
            </>
          }
        />
        {entry.source && entry.lifecycle === "Draft" && (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Original example needs assessment</CardTitle>
              <CardDescription>
                Original Done labels are retained as source notes. Confirm
                scope/relevance, responsibility, criteria, frequency and review
                dates before activating this plan.
              </CardDescription>
            </CardHeader>
          </SectionCard>
        )}
        <SectionCard>
          <CardHeader>
            <CardTitle>Requirement and monitoring plan</CardTitle>
            <CardDescription>
              {entry.lifecycle} · Plan revision {entry.planRevision}. Earlier
              verification remains in the monitoring history after plan changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecordDetails
              items={requirementDetails.map(([key, label]) => ({
                label,
                value: entry[key] || "Not recorded",
              }))}
            />
          </CardContent>
        </SectionCard>
        {access.canManage && !pendingReview && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Edit requirement / monitoring plan
            </summary>
            <div className="pt-4">
              <RequirementForm
                entry={entry}
                staff={await repository.owners(access.organizationId)}
              />
            </div>
          </details>
        )}
        {entry.lifecycle === "Active" &&
          !pendingReview &&
          (access.canManage || entry.ownerUserId === access.userId) && (
            <MonitoringForm entry={entry} />
          )}
        {pendingReview && (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Monitoring awaits QA verification</CardTitle>
              <CardDescription>
                The submitted result and its plan snapshot are retained below.
                QA can verify or return it before the plan changes.
              </CardDescription>
            </CardHeader>
          </SectionCard>
        )}
        {pendingReview && access.canVerify && (
          <MonitoringDecisionForm entry={entry} review={pendingReview} />
        )}
        <SectionCard>
          <CardHeader>
            <CardTitle>Monitoring and QA decisions</CardTitle>
            <CardDescription>
              One row per actual check. Met results keep ongoing requirements
              active. Earlier gaps and evidence remain available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              key={reviews[0]?.id}
              excelFilters
              filterStorageKey="iso-interested-party-monitoring-history"
              containerClassName="max-h-[65vh] rounded-xl border"
              state={reviews.length ? "ready" : "empty"}
              stateTitle="No monitoring recorded"
              stateDescription="Activate the plan and record an actual check."
            >
              <TableHeader>
                <TableRow>
                  {[
                    "Actual check",
                    "QA position",
                    "Proposed / verified result",
                    "Observations / evidence",
                    "Follow-up / target",
                    "Recorded by",
                    "QA findings / next review",
                    "Plan used",
                  ].map((label) => (
                    <TableHead key={label} data-filterable="true">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>{review.observedOn}</TableCell>
                    <TableCell>
                      <StatusBadge
                        value={review.status}
                        tone={
                          review.status === "Returned"
                            ? "warning"
                            : "information"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={review.outcome}
                        tone={
                          review.status !== "Verified"
                            ? "information"
                            : review.outcome === "Met"
                              ? "positive"
                              : review.outcome === "Partly met"
                                ? "warning"
                                : "danger"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {review.status === "Verified"
                          ? "QA verified"
                          : "Proposed result"}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-96 min-w-64 whitespace-pre-wrap">
                      {review.observations}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Evidence: {review.evidence}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-80 min-w-48 whitespace-pre-wrap">
                      {review.followUp || "—"}
                      <p className="text-xs text-muted-foreground">
                        {review.followUpDueOn}
                      </p>
                      {review.relatedReference}
                    </TableCell>
                    <TableCell className="min-w-40">
                      {review.recordedBy}
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.recordedAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-96 min-w-56 whitespace-pre-wrap">
                      {review.decisionNotes || "Awaiting QA"}
                      <p className="text-xs text-muted-foreground">
                        {review.decidedBy}
                        {review.decidedAt
                          ? ` · ${new Date(review.decidedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Next review: {review.nextReviewOn || "Not set"}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-56">
                      <details>
                        <summary className="cursor-pointer">
                          Plan revision {review.planRevision}
                        </summary>
                        <RecordDetails
                          items={[
                            {
                              label: "Requirement",
                              value: review.planSnapshot.requirement,
                            },
                            ...requirementDetails.map(([key, label]) => ({
                              label,
                              value: review.planSnapshot[key] || "Not recorded",
                            })),
                          ]}
                        />
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
        <IsoRecordHistoryTable
          history={history}
          filterStorageKey="iso-interested-party-history"
        />
        {entry.source && (
          <SectionCard>
            <CardHeader>
              <CardTitle>Original source row</CardTitle>
              <CardDescription>
                {entry.source.fileName} · {entry.source.sheet}, row{" "}
                {entry.source.row} · Original form {entry.source.formCode}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecordDetails
                items={Object.entries(entry.source.cells).map(
                  ([label, value]) => ({ label, value: value || "Blank" })
                )}
              />
            </CardContent>
          </SectionCard>
        )}
      </div>
    )
  })
}
