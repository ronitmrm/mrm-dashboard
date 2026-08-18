"use client"

import { useRouter } from "next/navigation"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import {
  normalizeRecruitmentMasterKind,
  recruitmentMasterHref,
  type RecruitmentMasterKind,
} from "@/lib/recruitment-master-navigation"

export function RecruitmentMasterKindSelect({
  kind,
  view,
}: {
  kind: RecruitmentMasterKind
  view: "dataEntry" | "masterTables"
}) {
  const router = useRouter()

  return (
    <Field className="max-w-md">
      <FieldLabel htmlFor="hr-master-kind">Master</FieldLabel>
      <NativeSelect
        className="w-full"
        id="hr-master-kind"
        onChange={(event) => {
          router.push(
            recruitmentMasterHref(
              view,
              normalizeRecruitmentMasterKind(event.target.value)
            )
          )
        }}
        value={kind}
      >
        <NativeSelectOption value="department">Department</NativeSelectOption>
        <NativeSelectOption value="designation">Designation</NativeSelectOption>
      </NativeSelect>
    </Field>
  )
}
