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
import { PageHeader, FormSection } from "@/components/ui/golden-patterns"
import {
  MeetingPointForm,
  MeetingPointWorkForm,
} from "@/components/iso-document/management-review-forms"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import { withManagementReview } from "@/lib/iso-document/management-review-server"

export default async function ManagementReviewPointPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withManagementReview(async ({ repository, access }) => {
    const dossier = await repository.actionDossier(access, id)
    if (!dossier) notFound()
    const { entry, actionReviews, history } = dossier
    const canWork = access.canManage || entry.ownerUserId === access.userId
    const staff =
      access.canManage && entry.status !== "Closed"
        ? await repository.staff(access.organizationId)
        : []
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={`${reviewActionReference(entry.number)} · ${entry.description}`}
          badge={<StatusBadge value={entry.status} />}
          description={`${reviewAgenda.find((topic) => topic.key === entry.topicKey)?.title} · Original meeting ${meetingReference(entry.originMeetingNumber)} · ${entry.originMeetingDate}`}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/iso-document/management-review#pending-points">
                  Back to pending points
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={`/iso-document/management-review/${entry.originMeetingId}`}
                >
                  Original meeting
                </Link>
              </Button>
            </>
          }
        />
        <SectionCard width="wide">
          <CardHeader>
            <CardTitle>Action and closure record</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Responsible staff", entry.ownerName],
                ["Department", entry.department],
                ["Priority", entry.priority],
                ["Target date", entry.dueOn],
                ["Expected result", entry.expectedOutcome],
                ["Related record", entry.evidenceReference],
                ["Work completed", entry.completionNotes],
                ["Evidence", entry.evidenceLocation],
                ["Completed by", entry.completedBy],
                [
                  "Completed at (India)",
                  entry.completedAt
                    ? new Date(entry.completedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                    : null,
                ],
                ["QA effectiveness findings", entry.effectivenessNotes],
                ["QA closed by", entry.closedBy],
                [
                  "Closed at (India)",
                  entry.closedAt
                    ? new Date(entry.closedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                    : null,
                ],
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
        {canWork || access.canVerify ? (
          <FormSection
            title="Work and QA verification"
            description="QA closes after checking work evidence and the expected result."
          >
            <MeetingPointWorkForm
              key={`work-${entry.version}`}
              entry={entry}
              canWork={canWork}
              canVerify={access.canVerify}
            />
          </FormSection>
        ) : null}
        {access.canManage && entry.status !== "Closed" ? (
          <FormSection
            title="Edit action details"
            description="Earlier meeting snapshots retain previous assignments and decisions."
          >
            <MeetingPointForm
              key={`edit-${entry.version}`}
              entry={entry}
              staff={staff}
            />
          </FormSection>
        ) : null}
        <SectionCard>
          <CardHeader>
            <CardTitle>Discussions across meetings</CardTitle>
            <CardDescription>
              The same point reference, with each meeting’s recorded position
              and discussion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              excelFilters
              filterStorageKey="iso-review-point-meetings"
              containerClassName="max-h-[55vh] rounded-xl border"
              state={actionReviews.length ? "ready" : "empty"}
              stateTitle="No meeting reviews"
              stateDescription="Meeting discussions will appear here."
            >
              <TableHeader>
                <TableRow>
                  {[
                    "Meeting",
                    "Meeting date",
                    "Status then",
                    "Discussion / decision",
                    "Recorded by",
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
                        href={`/iso-document/management-review/${review.meetingId}`}
                      >
                        {meetingReference(review.meetingNumber)}
                      </Link>
                    </TableCell>
                    <TableCell>{review.heldOn}</TableCell>
                    <TableCell>
                      <StatusBadge value={review.snapshot.status} />
                    </TableCell>
                    <TableCell className="max-w-xl min-w-64 whitespace-pre-wrap">
                      {review.notes}
                    </TableCell>
                    <TableCell>
                      {review.reviewedBy ?? "Source document"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
        <IsoRecordHistoryTable
          history={history}
          filterStorageKey="iso-management-review-history"
        />
        {entry.source ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Original source point</CardTitle>
              <CardDescription>
                Original claims do not confirm completion or QA closure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                {Object.entries(entry.source).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">
                      {label.replace(/([A-Z])/g, " $1")}
                    </dt>
                    <dd className="whitespace-pre-wrap">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </SectionCard>
        ) : null}
      </div>
    )
  })
}
