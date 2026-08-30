"use client"

import type { RecruitmentPostRow } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { FilePlus2 } from "lucide-react"
import { useId } from "react"

import { generateEmploymentLetterAction } from "@/app/hr/actions"

export function EmployeeLetterDialog({
  post,
  type,
}: {
  post: RecruitmentPostRow
  type: "appointment" | "experience"
}) {
  const id = useId()
  const appointment = type === "appointment"

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <FilePlus2 data-icon="inline-start" />
          Generate {appointment ? "Appointment" : "Experience"} Letter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Generate {appointment ? "Appointment" : "Experience"} Letter
          </DialogTitle>
          <DialogDescription>
            {post.employeeName} · {post.employeeCode} · {post.designation}. The
            Employee Master details are locked into the generated PDF.
          </DialogDescription>
        </DialogHeader>
        <form action={generateEmploymentLetterAction} className="grid gap-4">
          <input name="panel" type="hidden" value="employeeMasterPanel" />
          <input name="post_id" type="hidden" value={post.id} />
          <input name="letter_type" type="hidden" value={type} />
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          {appointment ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${id}-probation-completed`}>
                    Probation Completed On
                  </FieldLabel>
                  <Input
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
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <FieldLabel htmlFor={`${id}-reports-to`}>
                    Reports To
                  </FieldLabel>
                  <Input id={`${id}-reports-to`} name="reports_to" required />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    <NativeSelectOption value="he-him">
                      He / Him
                    </NativeSelectOption>
                    <NativeSelectOption value="they-them">
                      They / Them
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
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
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          <DialogFooter>
            <Button type="submit">Generate And Store Letter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
