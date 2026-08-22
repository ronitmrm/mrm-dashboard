"use client"

import { useRouter, useSearchParams } from "next/navigation"

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
import { masterSelectionFromContext } from "@/lib/master-module"

export function RecruitmentMasterKindSelect({
  kind,
  view,
}: {
  kind: RecruitmentMasterKind
  view: "dataEntry" | "masterTables"
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectionLocked = Boolean(masterSelectionFromContext(searchParams))

  if (view === "masterTables" || selectionLocked) return null

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
