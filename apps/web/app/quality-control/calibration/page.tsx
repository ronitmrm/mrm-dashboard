import Link from "next/link"
import { ClipboardCheck } from "lucide-react"

import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"
import { FormGrid, MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { formatIstDate, istDateValue } from "@/lib/date-time"
import {
  assignCalibrationScheduleAction,
  cancelCalibrationVisitAction,
  dispatchCalibrationVisitAction,
  openCalibrationVisitAction,
  returnCalibrationVisitAction,
  signOffCalibrationVisitAction,
} from "./actions"

type WorkItem = Awaited<ReturnType<ReturnType<typeof createStoreRepository>["listCalibrationWorklist"]>>[number]
type Workspace = NonNullable<Awaited<ReturnType<ReturnType<typeof createStoreRepository>["getAssetWorkspace"]>>>

function statusTone(row: WorkItem, today: string) {
  if (row.status === "FAILED") return "danger" as const
  if (row.dueOn < today && row.status === "Planned") return "danger" as const
  if (row.status === "Planned") return "information" as const
  return "warning" as const
}

function SignOffForm({
  unitId,
  visit,
}: {
  unitId: string
  visit: Workspace["calibrationVisits"][number]
}) {
  const needsCertificate = !visit.certificateFileName
  return (
    <PendingRetainedUploadForm
      action={signOffCalibrationVisitAction}
      className="grid w-full max-w-2xl gap-4"
      encType="multipart/form-data"
      uploads={[{
        field: "calibration_certificate",
        intent: { kind: "store-calibration-certificate", visitId: visit.id },
      }]}
    >
      <input name="unit_id" type="hidden" value={unitId} />
      <input name="visit_id" type="hidden" value={visit.id} />
      <input name="method" type="hidden" value={visit.method} />
      {visit.method === "IN_HOUSE" ? (
        <Field>
          <FieldLabel htmlFor={`scope-${visit.id}`}>Calibration scope</FieldLabel>
          <Textarea defaultValue={visit.scope} id={`scope-${visit.id}`} name="scope" required />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">Scope: {visit.scope}</p>
      )}
      <FormGrid className="sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`completed-${visit.id}`}>Completed on</FieldLabel>
          <Input defaultValue={istDateValue()} id={`completed-${visit.id}`} name="completed_on" required type="date" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`result-${visit.id}`}>Result</FieldLabel>
          <NativeSelect defaultValue="" id={`result-${visit.id}`} name="result" required>
            <NativeSelectOption value="">Select result</NativeSelectOption>
            <NativeSelectOption value="PASSED">Passed</NativeSelectOption>
            <NativeSelectOption value="FAILED">Failed</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FormGrid>
      <FormGrid className="sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`certificate-number-${visit.id}`}>Certificate number</FieldLabel>
          <Input defaultValue={visit.certificateNumber || ""} id={`certificate-number-${visit.id}`} name="certificate_number" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`certificate-${visit.id}`}>Certificate PDF</FieldLabel>
          <Input accept="application/pdf" id={`certificate-${visit.id}`} name="calibration_certificate" required={needsCertificate} type="file" />
        </Field>
      </FormGrid>
      {visit.certificateHref ? (
        <Button asChild className="w-fit" size="sm" variant="outline">
          <AttachmentViewerLink
            fileName={visit.certificateFileName || "calibration-certificate.pdf"}
            href={visit.certificateHref}
            mediaType="application/pdf"
          >
            View saved certificate
          </AttachmentViewerLink>
        </Button>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`notes-${visit.id}`}>Result notes</FieldLabel>
        <Textarea id={`notes-${visit.id}`} name="work_done" />
      </Field>
      <p className="text-sm text-muted-foreground">
        The signed-in performer is recorded automatically. Passing advances the timetable;
        failure keeps the Unit ID unavailable and due for corrective work.
      </p>
      <Button className="w-fit" type="submit">Sign off calibration</Button>
    </PendingRetainedUploadForm>
  )
}

function SelectedWork({ row, workspace, canWrite, includeFuture }: {
  row: WorkItem
  workspace: Workspace
  canWrite: boolean
  includeFuture: boolean
}) {
  const visit = workspace.calibrationVisits.find((item) => item.id === row.visitId)
  const status = row.status === "Planned" && row.dueOn < istDateValue() ? "Overdue" : row.status
  return (
    <SectionCard>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{row.unitId} · {row.assetName}</CardTitle>
            <CardDescription>
              {row.scheduleName} · due {formatIstDate(row.dueOn)} · accountable to {row.accountableStoreName}
            </CardDescription>
          </div>
          <StatusBadge tone={statusTone(row, istDateValue())} value={status} />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-5">
        <p className="text-sm text-muted-foreground">
          Physical holder: {row.currentHolderName || row.currentHolderType}.
          Calibration evidence and results are kept in this Unit ID’s history.
        </p>
        {!canWrite ? (
          <StandardState title="Read only" description="Quality Control write access is needed to record this work." />
        ) : row.status === "Planned" || row.status === "FAILED" ? (
          <div className="grid gap-5">
            {row.status === "FAILED" ? (
              <p className="text-sm text-muted-foreground">The failed visit remains in history. Start a corrective visit to retry.</p>
            ) : null}
            {(row.status === "Planned" || row.method === "IN_HOUSE") ? (
              <form action={openCalibrationVisitAction} className="flex flex-wrap items-end gap-3">
                <input name="unit_id" type="hidden" value={row.unitId} />
                {includeFuture ? <input name="show" type="hidden" value="all" /> : null}
                <input name="schedule_id" type="hidden" value={row.scheduleId} />
                <input name="method" type="hidden" value="IN_HOUSE" />
                <input name="scope" type="hidden" value={row.scheduleName} />
                <Button type="submit">Calibrate In House</Button>
              </form>
            ) : null}
            {(row.status === "Planned" || row.method === "SUPPLIER") ? (
              <form action={openCalibrationVisitAction} className="grid w-full max-w-xl gap-3">
                <input name="unit_id" type="hidden" value={row.unitId} />
                {includeFuture ? <input name="show" type="hidden" value="all" /> : null}
                <input name="schedule_id" type="hidden" value={row.scheduleId} />
                <input name="method" type="hidden" value="SUPPLIER" />
                <Field>
                  <FieldLabel htmlFor={`supplier-scope-${row.id}`}>Supplier calibration scope</FieldLabel>
                  <Textarea defaultValue={row.scope || ""} id={`supplier-scope-${row.id}`} name="scope" required />
                </Field>
                <Button className="w-fit" type="submit">Start Supplier Calibration</Button>
              </form>
            ) : null}
          </div>
        ) : visit?.method === "IN_HOUSE" && visit.status === "OPEN" ? (
          <div className="grid gap-5">
            <SignOffForm unitId={row.unitId} visit={visit} />
            <form action={cancelCalibrationVisitAction}>
              <input name="unit_id" type="hidden" value={row.unitId} />
              <input name="visit_id" type="hidden" value={visit.id} />
              <input name="method" type="hidden" value="IN_HOUSE" />
              <Button type="submit" variant="outline">Cancel visit</Button>
            </form>
          </div>
        ) : visit?.method === "SUPPLIER" && visit.status === "OPEN" ? (
          row.purchaseOrderId && row.purchaseOrderIssuanceState === "issued" ? (
            <div className="grid gap-3">
              <p className="text-sm">Service PO {row.purchaseOrderNumber} is issued. Record the physical dispatch to the supplier.</p>
              <form action={dispatchCalibrationVisitAction}>
                <input name="unit_id" type="hidden" value={row.unitId} />
                <input name="visit_id" type="hidden" value={visit.id} />
                <Button type="submit">Record dispatch</Button>
              </form>
            </div>
          ) : (
            <div className="grid gap-3">
              <StandardState title="Awaiting service PO" description={`${row.accountableStoreName} records supplier offers and issues the calibration service PO.`} />
              <form action={cancelCalibrationVisitAction}>
                <input name="unit_id" type="hidden" value={row.unitId} />
                <input name="visit_id" type="hidden" value={visit.id} />
                <input name="method" type="hidden" value="SUPPLIER" />
                <Button type="submit" variant="outline">Cancel visit</Button>
              </form>
            </div>
          )
        ) : visit?.status === "DISPATCHED" ? (
          <form action={returnCalibrationVisitAction} className="grid w-full max-w-xl gap-3">
            <input name="unit_id" type="hidden" value={row.unitId} />
            <input name="visit_id" type="hidden" value={visit.id} />
            <p className="text-sm">Record physical return to {row.accountableStoreName}.</p>
            <Field>
              <FieldLabel htmlFor={`returned-${visit.id}`}>Returned on</FieldLabel>
              <Input defaultValue={istDateValue()} id={`returned-${visit.id}`} name="returned_on" required type="date" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`return-notes-${visit.id}`}>Return notes</FieldLabel>
              <Input id={`return-notes-${visit.id}`} name="remark" />
            </Field>
            <Button className="w-fit" type="submit">Record return</Button>
          </form>
        ) : visit?.status === "RETURNED" ? (
          <SignOffForm unitId={row.unitId} visit={visit} />
        ) : (
          <StandardState title="No action available" description="Select another pending calibration item." />
        )}
      </CardContent>
    </SectionCard>
  )
}

export default async function CalibrationWorkPage({ searchParams }: {
  searchParams: Promise<{ unit?: string; work?: string; show?: string; assetSearch?: string; assign?: string }>
}) {
  const session = await requireCapability("quality.control.calibration.read", "/quality-control/calibration")
  const params = await searchParams
  const includeFuture = params.show === "all"
  const showAssignment = params.assign === "1"
  const viewParams = new URLSearchParams()
  if (includeFuture) viewParams.set("show", "all")
  if (params.work) viewParams.set("work", params.work)
  if (params.unit) viewParams.set("unit", params.unit)
  const closeAssignmentHref = viewParams.size
    ? `/quality-control/calibration?${viewParams.toString()}`
    : "/quality-control/calibration"
  const assignmentParams = new URLSearchParams(viewParams)
  assignmentParams.set("assign", "1")
  const grants = await listGrantedCapabilities(session.user.id, ["quality.control.calibration.write"])
  const canWrite = grants.length > 0
  const repository = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [rows, candidates] = await Promise.all([
      repository.listCalibrationWorklist({ organizationId, includeFuture }),
      canWrite && showAssignment
        ? repository.listCalibrationAssignmentCandidates({ organizationId, search: params.assetSearch })
        : Promise.resolve([]),
    ])
    const selected = rows.find((row) => row.id === params.work)
      || rows.find((row) => row.unitId === params.unit && ["OPEN", "DISPATCHED", "RETURNED"].includes(row.status))
      || rows.find((row) => row.unitId === params.unit)
    const workspace = selected ? await repository.getAssetWorkspace({ assetCode: selected.unitId, organizationId }) : null
    return { rows, candidates, selected, workspace }
  })().finally(() => repository.close())
  const today = istDateValue()
  const overdue = data.rows.filter((row) => row.dueOn < today && (row.status === "Planned" || row.status === "FAILED")).length

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title="Calibration"
        icon={ClipboardCheck}
        description="Quality Control work list for every assigned Unit ID, across all accountable stores."
        actions={<div className="flex flex-wrap gap-2">
          {canWrite ? <Button asChild variant={showAssignment ? "outline" : "default"}>
            <Link href={showAssignment ? closeAssignmentHref : `/quality-control/calibration?${assignmentParams.toString()}`}>
              {showAssignment ? "Close timetable form" : "Assign calibration timetable"}
            </Link>
          </Button> : null}
          <Button asChild variant="outline"><Link href="/iso-document/calibration-plan">Calibration Plan</Link></Button>
        </div>}
      />
      <MetricSummary
        scope={`${includeFuture ? "All dates" : "Due and overdue"} · before table filters`}
        items={[
          { label: "Work items", value: data.rows.length, tone: "information" },
          { label: "Overdue", value: overdue, tone: "danger" },
          { label: "Awaiting QC", value: data.rows.filter((row) => row.status === "DISPATCHED" || row.status === "RETURNED").length, tone: "warning" },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={includeFuture ? "outline" : "default"}><Link href="/quality-control/calibration">Due and overdue</Link></Button>
        <Button asChild size="sm" variant={includeFuture ? "default" : "outline"}><Link href="/quality-control/calibration?show=all">All dates</Link></Button>
      </div>
      {data.selected && data.workspace ? <SelectedWork row={data.selected} workspace={data.workspace} canWrite={canWrite} includeFuture={includeFuture} /> : null}
      <OperationalTable filterStorageKey="quality-control-calibration-work" containerClassName="rounded-md border" toolbarStart={<span className="font-medium">Calibration work</span>}>
        <TableHeader>
          <TableRow>
            <TableHead>Due</TableHead>
            <TableHead>Unit ID</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Accountable Store</TableHead>
            <TableHead>Holder</TableHead>
            <TableHead>Calibration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.id} data-row-id={row.id}>
              <TableCell>{formatIstDate(row.dueOn)}</TableCell>
              <TableCell className="font-medium">{row.unitId}</TableCell>
              <TableCell>{row.typeCode} · {row.assetName}</TableCell>
              <TableCell>{row.accountableStoreName}</TableCell>
              <TableCell>{row.currentHolderName || row.currentHolderType}</TableCell>
              <TableCell>{row.scheduleName}</TableCell>
              <TableCell><StatusBadge tone={statusTone(row, today)} value={row.status === "Planned" && row.dueOn < today ? "Overdue" : row.status} /></TableCell>
              <TableCell>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/quality-control/calibration?${includeFuture ? "show=all&" : ""}work=${encodeURIComponent(row.id)}&unit=${encodeURIComponent(row.unitId)}`}>Open</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!data.rows.length ? (
            <TableRow><TableCell colSpan={8}><StandardState title="No calibration work" description="Assigned due dates and open visits will appear here." /></TableCell></TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
      {canWrite && showAssignment ? (
        <SectionCard width="wide">
          <CardHeader>
            <CardTitle>Assign calibration timetable</CardTitle>
            <CardDescription>Assign to any serialized Unit ID, regardless of its accountable store.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form action="/quality-control/calibration" className="flex flex-wrap items-end gap-2">
              <input name="assign" type="hidden" value="1" />
              {includeFuture ? <input name="show" type="hidden" value="all" /> : null}
              {params.work ? <input name="work" type="hidden" value={params.work} /> : null}
              {params.unit ? <input name="unit" type="hidden" value={params.unit} /> : null}
              <Field className="w-full max-w-xs">
                <FieldLabel htmlFor="candidate-search">Find Unit ID or asset</FieldLabel>
                <Input defaultValue={params.assetSearch || ""} id="candidate-search" name="assetSearch" />
              </Field>
              <Button type="submit" variant="outline">Search</Button>
            </form>
            <form action={assignCalibrationScheduleAction} className="grid w-full max-w-2xl gap-3">
              <Field>
                <FieldLabel htmlFor="calibration-unit">Unit ID</FieldLabel>
                <NativeSelect defaultValue="" id="calibration-unit" name="unit_id" required>
                  <NativeSelectOption value="">Select Unit ID</NativeSelectOption>
                  {data.candidates.map((candidate) => (
                    <NativeSelectOption key={candidate.assetId} value={candidate.unitId}>
                      {candidate.unitId} · {candidate.assetName} · {candidate.accountableStoreName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <FormGrid className="sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="schedule-name">Calibration name</FieldLabel>
                  <Input id="schedule-name" name="schedule_name" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="frequency-days">Frequency (days)</FieldLabel>
                  <Input id="frequency-days" min="1" name="frequency_days" required step="1" type="number" />
                </Field>
              </FormGrid>
              <Field>
                <FieldLabel htmlFor="first-due">First due date</FieldLabel>
                <Input id="first-due" name="first_due_on" required type="date" />
              </Field>
              <Button className="w-fit" type="submit">Assign timetable</Button>
            </form>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
