import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import type { StoreRequestFormPolicy } from "@/lib/store-request-policy"

export function StoreRequestIdentityFields({
  policy,
}: {
  policy: StoreRequestFormPolicy
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="request-department">Department</FieldLabel>
        {policy.departmentLocked ? (
          <Input
            id="request-department"
            name="department"
            readOnly
            value={policy.departmentValue}
          />
        ) : policy.departmentOptions.length ? (
          <NativeSelect
            defaultValue=""
            id="request-department"
            name="department"
            required
          >
            <NativeSelectOption disabled value="">
              Select your department
            </NativeSelectOption>
            {policy.departmentOptions.map((department) => (
              <NativeSelectOption key={department} value={department}>
                {department}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <Input
            disabled
            id="request-department"
            value="Employee link required"
          />
        )}
        {!policy.departmentOptions.length ? (
          <p className="text-xs text-destructive">
            Ask an administrator to link this account to Employee Master.
          </p>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="request-requested-by">
          Requested By / Signed-in ID
        </FieldLabel>
        <Input
          id="request-requested-by"
          readOnly
          value={policy.requestedBy}
        />
      </Field>
    </>
  )
}
