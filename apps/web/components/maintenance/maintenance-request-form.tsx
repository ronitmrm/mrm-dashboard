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
  department,
  requesterName,
}: {
  department: string
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
            <Field>
              <FieldLabel htmlFor="maintenance-department">
                Department
              </FieldLabel>
              <Input id="maintenance-department" readOnly value={department} />
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
