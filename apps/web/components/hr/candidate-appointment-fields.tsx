"use client"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useId, useState } from "react"

export function CandidateAppointmentFields({
  defaultJoiningDate = "",
}: {
  defaultJoiningDate?: string
}) {
  const fieldId = useId()
  const [willingToJoin, setWillingToJoin] = useState("")

  return (
    <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4">
      <div>
        <p className="font-medium">Appointment Confirmation</p>
        <p className="text-sm text-muted-foreground">
          Confirm The Candidate&apos;s Willingness Before Creating The
          Appointment.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor={`${fieldId}-willing-to-join`}>
          Is The Candidate Willing To Join?
        </FieldLabel>
        <NativeSelect
          className="w-full"
          id={`${fieldId}-willing-to-join`}
          name="willing_to_join"
          onChange={(event) => setWillingToJoin(event.target.value)}
          required
          value={willingToJoin}
        >
          <NativeSelectOption value="">Select Yes Or No</NativeSelectOption>
          <NativeSelectOption value="yes">Yes</NativeSelectOption>
          <NativeSelectOption value="no">No</NativeSelectOption>
        </NativeSelect>
      </Field>

      {willingToJoin === "yes" ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-joining-date`}>
              Joining Date
            </FieldLabel>
            <Input
              defaultValue={defaultJoiningDate}
              id={`${fieldId}-joining-date`}
              name="joining_date"
              required
              type="date"
            />
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-4 rounded-xl border bg-background p-4">
              <div>
                <p className="font-medium">Before Probation</p>
                <p className="text-xs text-muted-foreground">
                  Enter One Fixed Monthly Salary.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-salary-before`}>
                  Fixed Salary (₹)
                </FieldLabel>
                <Input
                  id={`${fieldId}-salary-before`}
                  inputMode="decimal"
                  min="1"
                  name="salary_before_probation"
                  placeholder="15000"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
            </div>
            <div className="grid gap-4 rounded-xl border bg-background p-4">
              <div>
                <p className="font-medium">After Probation</p>
                <p className="text-xs text-muted-foreground">
                  Enter The Monthly Salary Range.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-salary-after-min`}>
                    Minimum (₹)
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-salary-after-min`}
                    inputMode="decimal"
                    min="1"
                    name="salary_after_probation_minimum"
                    placeholder="15000"
                    required
                    step="0.01"
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-salary-after-max`}>
                    Maximum (₹)
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-salary-after-max`}
                    inputMode="decimal"
                    min="1"
                    name="salary_after_probation_maximum"
                    placeholder="20000"
                    required
                    step="0.01"
                    type="number"
                  />
                </Field>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
