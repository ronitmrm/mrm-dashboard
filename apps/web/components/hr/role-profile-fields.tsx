"use client"
import { useId } from "react"
import {
  roleProfileFields,
  type RecruitmentRoleProfile,
} from "@workspace/db/recruitment-role-profile"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
export function RoleProfileFields({
  profile = {},
}: {
  profile?: RecruitmentRoleProfile
}) {
  const prefix = useId()
  return roleProfileFields.map((field) => (
    <Field
      key={field.key}
      className="col-span-full"
    >
      <FieldLabel htmlFor={`${prefix}-${field.key}`}>{field.label}</FieldLabel>
      <Textarea
        id={`${prefix}-${field.key}`}
        name={`role_${field.key}`}
        defaultValue={profile[field.key] ?? ""}
        maxLength={4000}
        rows={3}
      />
      <FieldDescription>{field.help}</FieldDescription>
    </Field>
  ))
}
