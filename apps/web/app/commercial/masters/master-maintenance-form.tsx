"use client"

import type {
  CommercialMasterSnapshot,
  CommercialTermType,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useRouter } from "next/navigation"
import { useState } from "react"

import {
  commercialMasterKinds,
  commercialMasterSelection,
  commercialMasterViewHref,
  commercialMasterWorkspaceKind,
  type CommercialMasterEntryKind,
} from "@/lib/commercial-master-workspace"

import { upsertMasterAction } from "./actions"

const commercialTermTypes = [
  "buyer",
  "incoterms",
  "payment_terms",
  "shipment_mode",
  "packaging_terms",
] as const satisfies readonly CommercialTermType[]

function NumberInput({ label, name }: { label: string; name: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={`master-${name}`}>{label}</FieldLabel>
      <Input
        id={`master-${name}`}
        min="0"
        name={name}
        step="any"
        type="number"
      />
    </Field>
  )
}

function NameInput({ label = "Name" }: { label?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor="master-name">{label}</FieldLabel>
      <Input id="master-name" name="name" required />
    </Field>
  )
}

export function MasterMaintenanceForm({
  initialKind,
  initialTermType,
  selectionLocked = false,
  snapshot,
}: {
  initialKind: CommercialMasterEntryKind
  initialTermType?: CommercialTermType
  selectionLocked?: boolean
  snapshot: CommercialMasterSnapshot
}) {
  const router = useRouter()
  const [kind, setKind] = useState<CommercialMasterEntryKind>(initialKind)
  const [termType, setTermType] = useState<CommercialTermType | undefined>(
    initialTermType
  )
  const [workspaceKind, setWorkspaceKind] = useState(() =>
    commercialMasterWorkspaceKind(
      commercialMasterSelection(initialTermType ?? initialKind)
    )
  )
  const isSimple = [
    "materialGrade",
    "rodType",
    "machineType",
    "process",
  ].includes(kind)

  return (
    <form action={upsertMasterAction}>
      <input name="master_view" type="hidden" value="dataEntry" />
      <input name="kind" type="hidden" value={kind} />
      <input name="workspace_kind" type="hidden" value={workspaceKind} />
      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {!selectionLocked ? <Field>
          <FieldLabel htmlFor="master-kind">Master</FieldLabel>
          <NativeSelect
            className="w-full"
            id="master-kind"
            onChange={(event) => {
              const nextSelection = commercialMasterSelection(
                event.target.value
              )
              const nextWorkspaceKind =
                commercialMasterWorkspaceKind(nextSelection)
              setKind(nextSelection.entryKind)
              setTermType(
                "termType" in nextSelection
                  ? nextSelection.termType
                  : undefined
              )
              setWorkspaceKind(nextWorkspaceKind)
              router.replace(
                commercialMasterViewHref("dataEntry", nextWorkspaceKind),
                { scroll: false }
              )
            }}
            value={workspaceKind}
          >
            {commercialMasterKinds.map((option) => {
              const optionKind = commercialMasterWorkspaceKind(option)
              return (
                <NativeSelectOption key={optionKind} value={optionKind}>
                {option.label}
                </NativeSelectOption>
              )
            })}
          </NativeSelect>
        </Field> : null}

        {isSimple ? <NameInput /> : null}

        {kind === "category" ? (
          <>
            <NameInput label="Category" />
            <Field>
              <FieldLabel htmlFor="master-code">Category Code</FieldLabel>
              <Input id="master-code" name="code" />
            </Field>
          </>
        ) : null}

        {kind === "subcategory" ? (
          <>
            <Field>
              <FieldLabel htmlFor="master-category">Category</FieldLabel>
              <NativeSelect
                className="w-full"
                id="master-category"
                name="category"
                required
              >
                <NativeSelectOption value="">
                  Select Category
                </NativeSelectOption>
                {snapshot.categories.map((category) => (
                  <NativeSelectOption key={category.name} value={category.name}>
                    {category.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <NameInput label="Subcategory" />
            <Field>
              <FieldLabel htmlFor="master-combination-code">
                Combination Code
              </FieldLabel>
              <Input id="master-combination-code" name="combination_code" />
            </Field>
          </>
        ) : null}

        {kind === "application" || kind === "certification" ? (
          <>
            <NameInput />
            <NumberInput label="Sort Order" name="sort_order" />
          </>
        ) : null}

        {kind === "websiteField" ? (
          <>
            <Field>
              <FieldLabel htmlFor="master-field-type">Field</FieldLabel>
              <NativeSelect
                className="w-full"
                id="master-field-type"
                name="field_type"
              >
                {[
                  "material",
                  "connections",
                  "pressure",
                  "temperature",
                  "sealant",
                ].map((fieldType) => (
                  <NativeSelectOption key={fieldType} value={fieldType}>
                    {fieldType}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <NameInput label="Dropdown Value" />
            <NumberInput label="Sort Order" name="sort_order" />
          </>
        ) : null}

        {kind === "materialRate" ? (
          <>
            <Field>
              <FieldLabel htmlFor="master-grade">Grade</FieldLabel>
              <NativeSelect
                className="w-full"
                id="master-grade"
                name="grade"
                required
              >
                <NativeSelectOption value="">Select Grade</NativeSelectOption>
                {snapshot.materialGrades.map((grade) => (
                  <NativeSelectOption key={grade.name} value={grade.name}>
                    {grade.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="master-rod-type">Rod Type</FieldLabel>
              <NativeSelect
                className="w-full"
                id="master-rod-type"
                name="rod_type"
                required
              >
                <NativeSelectOption value="">
                  Select Rod Type
                </NativeSelectOption>
                {snapshot.rodTypes.map((rodType) => (
                  <NativeSelectOption key={rodType.name} value={rodType.name}>
                    {rodType.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <NumberInput
              label="Alloy Premium (Inr/Kg, blank = market based)"
              name="alloy_premium"
            />
            <NumberInput label="Extrusion Cost (Inr/Kg)" name="ext_cost" />
          </>
        ) : null}

        {kind === "shippingTerm" ? (
          <>
            <NameInput />
            <NumberInput label="Shipping Cost" name="shipping_cost" />
          </>
        ) : null}

        {kind === "packagingOption" ? (
          <>
            <NameInput />
            <NumberInput label="Packing Cost" name="packing_cost" />
          </>
        ) : null}

        {kind === "commercialTerm" ? (
          <>
            {termType ? (
              <input name="term_type" type="hidden" value={termType} />
            ) : (
              <Field>
                <FieldLabel htmlFor="master-term-type">Type</FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="master-term-type"
                  name="term_type"
                >
                  {commercialTermTypes.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <NameInput label="Value" />
          </>
        ) : null}

        {kind === "quoteTerm" ? (
          <>
            <Field>
              <FieldLabel htmlFor="master-term-key">Key</FieldLabel>
              <Input id="master-term-key" name="term_key" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="master-label">Label</FieldLabel>
              <Input id="master-label" name="label" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="master-value">Value</FieldLabel>
              <Input id="master-value" name="value" required />
            </Field>
            <NumberInput label="Sort Order" name="sort_order" />
          </>
        ) : null}
      </FieldGroup>
      <Button className="mt-6" type="submit">
        Add Or Update {commercialMasterSelection(workspaceKind).label}
      </Button>
    </form>
  )
}
