import Link from "next/link"
import { notFound } from "next/navigation"
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
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  PageHeader,
  FormSection,
  RecordDetails,
} from "@/components/ui/golden-patterns"
import {
  SatisfactionForm,
  SatisfactionDecisionForm,
  SatisfactionUploadForm,
} from "@/components/iso-document/customer-satisfaction-forms"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"
import { satisfactionTextFields } from "@workspace/db/customer-satisfaction-domain"
import { attachmentViewerHref } from "@/lib/attachment-viewer"
import { DataDownloadButton } from "@/components/data-download-button"
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withCustomerSatisfaction(async ({ repository, access }) => {
    const dossier = await repository.dossier(access, id)
    if (!dossier) notFound()
    const { entry, files, history } = dossier
    const canWork =
      access.canManage || entry.fields.ownerUserId === access.userId
    const editable =
      canWork && (entry.status === "Draft" || entry.status === "Returned")
    const [owners, customers, actions] = editable
      ? await Promise.all([
          access.canManage ? repository.owners(access.organizationId) : [],
          repository.customers(access),
          withIsoAnalysis(async (context) =>
            (
              await Promise.all(
                (["PEST", "SWOT", "RISK"] as const).map((kind) =>
                  context.repository.list(context.access, kind)
                )
              )
            ).flat()
          ),
        ])
      : [[], [], []]
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={`CS-${String(entry.number).padStart(5, "0")} · ${entry.fields.title}`}
          badge={<StatusBadge value={entry.status} />}
          description="Original reports, customer feedback, QA findings and follow-up history."
          actions={
            <>
              <DataDownloadButton
                href={`/iso-document/customer-satisfaction/export.xlsx?item=${id}`}
                label="Download Report Register & History"
              />
              <Button asChild variant="outline">
                <Link href="/iso-document/customer-satisfaction">
                  Back to Reports
                </Link>
              </Button>
            </>
          }
        />
        <SectionCard width="wide">
          <CardHeader>
            <CardTitle>Report & Review Details</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordDetails
              items={[
                {
                  label: "Customer",
                  value: entry.customerName ?? entry.fields.customerScope,
                },
                {
                  label: "Reporting Period",
                  value: `${entry.fields.periodFrom ?? "Not set"} – ${entry.fields.periodTo ?? "Not set"}`,
                },
                {
                  label: "Responsible Staff",
                  value: entry.ownerName ?? "Unassigned",
                },
                ...Object.entries(satisfactionTextFields).map(
                  ([key, label]) => ({
                    label,
                    value:
                      entry.fields[
                        key as keyof typeof satisfactionTextFields
                      ] || "Not recorded",
                  })
                ),
                {
                  label: "Next Review",
                  value: entry.fields.nextReviewOn ?? "Not set",
                },
                {
                  label: "QA / Submission Findings",
                  value: entry.decisionNotes || "Not reviewed",
                },
                {
                  label: "Follow-up",
                  value:
                    entry.fields.analysisId && entry.actionReference ? (
                      <Link
                        className="underline"
                        href={`/iso-document/analysis/${entry.actionReference.split("-")[0]!.toLowerCase()}/${entry.fields.analysisId}`}
                      >
                        {entry.actionReference} · {entry.actionDescription} ·{" "}
                        {entry.actionStatus}
                      </Link>
                    ) : entry.fields.followUpRequired ? (
                      "Follow-up action not linked"
                    ) : (
                      "No follow-up required"
                    ),
                },
              ]}
            />
          </CardContent>
        </SectionCard>
        <SectionCard>
          <CardHeader>
            <CardTitle>Original Report Files</CardTitle>
            <CardDescription>
              Current report and retained file versions. Download Excel files to
              open them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              excelFilters
              filterStorageKey="iso-satisfaction-files"
              containerClassName="max-h-[50vh] rounded-xl border"
              state={files.length ? "ready" : "empty"}
              stateTitle="Report not uploaded"
              stateDescription="Upload the original report before submission."
            >
              <TableHeader>
                <TableRow>
                  {["File", "Version", "Uploaded", "By", "State"].map((x) => (
                    <TableHead key={x}>{x}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      {file.available ? (
                        <Link
                          className="underline"
                          href={attachmentViewerHref({
                            fileName: file.fileName,
                            mediaType: file.mediaType,
                            byteSize: file.byteSize,
                            source: `/iso-document/customer-satisfaction/${id}/files/${file.id}`,
                          })}
                        >
                          {file.fileName}
                        </Link>
                      ) : (
                        `${file.fileName} · unavailable`
                      )}
                    </TableCell>
                    <TableCell>{file.version}</TableCell>
                    <TableCell>
                      {new Date(file.uploadedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </TableCell>
                    <TableCell>{file.uploadedBy ?? "Not recorded"}</TableCell>
                    <TableCell>
                      {file.isCurrent ? "Current" : "Previous version"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
        {editable ? (
          <FormSection title="Upload Report">
            <SatisfactionUploadForm entry={entry} />
          </FormSection>
        ) : null}
        {canWork || access.canVerify ? (
          <FormSection
            title="Submission & QA Review"
            description="Approval reviews this report. Linked actions remain pending until separately verified."
          >
            <SatisfactionDecisionForm
              key={entry.version}
              entry={entry}
              canWork={canWork}
              canVerify={access.canVerify}
            />
          </FormSection>
        ) : null}
        {editable ? (
          <FormSection title="Edit Report Details">
            <SatisfactionForm
              key={entry.version}
              entry={entry}
              owners={owners}
              customers={customers}
              actions={actions}
              canManage={access.canManage}
            />
          </FormSection>
        ) : null}
        <IsoRecordHistoryTable
          history={history}
          filterStorageKey="iso-satisfaction-history"
        />
      </div>
    )
  })
}
