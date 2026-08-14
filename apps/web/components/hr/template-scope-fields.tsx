"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentMasterSnapshot,
} from "@workspace/db"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useState } from "react"

export function TemplateScopeFields({
  combinedRoles,
  defaultCombinedRoleId,
  defaultDepartmentCode,
  defaultDesignationCode,
  masters,
  prefix,
}: {
  combinedRoles: RecruitmentCombinedRoleRow[]
  defaultCombinedRoleId?: string | null
  defaultDepartmentCode?: string | null
  defaultDesignationCode?: string
  masters: RecruitmentMasterSnapshot
  prefix: string
}) {
  const [scope, setScope] = useState(
    defaultCombinedRoleId ? "combined" : "department"
  )
  const activeCombinedRoles = combinedRoles.filter(
    (role) => role.status === "Active" || role.id === defaultCombinedRoleId
  )

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${prefix}-scope`}>Template For</FieldLabel>
        <NativeSelect
          className="w-full"
          id={`${prefix}-scope`}
          onChange={(change) => setScope(change.target.value)}
          value={scope}
        >
          <NativeSelectOption value="department">
            Individual Department Job
          </NativeSelectOption>
          <NativeSelectOption value="combined">Combined Job</NativeSelectOption>
        </NativeSelect>
      </Field>
      {scope === "combined" ? (
        <Field>
          <FieldLabel htmlFor={`${prefix}-combined-role`}>
            Combined Job
          </FieldLabel>
          <NativeSelect
            className="w-full"
            defaultValue={defaultCombinedRoleId ?? ""}
            id={`${prefix}-combined-role`}
            name="combined_role_id"
            required
          >
            <NativeSelectOption value="">
              Select Combined Job
            </NativeSelectOption>
            {activeCombinedRoles.map((role) => (
              <NativeSelectOption key={role.id} value={role.id}>
                {role.vacancyCode} · {role.name} · Includes{" "}
                {role.postCodes.join(", ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            This Creates One Job Template For The Complete Combined Role.
          </FieldDescription>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor={`${prefix}-department`}>Department</FieldLabel>
          <NativeSelect
            className="w-full"
            defaultValue={defaultDepartmentCode ?? ""}
            id={`${prefix}-department`}
            name="department_code"
            required
          >
            <NativeSelectOption value="">Select Department</NativeSelectOption>
            {masters.departments.map((department) => (
              <NativeSelectOption key={department.id} value={department.code}>
                {department.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${prefix}-designation`}>Designation</FieldLabel>
        <NativeSelect
          className="w-full"
          defaultValue={defaultDesignationCode ?? ""}
          id={`${prefix}-designation`}
          name="designation_code"
          required
        >
          <NativeSelectOption value="">Select Designation</NativeSelectOption>
          {masters.designations.map((designation) => (
            <NativeSelectOption key={designation.id} value={designation.code}>
              {designation.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </>
  )
}
