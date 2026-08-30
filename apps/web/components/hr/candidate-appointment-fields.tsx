"use client"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
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
          <div className="grid gap-4">
            <div className="grid min-w-0 gap-4 rounded-xl border bg-background p-4">
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
                  className="w-full"
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
            <div className="grid min-w-0 gap-4 rounded-xl border bg-background p-4">
              <div>
                <p className="font-medium">After Probation</p>
                <p className="text-xs text-muted-foreground">
                  Enter The Monthly Salary Range.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="min-w-0">
                  <FieldLabel htmlFor={`${fieldId}-salary-after-min`}>
                    Minimum (₹)
                  </FieldLabel>
                  <Input
                    className="w-full"
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
                <Field className="min-w-0">
                  <FieldLabel htmlFor={`${fieldId}-salary-after-max`}>
                    Maximum (₹)
                  </FieldLabel>
                  <Input
                    className="w-full"
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
          <div className="grid gap-4 rounded-xl border bg-background p-4">
            <div>
              <p className="font-medium">Offer Letter Details</p>
              <p className="text-xs text-muted-foreground">
                These Values Are Retained With The Generated Offer Letter.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-offer-issued-on`}>
                  Offer Letter Date
                </FieldLabel>
                <Input
                  id={`${fieldId}-offer-issued-on`}
                  name="offer_issued_on"
                  required
                  type="date"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-offer-pay-period`}>
                  Salary Period
                </FieldLabel>
                <NativeSelect
                  defaultValue="month"
                  id={`${fieldId}-offer-pay-period`}
                  name="offer_pay_period"
                  required
                >
                  <NativeSelectOption value="month">
                    Per Month
                  </NativeSelectOption>
                  <NativeSelectOption value="day">Per Day</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-offer-address`}>
                Candidate Postal Address
              </FieldLabel>
              <Textarea
                id={`${fieldId}-offer-address`}
                name="offer_postal_address"
                placeholder="House / Street&#10;City, District&#10;State - PIN"
                required
                rows={3}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-probation-length`}>
                  Probation Period
                </FieldLabel>
                <Input
                  id={`${fieldId}-probation-length`}
                  min="1"
                  name="offer_probation_length"
                  required
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-probation-unit`}>
                  Probation Unit
                </FieldLabel>
                <NativeSelect
                  defaultValue="months"
                  id={`${fieldId}-probation-unit`}
                  name="offer_probation_unit"
                  required
                >
                  <NativeSelectOption value="months">Months</NativeSelectOption>
                  <NativeSelectOption value="days">Days</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-offer-signatory`}>
                  Signatory Name
                </FieldLabel>
                <Input
                  defaultValue="Ankit Khattar"
                  id={`${fieldId}-offer-signatory`}
                  name="offer_signatory_name"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-offer-signatory-designation`}>
                  Signatory Designation
                </FieldLabel>
                <Input
                  id={`${fieldId}-offer-signatory-designation`}
                  name="offer_signatory_designation"
                  required
                />
              </Field>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
