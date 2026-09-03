import { Camera, Send } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { submitMaintenanceRequestAction } from "@/app/maintenance/actions"

export function MaintenanceRequestForm({
  departments,
  isSystemAdministrator,
  requesterName,
}: {
  departments: readonly string[]
  isSystemAdministrator: boolean
  requesterName: string
}) {
  return (
    <SectionCard>
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle>New Maintenance Request</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={submitMaintenanceRequestAction}
          className="grid gap-4"
          encType="multipart/form-data"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="maintenance-requester">Requester</FieldLabel>
              <Input
                id="maintenance-requester"
                readOnly
                value={requesterName}
              />
            </Field>
            <Field className="relative min-w-0">
              <FieldLabel htmlFor="maintenance-department">
                Department
              </FieldLabel>
              {departments.length === 1 ? (
                <Input
                  id="maintenance-department"
                  name="department"
                  readOnly
                  value={departments[0]}
                />
              ) : (
                <NativeSelect
                  aria-label="Department"
                  aria-describedby="maintenance-department-help"
                  className="w-full"
                  defaultValue=""
                  id="maintenance-department"
                  name="department"
                  required
                >
                  <NativeSelectOption value="">
                    Select a department
                  </NativeSelectOption>
                  {departments.map((department) => (
                    <NativeSelectOption key={department} value={department}>
                      {department}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              <FieldDescription id="maintenance-department-help">
                {isSystemAdministrator
                  ? "System Administrator: choose an active department."
                  : departments.length === 1
                    ? "From your active Employee Master assignment."
                    : "Choose from your active Employee Master departments."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-location">Location</FieldLabel>
              <Input id="maintenance-location" name="location" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-category">
                Suggested Category
              </FieldLabel>
              <NativeSelect
                className="w-full"
                defaultValue="Mechanical"
                id="maintenance-category"
                name="suggested_category"
                required
              >
                <NativeSelectOption value="Electrical">
                  Electrical
                </NativeSelectOption>
                <NativeSelectOption value="Plumbing">
                  Plumbing
                </NativeSelectOption>
                <NativeSelectOption value="Mechanical">
                  Mechanical
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                The Maintenance Manager confirms the final trade.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-priority">
                Requested Priority
              </FieldLabel>
              <NativeSelect
                className="w-full"
                defaultValue="Regular"
                id="maintenance-priority"
                name="requested_priority"
                required
              >
                <NativeSelectOption value="Urgent">Urgent</NativeSelectOption>
                <NativeSelectOption value="Regular">Regular</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-photos">
                <Camera aria-hidden="true" className="size-4" /> Photos
              </FieldLabel>
              <Input
                accept="image/png,image/jpeg"
                id="maintenance-photos"
                multiple
                name="photos"
                type="file"
              />
              <FieldDescription>
                Up to 8 PNG/JPEG photos, 10 MB each.
              </FieldDescription>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="maintenance-problem">
              Problem Description
            </FieldLabel>
            <Textarea
              id="maintenance-problem"
              name="problem_description"
              required
              rows={4}
            />
          </Field>
          <Button className="w-fit" type="submit">
            <Send aria-hidden="true" className="size-4" /> Submit Request
          </Button>
        </form>
      </CardContent>
    </SectionCard>
  )
}
