import Link from "next/link"
import { notFound } from "next/navigation"

import {
  createMaintenanceRepository,
  createMaintenanceWorkPhotoRepository,
  type CompletedMaintenanceReport,
} from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardAction, CardContent, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"

import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import { maintenanceWorkPhotoQuery } from "@/lib/maintenance-work-photo-target"

function ReportField({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0">
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap text-sm font-medium">{value || "Not recorded"}</dd>
  </div>
}

function actualMinutes(report: CompletedMaintenanceReport) {
  if (report.legacyHistory || !report.startedAt) return null
  const minutes = (Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 60_000
  return Number.isFinite(minutes) && minutes >= 0 ? String(Math.ceil(minutes)) : null
}

export default async function MachineMaintenanceReportPage({ params }: {
  params: Promise<{ kind: string; id: string }>
}) {
  await requireCapability("maintenance.workspace.read", "/iso-document/machine-maintenance-register")
  const { kind, id } = await params
  if ((kind !== "machine" && kind !== "asset") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()

  const connectionString = readAuthEnvironment().connectionString
  const repository = createMaintenanceRepository({ connectionString })
  const photoRepository = createMaintenanceWorkPhotoRepository({ connectionString })
  const data = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const report = kind === "machine"
        ? await repository.getCompletedMachineMaintenanceReport(organizationId, id)
        : await repository.getCompletedAssetMaintenanceReport(organizationId, id)
      if (!report) return null
      const target = report.photoTarget
        ? await photoRepository.resolveTarget(organizationId, report.photoTarget) : null
      const photos = target ? await photoRepository.listPhotos(organizationId, target) : []
      return { report, photos }
    } finally {
      await Promise.all([repository.close(), photoRepository.close()])
    }
  })()
  if (!data) notFound()
  const { report, photos } = data
  const photoQuery = report.photoTarget
    ? maintenanceWorkPhotoQuery(report.photoTarget) : null

  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader
      title="Maintenance Report"
      description={`${report.equipmentCode} · ${report.maintenance}`}
      actions={<Button asChild size="sm" variant="outline">
        <Link href="/iso-document/machine-maintenance-register">Maintenance Register</Link>
      </Button>}
    />
    <SectionCard>
      <CardHeader>
        <CardTitle>Completed Work</CardTitle>
        <CardAction><StatusBadge value={report.result || "Completed"} /></CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportField label="Machine No. / Unit ID" value={report.equipmentCode} />
          {report.equipmentName ? <ReportField label="Asset" value={report.equipmentName} /> : null}
          <ReportField label="Production Unit / Location" value={report.productionUnit} />
          <ReportField label="Maintenance" value={report.maintenance} />
          <ReportField label="Type" value={report.taskType} />
          {report.taskType.toLowerCase() === "planned"
            ? <ReportField label="Planned Date" value={formatIstDate(report.dueOn)} /> : null}
          <ReportField label="Started At" value={report.legacyHistory
            ? report.startedAt ? `${formatIstDate(report.startedAt)} · Time not recorded` : null
            : report.startedAt ? formatIstDateTime(report.startedAt) : null} />
          <ReportField label="Completed At" value={report.legacyHistory
            ? `${formatIstDate(report.completedAt)} · Time not recorded`
            : formatIstDateTime(report.completedAt)} />
          <ReportField label="Completed By" value={report.completedBy} />
          {report.completedByEmployeeCode
            ? <ReportField label="Employee ID" value={report.completedByEmployeeCode} /> : null}
          <ReportField label="Actual Minutes" value={actualMinutes(report)} />
          {report.nextDueOn
            ? <ReportField label="Next Due" value={formatIstDate(report.nextDueOn)} /> : null}
          {report.breakdownReason
            ? <ReportField label="Breakdown Reason" value={report.breakdownReason} /> : null}
          <ReportField label="Work Done" value={report.workDone} />
          {report.remark && report.remark !== report.workDone
            ? <ReportField label="Remark" value={report.remark} /> : null}
          <ReportField label="Items Changed" value={report.changedItems.join(", ")} />
        </dl>
      </CardContent>
    </SectionCard>
    <SectionCard>
      <CardHeader><CardTitle>Filled Checklist</CardTitle></CardHeader>
      <CardContent>
        {report.checklistSteps.length ? <OperationalTable containerClassName="rounded-md border">
          <TableHeader><TableRow>
            <TableHead>Step</TableHead>
            <TableHead>Check Point</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Remark</TableHead>
            <TableHead>Result</TableHead>
          </TableRow></TableHeader>
          <TableBody>{report.checklistSteps.map((step) => <TableRow key={step.sequence}>
            <TableCell>{step.sequence}</TableCell>
            <TableCell className="whitespace-normal">{step.prompt}</TableCell>
            <TableCell>{step.value || "-"}</TableCell>
            <TableCell className="whitespace-normal">{step.remark || "-"}</TableCell>
            <TableCell>{step.result ? <StatusBadge value={step.result} /> : "-"}</TableCell>
          </TableRow>)}</TableBody>
        </OperationalTable> : <StandardState
          title={report.taskType.toLowerCase() === "breakdown"
            ? "No checklist for this breakdown" : "No checklist answers recorded"}
          description="The saved work details above are available for this completed job."
        />}
      </CardContent>
    </SectionCard>
    <SectionCard>
      <CardHeader><CardTitle>Work Photos</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {photoQuery && photos.length ? photos.map((photo) => <a
          className="text-primary underline underline-offset-4"
          href={`/api/maintenance/work-photos/${photo.id}?${photoQuery}`}
          key={photo.id}
          rel="noopener noreferrer"
          target="_blank"
        >{photo.fileName}</a>) : <span className="text-sm text-muted-foreground">No work photos saved.</span>}
      </CardContent>
    </SectionCard>
  </div>
}
