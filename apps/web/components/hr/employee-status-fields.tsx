"use client"

import { useState } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

export function EmployeeStatusFields() {
  const [event, setEvent] = useState("Appointed")
  return (
    <>
      <Field>
        <FieldLabel htmlFor="employee-event">Employment event</FieldLabel>
        <NativeSelect
          className="w-full"
          id="employee-event"
          name="employee_event"
          onChange={(change) => setEvent(change.target.value)}
          required
          value={event}
        >
          <NativeSelectOption value="Appointed">
            Appointed — not joined
          </NativeSelectOption>
          <NativeSelectOption value="Joined">
            Joined — becomes Occupied
          </NativeSelectOption>
          <NativeSelectOption value="Resigned">Resigned</NativeSelectOption>
          <NativeSelectOption value="Removed">
            Remove assignment — becomes Vacant
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      {event === "Resigned" ? (
        <Field>
          <FieldLabel htmlFor="last-working-date">Last working date</FieldLabel>
          <Input
            id="last-working-date"
            name="last_working_date"
            required
            type="date"
          />
          <p className="text-xs text-muted-foreground">
            The approved post becomes vacant after this date.
          </p>
        </Field>
      ) : null}
    </>
  )
}
