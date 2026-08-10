"use client"

import type { CommercialMasterSnapshot } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useState } from "react"

import { upsertMasterAction } from "./actions"

const kinds = [
  ["materialGrade", "Material grade"],
  ["rodType", "Rod type"],
  ["machineType", "Machine type"],
  ["category", "Design category"],
  ["subcategory", "Design subcategory"],
  ["process", "Design process"],
  ["application", "Website application"],
  ["certification", "Website certification"],
  ["websiteField", "Website field option"],
  ["materialRate", "Material rate"],
  ["shippingTerm", "Shipping term"],
  ["packagingOption", "Packaging option"],
  ["commercialTerm", "Commercial term"],
  ["quoteTerm", "Quote PDF term"],
] as const

type MasterKind = (typeof kinds)[number][0]

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

function ActiveInput() {
  return (
    <Field>
      <FieldLabel htmlFor="master-active">State</FieldLabel>
      <NativeSelect
        className="w-full"
        defaultValue="true"
        id="master-active"
        name="active"
      >
        <NativeSelectOption value="true">Active</NativeSelectOption>
        <NativeSelectOption value="false">Inactive</NativeSelectOption>
      </NativeSelect>
    </Field>
  )
}

export function MasterMaintenanceForm({
  snapshot,
}: {
  snapshot: CommercialMasterSnapshot
}) {
  const [kind, setKind] = useState<MasterKind>("materialGrade")
  const isSimple = [
    "materialGrade",
    "rodType",
    "machineType",
    "process",
  ].includes(kind)

  return (
    <form action={upsertMasterAction} onReset={() => setKind("materialGrade")}>
      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="master-kind">Master</FieldLabel>
          <NativeSelect
            className="w-full"
            id="master-kind"
            name="kind"
            onChange={(event) => setKind(event.target.value as MasterKind)}
            value={kind}
          >
            {kinds.map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

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
            <NumberInput label="Alloy Premium (Inr/Kg)" name="alloy_premium" />
            <NumberInput label="Extrusion Cost (Inr/Kg)" name="ext_cost" />
            <ActiveInput />
          </>
        ) : null}

        {kind === "shippingTerm" ? (
          <>
            <NameInput />
            <NumberInput label="Shipping Cost" name="shipping_cost" />
            <ActiveInput />
          </>
        ) : null}

        {kind === "packagingOption" ? (
          <>
            <NameInput />
            <NumberInput label="Packing Cost" name="packing_cost" />
            <ActiveInput />
          </>
        ) : null}

        {kind === "commercialTerm" ? (
          <>
            <Field>
              <FieldLabel htmlFor="master-term-type">Type</FieldLabel>
              <NativeSelect
                className="w-full"
                id="master-term-type"
                name="term_type"
              >
                {[
                  "incoterms",
                  "payment_terms",
                  "shipment_mode",
                  "packaging_terms",
                ].map((termType) => (
                  <NativeSelectOption key={termType} value={termType}>
                    {termType.replaceAll("_", " ")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <NameInput label="Value" />
            <ActiveInput />
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
            <ActiveInput />
          </>
        ) : null}
      </FieldGroup>
      <Button className="mt-6" type="submit">
        Add Or Update Master
      </Button>
    </form>
  )
}
