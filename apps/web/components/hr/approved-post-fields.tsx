"use client"

import { nextRecruitmentPostIdentity } from "@workspace/db/recruitment-codes"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useState } from "react"

type MasterOption = {
  code: string
  id: string
  name: string
}

type TemplateOption = {
  id: string
  name: string
  templateCode: string
}

export function ApprovedPostFields({
  departments,
  designations,
  existingPostCodes,
  templates,
}: {
  departments: MasterOption[]
  designations: MasterOption[]
  existingPostCodes: string[]
  templates: TemplateOption[]
}) {
  const [departmentCode, setDepartmentCode] = useState("")
  const [designationCode, setDesignationCode] = useState("")
  const identity = nextRecruitmentPostIdentity({
    departmentCode,
    designationCode,
    existingPostCodes,
  })

  return (
    <>
      <Field>
        <FieldLabel htmlFor="post-department">Department</FieldLabel>
        <NativeSelect
          className="w-full"
          id="post-department"
          name="department_code"
          onChange={(event) => setDepartmentCode(event.target.value)}
          required
          value={departmentCode}
        >
          <NativeSelectOption value="">Select department</NativeSelectOption>
          {departments.map((department) => (
            <NativeSelectOption key={department.id} value={department.code}>
              {department.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="post-designation">Designation</FieldLabel>
        <NativeSelect
          className="w-full"
          id="post-designation"
          name="designation_code"
          onChange={(event) => setDesignationCode(event.target.value)}
          required
          value={designationCode}
        >
          <NativeSelectOption value="">Select designation</NativeSelectOption>
          {designations.map((designation) => (
            <NativeSelectOption key={designation.id} value={designation.code}>
              {designation.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="post-template">Job template</FieldLabel>
        <NativeSelect
          className="w-full"
          id="post-template"
          name="requirement_template_code"
        >
          <NativeSelectOption value="">No template</NativeSelectOption>
          {templates.map((template) => (
            <NativeSelectOption key={template.id} value={template.templateCode}>
              {template.templateCode} · {template.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="generated-post-code">
          Post code (auto-generated)
        </FieldLabel>
        <Input
          id="generated-post-code"
          placeholder="Select department and designation"
          readOnly
          value={identity?.postCode ?? ""}
        />
      </Field>
    </>
  )
}
