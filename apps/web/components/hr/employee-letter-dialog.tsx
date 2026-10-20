"use client"

import type {
  AppointmentLetterDetails,
  RecruitmentEmploymentLetterRow,
  RecruitmentPostRow,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { TimeInput } from "@workspace/ui/components/time-input"
import { FilePlus2, Pencil } from "lucide-react"
import { useId } from "react"

import {
  generateEmploymentLetterAction,
  reviseAppointmentLetterAction,
} from "@/app/hr/actions"
import {
  FormGrid,
  StandardDialogContent,
} from "@/components/ui/golden-patterns"

type EmployeeLetterPost = Pick<
    RecruitmentPostRow,
    "id" | "employeeName" | "employeeCode" | "designation"
  >

type EmployeeLetterFormProps = {
  returnPanel?: "employeeMasterPanel" | "probationRemindersPanel"
  probationCompletedOn?: string | null
} & (
  | { post: EmployeeLetterPost; type: "appointment" | "experience"; appointmentLetter?: never }
  | { post?: never; type: "appointment"; appointmentLetter: RecruitmentEmploymentLetterRow }
)

export function EmployeeLetterDialog({
  post,
  type,
}: { post: EmployeeLetterPost; type: "appointment" | "experience" }) {
  const appointment = type === "appointment"

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <FilePlus2 data-icon="inline-start" />
          Generate {appointment ? "Appointment" : "Experience"} Letter
        </Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        title={`Generate ${appointment ? "Appointment" : "Experience"} Letter`}
        description={`${post.employeeName} · ${post.employeeCode} · ${post.designation}. The Employee Master details are locked into the generated PDF.`}
      >
        <EmployeeLetterForm post={post} type={type} />
      </StandardDialogContent>
    </Dialog>
  )
}

export function AppointmentLetterEditDialog({
  letter,
  returnPanel = "employeeMasterPanel",
}: {
  letter: RecruitmentEmploymentLetterRow
  returnPanel?: EmployeeLetterFormProps["returnPanel"]
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil data-icon="inline-start" />
          Edit & Regenerate
        </Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        title="Edit Appointment Letter"
        description={`${letter.employeeName} · ${letter.referenceNumber} · ${letter.designation}. The previous PDF remains available in letter history.`}
      >
        <EmployeeLetterForm
          appointmentLetter={letter}
          returnPanel={returnPanel}
          type="appointment"
        />
      </StandardDialogContent>
    </Dialog>
  )
}

export function EmployeeLetterForm({
  post,
  type,
  returnPanel = "employeeMasterPanel",
  probationCompletedOn,
  appointmentLetter,
}: EmployeeLetterFormProps) {
  const id = useId()
  const appointment = type === "appointment"

  function detail(key: keyof AppointmentLetterDetails) {
    const value = appointmentLetter?.details[key]
    return typeof value === "string" || typeof value === "number" ? value : ""
  }

  return (
    <form
      action={appointmentLetter ? reviseAppointmentLetterAction : generateEmploymentLetterAction}
      className="grid gap-4"
    >
      <input name="panel" type="hidden" value={returnPanel} />
      {post ? <input name="post_id" type="hidden" value={post.id} /> : null}
      {appointmentLetter ? (
        <>
          <input name="previous_letter_id" type="hidden" value={appointmentLetter.id} />
          <p className="text-sm text-muted-foreground">
            Review the saved details and complete any blank fields required by the new format.
          </p>
        </>
      ) : null}
      <input name="letter_type" type="hidden" value={type} />
      <FormGrid className="xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-issued-on`}>Letter Date</FieldLabel>
          <Input
            defaultValue={appointmentLetter?.issuedOn ?? ""}
            id={`${id}-issued-on`}
            name="letter_issued_on"
            required
            type="date"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-location`}>Work Location</FieldLabel>
          <Input defaultValue={detail("workLocation")} id={`${id}-location`} name="work_location" required />
        </Field>
      </FormGrid>
      {appointment ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-address`}>
              Employee Postal Address
            </FieldLabel>
            <Textarea
              defaultValue={detail("postalAddress")}
              id={`${id}-address`}
              name="postal_address"
              placeholder="House / Street&#10;City, District&#10;State - PIN"
              required
              rows={3}
            />
          </Field>
          <FormGrid className="xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-probation-length`}>
                Probation Period
              </FieldLabel>
              <Input
                defaultValue={detail("probationLength")}
                id={`${id}-probation-length`}
                min="1"
                name="probation_length"
                required
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-probation-unit`}>
                Probation Unit
              </FieldLabel>
              <NativeSelect
                defaultValue={appointmentLetter ? String(detail("probationUnit")) : "months"}
                id={`${id}-probation-unit`}
                name="probation_unit"
                required
              >
                {appointmentLetter ? <NativeSelectOption value="">Select Unit</NativeSelectOption> : null}
                <NativeSelectOption value="months">Months</NativeSelectOption>
                <NativeSelectOption value="days">Days</NativeSelectOption>
              </NativeSelect>
            </Field>
          </FormGrid>
          <FormGrid className="xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-probation-completed`}>
                Probation Completed On
              </FieldLabel>
              <Input
                defaultValue={appointmentLetter ? detail("probationCompletedOn") : probationCompletedOn ?? ""}
                id={`${id}-probation-completed`}
                name="probation_completed_on"
                required
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-effective-date`}>
                Confirmation Effective Date
              </FieldLabel>
              <Input
                defaultValue={detail("confirmationEffectiveDate")}
                id={`${id}-effective-date`}
                name="confirmation_effective_date"
                required
                type="date"
              />
            </Field>
          </FormGrid>
          <FormGrid className="xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-duty-start`}>
                Duty Start Time
              </FieldLabel>
              <TimeInput
                aria-label="Duty start time"
                defaultValue={String(detail("dutyStartTime"))}
                id={`${id}-duty-start`}
                name="duty_start_time"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-duty-end`}>Duty End Time</FieldLabel>
              <TimeInput
                aria-label="Duty end time"
                defaultValue={String(detail("dutyEndTime"))}
                id={`${id}-duty-end`}
                name="duty_end_time"
                required
              />
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel htmlFor={`${id}-weekly-hours`}>
              Minimum Weekly Working Hours
            </FieldLabel>
            <Input
              defaultValue={appointmentLetter ? detail("minimumWeeklyHours") : "60"}
              id={`${id}-weekly-hours`}
              min="0.01"
              name="minimum_weekly_hours"
              required
              step="0.01"
              type="number"
            />
          </Field>
          <FormGrid className="xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-salary`}>
                Gross Monthly Salary (₹)
              </FieldLabel>
              <Input
                defaultValue={detail("grossMonthlySalary")}
                id={`${id}-salary`}
                min="1"
                name="gross_monthly_salary"
                required
                step="0.01"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-reports-to`}>Reports To</FieldLabel>
              <Input defaultValue={detail("reportsTo")} id={`${id}-reports-to`} name="reports_to" required />
            </Field>
          </FormGrid>
        </>
      ) : (
        <>
          <FormGrid className="xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
              <NativeSelect id={`${id}-title`} name="title" required>
                <NativeSelectOption value="Ms.">Ms.</NativeSelectOption>
                <NativeSelectOption value="Mr.">Mr.</NativeSelectOption>
                <NativeSelectOption value="Mx.">Mx.</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-pronouns`}>Pronouns</FieldLabel>
              <NativeSelect id={`${id}-pronouns`} name="pronouns" required>
                <NativeSelectOption value="she-her">
                  She / Her
                </NativeSelectOption>
                <NativeSelectOption value="he-him">He / Him</NativeSelectOption>
                <NativeSelectOption value="they-them">
                  They / Them
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel htmlFor={`${id}-responsibilities`}>
              Key Responsibilities Or Functions
            </FieldLabel>
            <Textarea
              id={`${id}-responsibilities`}
              name="key_responsibilities"
              required
              rows={4}
            />
          </Field>
        </>
      )}
      <FormGrid className="xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-signatory-name`}>
            Signatory Name
          </FieldLabel>
          <Input
            defaultValue={appointmentLetter ? detail("signatoryName") : "Ankit Khattar"}
            id={`${id}-signatory-name`}
            name="letter_signatory_name"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-signatory-designation`}>
            Signatory Designation
          </FieldLabel>
          <Input
            defaultValue={detail("signatoryDesignation")}
            id={`${id}-signatory-designation`}
            name="letter_signatory_designation"
            required
          />
        </Field>
      </FormGrid>
      {appointmentLetter ? (
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason For Revision</FieldLabel>
          <Textarea id={`${id}-reason`} name="reason" required rows={2} />
          <FieldDescription>Saved in the audit history with the regenerated letter.</FieldDescription>
        </Field>
      ) : null}
      <DialogFooter>
        <Button type="submit">{appointmentLetter ? "Save & Regenerate Appointment Letter" : "Generate And Store Letter"}</Button>
      </DialogFooter>
    </form>
  )
}
