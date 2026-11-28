import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { createEmployeeDataRepository, createRecruitmentRepository, type EmployeeDataRecord, type EmployeeIncrement } from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"
import { Trash2 } from "lucide-react"

import { addEmployeeIncrementAction, deleteEmployeeIncrementAction, saveEmployeeDataAction } from "@/app/hr/employees/actions"
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button"
import { FormGrid, FormSection, PageHeader, StandardState } from "@/components/ui/golden-patterns"
import { istDateValue } from "@/lib/date-time"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"

export const dynamic = "force-dynamic"

type FieldSpec = { key: string; label: string; type?: string; multiline?: boolean }

const personalFields: FieldSpec[] = [
  { key: "dateOfBirth", label: "Date of Birth", type: "date" },
  { key: "contactNo", label: "Contact No", type: "tel" },
  { key: "gender", label: "Gender" },
  { key: "emailId", label: "Email ID", type: "email" },
  { key: "residenceAddress", label: "Residence Address", multiline: true },
  { key: "permanentAddress", label: "Permanent Address", multiline: true },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "emergencyContactNumber", label: "Emergency Contact Number", type: "tel" },
  { key: "emergencyContactName", label: "Emergency Contact Name" },
]

const bankFields: FieldSpec[] = [
  { key: "nameAsPerBankRecord", label: "Name as per Bank Record" },
  { key: "bankAccountNo", label: "Bank A/C No" },
  { key: "bankName", label: "Bank Name" },
  { key: "branchName", label: "Branch Name" },
  { key: "branchAddress", label: "Branch Address", multiline: true },
  { key: "ifscCode", label: "IFSC Code" },
]

const statutoryFields: FieldSpec[] = [
  { key: "pfCode", label: "PF Code" },
  { key: "uanNo", label: "UAN No" },
  { key: "esicNo", label: "ESIC No" },
  { key: "aadhaarCardNo", label: "Aadhaar Card No" },
]

const termFields: FieldSpec[] = [
  { key: "shift", label: "Shift" },
  { key: "salary", label: "Salary", type: "number" },
  { key: "salaryRateInc", label: "Salary Rate Inc" },
  { key: "pfStatus", label: "PF Status" },
  { key: "esicStatus", label: "ESIC Status" },
]

function DetailFields({ record, fields, section }: {
  record: EmployeeDataRecord
  fields: FieldSpec[]
  section: "personal" | "term"
}) {
  const details = record[section] as Record<string, string>
  return <FormGrid>{fields.map((field) => <Field key={field.key}>
    <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
    {field.multiline ? <Textarea defaultValue={details[field.key]} id={field.key} maxLength={1000} name={field.key} rows={2} />
      : <Input defaultValue={details[field.key]} id={field.key} maxLength={1000} min={field.type === "number" ? "0" : undefined} name={field.key} step={field.type === "number" ? "0.01" : undefined} type={field.type ?? "text"} />}
  </Field>)}</FormGrid>
}

export default async function EmployeeDataPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const feedback = await searchParams
  await requireCapability(masterCapability("employee_assignments", "save"), `/hr/employees/${id}`)
  const connectionString = readAuthEnvironment().connectionString
  const recruitment = createRecruitmentRepository({ connectionString })
  const employeeData = createEmployeeDataRepository({ connectionString })
  let record: EmployeeDataRecord | null
  let increments: EmployeeIncrement[] = []
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    record = await employeeData.get(organizationId, id)
    if (record) increments = await employeeData.listIncrements(organizationId, record.employeeCode)
  } finally {
    await Promise.all([recruitment.close(), employeeData.close()])
  }
  if (!record) notFound()
  return <main className="grid min-w-0 gap-6">
    <Link className="inline-flex w-fit items-center gap-2 text-sm font-medium" href="/hr?panel=employeeDataPanel">
      <ArrowLeft className="size-4" /> Back to Employee Data
    </Link>
    <PageHeader title={`${record.employeeName} · Employee Data`} description={`Employee ID ${record.employeeCode} · ${record.postCode} · ${record.department ?? "Department not recorded"} · ${record.designation ?? "Designation not recorded"}`} />
    <p className="text-sm text-muted-foreground">Joined {formatCalendarDate(record.joinedOn ?? "date not recorded")}{record.endedOn ? ` · Left ${formatCalendarDate(record.endedOn)}` : " · Current term"}. Personal details follow this Employee ID; employment conditions are saved for this joined term.</p>
    {feedback.error ? <Alert variant="destructive"><AlertDescription>{feedback.error}</AlertDescription></Alert> : null}
    {feedback.success ? <Alert><AlertDescription>{feedback.success}</AlertDescription></Alert> : null}
    <form action={saveEmployeeDataAction} className="grid min-w-0 gap-5">
      <input name="assignment_id" type="hidden" value={record.assignmentId} />
      <FormSection title="Personal and Contact Details" description="These details remain available if this Employee ID rejoins.">
        <DetailFields fields={personalFields} record={record} section="personal" />
      </FormSection>
      <FormSection title="Bank Details">
        <DetailFields fields={bankFields} record={record} section="personal" />
      </FormSection>
      <FormSection title="Statutory Identifiers">
        <DetailFields fields={statutoryFields} record={record} section="personal" />
      </FormSection>
      <FormSection title="This Employment Term" description="Shift, pay and coverage status may differ on a later join.">
        <DetailFields fields={termFields} record={record} section="term" />
      </FormSection>
      <Button className="w-fit" type="submit">Save Employee Data</Button>
    </form>
    <IncrementsSection assignmentId={record.assignmentId} increments={increments} />
  </main>
}

function nextAprilFirst() {
  const today = istDateValue()
  const year = Number(today.slice(0, 4))
  return `${today >= `${year}-04-01` ? year + 1 : year}-04-01`
}

function IncrementsSection({ assignmentId, increments }: { assignmentId: string; increments: EmployeeIncrement[] }) {
  return <FormSection title="Salary Increments" description="Record an increment once it is confirmed with the employee. Increments stay with this Employee ID across role or department changes.">
    <div className="grid min-w-0 gap-5" id="increments">
      <form action={addEmployeeIncrementAction} className="grid min-w-0 gap-4">
        <input name="assignment_id" type="hidden" value={assignmentId} />
        <FormGrid>
          <Field>
            <FieldLabel htmlFor="increment_percent">Increment (%)</FieldLabel>
            <Input id="increment_percent" inputMode="decimal" max="500" min="0" name="increment_percent" required step="0.01" type="number" />
          </Field>
          <Field>
            <FieldLabel htmlFor="effective_on">Effective From</FieldLabel>
            <Input defaultValue={nextAprilFirst()} id="effective_on" name="effective_on" required type="date" />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="increment_note">Note</FieldLabel>
            <Textarea id="increment_note" maxLength={1000} name="note" placeholder="Anything agreed with the employee" rows={2} />
          </Field>
        </FormGrid>
        <Button className="w-fit" type="submit">Add Increment</Button>
      </form>
      {increments.length ? <OperationalTable filterStorageKey="hr-employee-increments" containerClassName="rounded-md border">
        <TableHeader><TableRow>
          <TableHead>Effective From</TableHead><TableHead>Increment</TableHead><TableHead>Note</TableHead>
          <TableHead>Recorded</TableHead><TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>{increments.map((increment) => <TableRow key={increment.id}>
          <TableCell>{formatCalendarDate(increment.effectiveOn)}</TableCell>
          <TableCell className="font-medium">{increment.incrementPercent}%</TableCell>
          <TableCell className="whitespace-pre-wrap">{increment.note || "—"}</TableCell>
          <TableCell>{formatCalendarDate(increment.recordedOn)}{increment.recordedBy ? ` · ${increment.recordedBy}` : ""}</TableCell>
          <TableCell className="text-right">
            <form action={deleteEmployeeIncrementAction}>
              <input name="assignment_id" type="hidden" value={assignmentId} />
              <input name="increment_id" type="hidden" value={increment.id} />
              <ConfirmSubmitButton confirmDescription="Use this only to remove a wrong entry." confirmLabel="Remove" confirmTitle={`Remove the ${increment.incrementPercent}% increment?`} size="sm" variant="destructive">
                <Trash2 data-icon="inline-start" /> Remove
              </ConfirmSubmitButton>
            </form>
          </TableCell>
        </TableRow>)}</TableBody>
      </OperationalTable> : <StandardState title="No Increments Recorded" description="Add one above when an increment is confirmed." />}
    </div>
  </FormSection>
}
