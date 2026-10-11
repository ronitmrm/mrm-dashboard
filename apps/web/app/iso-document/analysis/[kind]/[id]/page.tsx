import Link from "next/link"
import { notFound } from "next/navigation"
import {
  analysisReference,
  isAnalysisKind,
} from "@workspace/db/iso-analysis-domain"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { DataDownloadButton } from "@/components/data-download-button"
import {
  AnalysisMetadataForm,
  AnalysisUpdateForm,
} from "@/components/iso-document/analysis-forms"
import { PageHeader } from "@/components/ui/golden-patterns"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"

const labels: Record<string, string> = {
  category: "Category",
  focus: "Risk / opportunity",
  priority: "Priority",
  impact: "Business impact",
  expectedOutcome: "Expected outcome",
  effectivenessNotes: "Effectiveness findings",
  analysisYear: "Year",
  description: "Issue",
  actionPlan: "Action plan",
  department: "Department",
  ownerName: "Responsible staff",
  ownerUserId: "Responsible account",
  identifiedOn: "Identified",
  dueOn: "Target date",
  reviewedOn: "Review date",
  nextReviewOn: "Next review",
  status: "Status",
  completionNotes: "Completion notes",
  evidenceLocation: "Evidence",
  completedAt: "Completed at",
  completedBy: "Completed by",
  closedAt: "Closed at",
  closedBy: "Closed by",
  closureRemarks: "Closure remarks",
}
const actions: Record<string, string> = {
  created: "Created",
  imported: "Workbook imported",
  edited: "Details changed",
  progress: "Progress recorded",
  complete: "Marked completed",
  verify: "QA verified and closed",
  return: "Returned for further work",
  reopen: "Reopened",
  review: "Review recorded",
}
function timestamp(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
}

export default async function AnalysisItemPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}) {
  const { kind: slug, id } = await params
  const kind = slug.toUpperCase()
  if (
    !isAnalysisKind(kind) ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
  )
    notFound()
  return withIsoAnalysis(async ({ repository, access }) => {
    const dossier = await repository.dossier(access, id)
    if (!dossier || dossier.entry.kind !== kind) notFound()
    const { entry, history } = dossier
    const owners = access.canManage
      ? await repository.owners(access.organizationId)
      : []
    const path = `/iso-document/analysis/${kind.toLowerCase()}`
    const canWork = access.canManage || entry.ownerUserId === access.userId
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={analysisReference(kind, entry.number)}
          description={entry.description}
          badge={
            <StatusBadge
              value={entry.status}
              tone={
                entry.status === "Closed"
                  ? "inactive"
                  : entry.status === "Completed"
                    ? "positive"
                    : "warning"
              }
            />
          }
          actions={
            <>
              <DataDownloadButton
                label="Download Item & History"
                href={`${path}/export.xlsx?item=${id}`}
              />
              <Button asChild variant="outline">
                <Link href={path}>Back to {kind} Analysis</Link>
              </Button>
            </>
          }
        />
        <SectionCard width="wide">
          <CardHeader>
            <CardTitle>Action Details</CardTitle>
            <CardDescription>
              {entry.analysisYear} · {entry.category} ·{" "}
              {entry.department || "Department not assigned"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Action Plan", entry.actionPlan],
                ["Risk / Opportunity", entry.focus],
                ["Priority", entry.priority],
                ["Business Impact", entry.impact || "Not assessed"],
                ["Expected Outcome", entry.expectedOutcome || "Not defined"],
                ["Responsible Staff", entry.ownerName || "Not assigned"],
                ["Target Date", entry.dueOn || "Not set"],
                ["Issue Identified On", entry.identifiedOn || "Not recorded"],
                ["Last Review", entry.reviewedOn || "Not recorded"],
                ["Next Review", entry.nextReviewOn || "Not set"],
                ["Work Done", entry.completionNotes || "Not recorded"],
                ["Evidence", entry.evidenceLocation || "Not recorded"],
                [
                  "Completed By",
                  entry.completedBy && entry.completedAt
                    ? `${entry.completedBy} · ${timestamp(entry.completedAt)}`
                    : "Not recorded",
                ],
                [
                  "QA Closure",
                  entry.closedBy && entry.closedAt
                    ? `${entry.closedBy} · ${timestamp(entry.closedAt)}`
                    : "Awaiting QA verification",
                ],
                ["Closure Remarks", entry.closureRemarks || "—"],
                [
                  "Effectiveness Findings",
                  entry.effectivenessNotes || "Not verified",
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="break-words whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </SectionCard>
        {(canWork && entry.status !== "Closed") || access.canVerify ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Work & QA Decisions</CardTitle>
              <CardDescription>
                Complete work after assessment and assignment. QA closes only
                after checking actual results against the expected outcome and
                recording evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalysisUpdateForm
                key={entry.version}
                entry={entry}
                canWork={canWork}
                canVerify={access.canVerify}
              />
            </CardContent>
          </SectionCard>
        ) : null}
        {access.canManage && entry.status !== "Closed" ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Edit Action Details</CardTitle>
            </CardHeader>
            <CardContent>
              <AnalysisMetadataForm
                key={entry.version}
                kind={kind}
                entry={entry}
                owners={owners}
              />
            </CardContent>
          </SectionCard>
        ) : null}
        <SectionCard>
          <CardHeader>
            <CardTitle>Complete History</CardTitle>
            <CardDescription>
              Every change, work update and QA decision, newest first. Times
              shown in India time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              key={entry.version}
              excelFilters
              filterStorageKey="iso-analysis-item-history"
              containerClassName="max-h-[60vh] rounded-xl border"
              state={history.length ? "ready" : "empty"}
              stateTitle="No history yet"
              stateDescription="Saved actions will appear here."
            >
              <TableHeader>
                <TableRow>
                  <TableHead data-filterable="true">When</TableHead>
                  <TableHead data-filterable="true">Action</TableHead>
                  <TableHead data-filterable="true">By</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{timestamp(event.occurredAt)}</TableCell>
                    <TableCell>
                      {actions[event.eventType.split(".").at(-1) ?? ""] ??
                        event.eventType}
                    </TableCell>
                    <TableCell>{event.actorName}</TableCell>
                    <TableCell className="max-w-96 min-w-56 whitespace-pre-wrap">
                      {event.remarks}
                    </TableCell>
                    <TableCell className="max-w-xl min-w-64 whitespace-normal">
                      <div className="grid gap-1">
                        {Object.entries(labels).flatMap(([key, label]) => {
                          const before = event.before?.[key]
                          const after = event.after?.[key]
                          if (
                            before === after ||
                            (!event.before && (after == null || after === ""))
                          )
                            return []
                          return [
                            <p key={key}>
                              {label}: {String(before ?? "—")} →{" "}
                              {String(after ?? "—")}
                            </p>,
                          ]
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
        {entry.source ? (
          <SectionCard width="wide">
            <CardHeader>
              <CardTitle>Original Workbook Data</CardTitle>
              <CardDescription>
                {entry.source.fileName} · Sheet {entry.source.sheet} · Row{" "}
                {entry.source.row} · {entry.source.documentNumber}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Original completion labels represent source data. QA
                verification and closure are recorded separately in MRM.
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {Object.entries(entry.source.columns).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="break-words whitespace-pre-wrap">
                      {value || "—"}
                    </dd>
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
