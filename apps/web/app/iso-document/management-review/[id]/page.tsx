import Link from "next/link"
import { notFound } from "next/navigation"
import {
  meetingReference,
  reviewActionReference,
  reviewAgenda,
} from "@workspace/db/management-review-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { DataDownloadButton } from "@/components/data-download-button"
import { PageHeader, FormSection } from "@/components/ui/golden-patterns"
import {
  ManagementReviewMeetingForm,
  MinutesDecisionForm,
  MeetingPointForm,
  CarryMeetingPointForm,
} from "@/components/iso-document/management-review-forms"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import { withManagementReview } from "@/lib/iso-document/management-review-server"

export default async function ManagementReviewMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withManagementReview(async ({ repository, access }) => {
    const dossier = await repository.meetingDossier(access, id)
    if (!dossier) notFound()
    const { entry, actionReviews, history } = dossier
    const editable = access.canManage && entry.status === "Draft"
    const [staff, points] = await Promise.all([
      editable ? repository.staff(access.organizationId) : Promise.resolve([]),
      editable ? repository.listActions(access) : Promise.resolve([]),
    ])
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={`${meetingReference(entry.number)} · ${entry.title}`}
          badge={<StatusBadge value={entry.status} />}
          description={`${entry.heldOn} · ${entry.location} · ${entry.periodStart && entry.periodEnd ? `Review period ${entry.periodStart} to ${entry.periodEnd}` : "Review period not confirmed"}`}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/iso-document/management-review">
                  Back to meetings
                </Link>
              </Button>
              <Button asChild variant="outline">
                <AttachmentViewerLink
                  href={`/iso-document/management-review/${id}/minutes.pdf`}
                  fileName={`${meetingReference(entry.number)}-minutes.pdf`}
                  mediaType="application/pdf"
                >
                  Preview minutes
                </AttachmentViewerLink>
              </Button>
              <DataDownloadButton
                href={`/iso-document/management-review/export.xlsx?meeting=${id}`}
                label="Download Excel"
              />
            </>
          }
        />
        {entry.source && entry.status !== "Approved" ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Source example needs confirmation</CardTitle>
              <CardDescription>
                {entry.source.fileName} was retained as an unapproved draft.
                Confirm staff accounts, attendance, review period, evidence and
                decisions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Check source claims against the underlying records and confirm
                the reporting periods. Record evidence-supported conclusions.
                Source Closed/Completed labels do not verify actions.
              </p>
            </CardContent>
          </SectionCard>
        ) : null}
        {editable ? (
          <ManagementReviewMeetingForm
            key={`meeting-${entry.version}`}
            entry={entry}
            staff={staff}
          />
        ) : (
          <>
            <SectionCard width="wide">
              <CardHeader>
                <CardTitle>Meeting record and conclusions</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Chair", entry.chairName],
                    [
                      "Time",
                      `${entry.startTime || "Not recorded"} to ${entry.endTime || "Not recorded"}`,
                    ],
                    ["Next review", entry.nextReviewOn],
                    ["QA approved by", entry.approvedBy],
                    ["QA approval remarks", entry.approvalNotes],
                    [
                      "QA approved at (India)",
                      entry.approvedAt
                        ? new Date(entry.approvedAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })
                        : null,
                    ],
                    ["QMS suitability", entry.suitability],
                    ["QMS adequacy", entry.adequacy],
                    ["QMS effectiveness", entry.effectiveness],
                    ["Improvement decisions", entry.improvementDecisions],
                    ["QMS changes", entry.qmsChanges],
                    ["Resource decisions", entry.resourceDecisions],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="break-words whitespace-pre-wrap">
                        {value || "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </SectionCard>
            <SectionCard>
              <CardHeader>
                <CardTitle>People and attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <OperationalTable
                  excelFilters
                  filterStorageKey="iso-review-attendance"
                  containerClassName="rounded-xl border"
                  state={entry.attendees.length ? "ready" : "empty"}
                  stateTitle="No attendance recorded"
                  stateDescription="Record participants before minutes approval."
                >
                  <TableHeader>
                    <TableRow>
                      {["Name", "Designation", "Department", "Attendance"].map(
                        (label) => (
                          <TableHead key={label} data-filterable="true">
                            {label}
                          </TableHead>
                        )
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.attendees.map((person, index) => (
                      <TableRow
                        key={`${person.userId ?? person.name}-${index}`}
                      >
                        <TableCell>{person.name}</TableCell>
                        <TableCell>
                          {person.designation || "Not recorded"}
                        </TableCell>
                        <TableCell>
                          {person.department || "Not recorded"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            value={person.attendance}
                            tone={
                              person.attendance === "Present"
                                ? "positive"
                                : "inactive"
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </OperationalTable>
              </CardContent>
            </SectionCard>
            <SectionCard width="wide">
              <CardHeader>
                <CardTitle>Review inputs, discussion and decisions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                {reviewAgenda.map((topic, index) => {
                  const input = entry.agenda.find(
                    (item) => item.key === topic.key
                  )
                  return (
                    <section
                      key={topic.key}
                      className="grid gap-2 border-b pb-4"
                    >
                      <h2 className="font-medium">
                        {index + 1}. {topic.title}
                      </h2>
                      <StatusBadge value={input?.outcome ?? "Pending"} />
                      <dl className="grid gap-3">
                        {[
                          ["Discussion / results", input?.discussion],
                          ["Evidence", input?.evidence],
                          ["Decision and rationale", input?.decision],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-sm text-muted-foreground">
                              {label}
                            </dt>
                            <dd className="break-words whitespace-pre-wrap">
                              {value || "Not recorded"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )
                })}
              </CardContent>
            </SectionCard>
          </>
        )}
        <SectionCard>
          <CardHeader>
            <CardTitle>Points discussed in this meeting</CardTitle>
            <CardDescription>
              Status, assignment and target date reflect the point when recorded
              here. Open the point for its current position.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              excelFilters
              filterStorageKey="iso-review-linked-points"
              containerClassName="max-h-[55vh] rounded-xl border"
              state={actionReviews.length ? "ready" : "empty"}
              stateTitle="No linked points"
              stateDescription="Raise follow-ups or review an existing point."
            >
              <TableHeader>
                <TableRow>
                  {[
                    "Point",
                    "Action",
                    "Status at review",
                    "Responsible at review",
                    "Target at review",
                    "Discussion / decision",
                  ].map((label) => (
                    <TableHead key={label} data-filterable="true">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {actionReviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <Link
                        className="text-primary hover:underline"
                        href={`/iso-document/management-review/actions/${review.actionId}`}
                      >
                        {reviewActionReference(review.snapshot.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-96 min-w-56 whitespace-normal">
                      {review.snapshot.description}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={review.snapshot.status} />
                    </TableCell>
                    <TableCell>
                      {review.snapshot.ownerName ?? "Not assigned"}
                    </TableCell>
                    <TableCell>{review.snapshot.dueOn ?? "Not set"}</TableCell>
                    <TableCell className="max-w-96 min-w-56 whitespace-pre-wrap">
                      {review.notes}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
        {editable ? (
          <>
            <FormSection
              title="Raise a new follow-up point"
              description="Save minute changes first. Each point remains in the shared pending list."
            >
              <MeetingPointForm
                key={`point-${entry.version}`}
                meeting={entry}
                staff={staff}
              />
            </FormSection>
            <FormSection
              title="Review an existing point"
              description="Carry the same reference into this meeting and retain the discussion. Save minute changes first."
            >
              <CarryMeetingPointForm
                key={`carry-${entry.version}`}
                meeting={entry}
                points={points.filter(
                  (point) => point.originMeetingDate <= entry.heldOn
                )}
              />
            </FormSection>
          </>
        ) : null}
        <MinutesDecisionForm
          key={`decision-${entry.version}`}
          entry={entry}
          canManage={access.canManage}
          canApprove={access.canApprove}
        />
        <IsoRecordHistoryTable
          history={history}
          filterStorageKey="iso-management-review-history"
        />
        {entry.source ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Original document data</CardTitle>
              <CardDescription>
                {entry.source.fileName} · Source retained for comparison.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer">
                  View supplied notes and status claims
                </summary>
                <div className="grid gap-2 pt-3">
                  {entry.source.sections.map((section, sectionIndex) =>
                    section.text ? (
                      <p key={sectionIndex} className="whitespace-pre-wrap">
                        {section.text}
                      </p>
                    ) : (
                      <div key={sectionIndex} className="grid gap-2">
                        {section.table?.map((row, rowIndex) => (
                          <p
                            key={rowIndex}
                            className="border-b pb-2 text-sm break-words"
                          >
                            {row.join(" | ")}
                          </p>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </details>
            </CardContent>
          </SectionCard>
        ) : null}
      </div>
    )
  })
}
