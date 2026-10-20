"use client"

import type { RecruitmentPostRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { TimeInput } from "@workspace/ui/components/time-input"
import { FilePlus2 } from "lucide-react"
import { useId } from "react"

import { generateEmploymentLetterAction } from "@/app/hr/actions"
import {
  FormGrid,
  StandardDialogContent,
} from "@/components/ui/golden-patterns"

type EmployeeLetterFormProps = {
  post: Pick<
    RecruitmentPostRow,
    "id" | "employeeName" | "employeeCode" | "designation"
  >
  type: "appointment" | "experience"
  returnPanel?: "employeeMasterPanel" | "probationRemindersPanel"
  probationCompletedOn?: string | null
}

export function EmployeeLetterDialog({
  post,
  type,
}: Pick<EmployeeLetterFormProps, "post" | "type">) {
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

export function EmployeeLetterForm({
  post,
  type,
  returnPanel = "employeeMasterPanel",
  probationCompletedOn,
}: EmployeeLetterFormProps) {
  const id = useId()
  const appointment = type === "appointment"

  return (
    <form action={generateEmploymentLetterAction} className="grid gap-4">
      <input name="panel" type="hidden" value={returnPanel} />
      <input name="post_id" type="hidden" value={post.id} />
      <input name="letter_type" type="hidden" value={type} />
      <FormGrid className="xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-issued-on`}>Letter Date</FieldLabel>
          <Input
            id={`${id}-issued-on`}
            name="letter_issued_on"
            required
            type="date"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-location`}>Work Location</FieldLabel>
          <Input id={`${id}-location`} name="work_location" required />
        </Field>
      </FormGrid>
      {appointment ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-address`}>
              Employee Postal Address
            </FieldLabel>
            <Textarea
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
                id={`${id}-probation-unit`}
                name="probation_unit"
                required
              >
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
                defaultValue={probationCompletedOn ?? ""}
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
                id={`${id}-duty-start`}
                name="duty_start_time"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-duty-end`}>Duty End Time</FieldLabel>
              <TimeInput
                aria-label="Duty end time"
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
              defaultValue="60"
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
              <Input id={`${id}-reports-to`} name="reports_to" required />
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
            defaultValue="Ankit Khattar"
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
            id={`${id}-signatory-designation`}
            name="letter_signatory_designation"
            required
          />
        </Field>
      </FormGrid>
      <DialogFooter>
        <Button type="submit">Generate And Store Letter</Button>
      </DialogFooter>
    </form>
  )
}
