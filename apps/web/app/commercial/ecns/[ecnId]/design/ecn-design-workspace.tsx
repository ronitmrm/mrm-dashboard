"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"

import { EcnBomEditor } from "../../../revisions/ecn-bom-editor"

type Dossier = {
  attachments?: Array<{ fileName: string; href: string; purpose: string }>
  bomLines: Array<{
    category: string | null
    componentItemId: string
    description: string
    itemType: string
    notes: string | null
    quantity: number
    subcategory: string | null
    uid: string
  }>
  casting: number
  category: string | null
  checkedBy: string | null
  description: string
  designBomCompleted: string
  designRemarks: string | null
  designerName: string | null
  dieCode: string | null
  ecnNumber: string
  fixtureApproxCost: number
  fixtureRequired: string
  gaugesRequired: string
  id: string
  inspectionApproxCost: number
  itemId: string
  itemType: string
  itemUid: string
  materialGradeId: string | null
  operationNotes: string | null
  productionType: string | null
  productSize: string | null
  reason: string
  remarks: string | null
  rodSize: string | null
  rodTypeId: string | null
  status: string
  subcategory: string | null
  targetCompletionDate: string | null
  toolingApproxCost: number
  toolingRequired: string
  weight100Pcs: number
}

type ProductOption = {
  category?: string | null
  description: string
  id: string
  subcategory?: string | null
  uid: string
}

type NamedOption = { id: string; name: string }

const sections = [
  ["product", "Product Details"],
  ["bom", "BOM"],
  ["files", "Files"],
  ["controls", "Design Controls"],
] as const

type Section = (typeof sections)[number][0]

function YesNoField({
  defaultValue,
  label,
  name,
}: {
  defaultValue: string
  label: string
  name: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <NativeSelect defaultValue={defaultValue} name={name}>
        <NativeSelectOption value="No">No</NativeSelectOption>
        <NativeSelectOption value="Yes">Yes</NativeSelectOption>
      </NativeSelect>
    </Field>
  )
}

export function EcnDesignWorkspace({
  dossier,
  materialGrades = [],
  products,
  rodTypes = [],
}: {
  dossier: Dossier
  materialGrades?: NamedOption[]
  products: ProductOption[]
  rodTypes?: NamedOption[]
}) {
  const [activeSection, setActiveSection] = useState<Section>("product")

  return (
    <div className="grid gap-6">
      <div
        aria-label="ECN design sections"
        className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-2 md:grid-cols-4"
        role="tablist"
      >
        {sections.map(([id, label]) => (
          <Button
            aria-selected={activeSection === id}
            key={id}
            onClick={() => setActiveSection(id)}
            role="tab"
            type="button"
            variant={activeSection === id ? "default" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </div>

      <section hidden={activeSection !== "product"} role="tabpanel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel>Product UID</FieldLabel>
            <Input readOnly value={dossier.itemUid} />
          </Field>
          <Field>
            <FieldLabel>Designer</FieldLabel>
            <Input
              defaultValue={dossier.designerName ?? ""}
              name="designer_name"
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Product Name</FieldLabel>
            <Input
              defaultValue={dossier.description}
              name="description"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Item Type</FieldLabel>
            <NativeSelect defaultValue={dossier.itemType} name="item_type">
              <NativeSelectOption value="List">List</NativeSelectOption>
              <NativeSelectOption value="Package">Package</NativeSelectOption>
              <NativeSelectOption value="Assembly">Assembly</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Input defaultValue={dossier.category ?? ""} name="category" />
          </Field>
          <Field>
            <FieldLabel>Subcategory</FieldLabel>
            <Input
              defaultValue={dossier.subcategory ?? ""}
              name="subcategory"
            />
          </Field>
          <Field>
            <FieldLabel>Product Size</FieldLabel>
            <Input
              defaultValue={dossier.productSize ?? ""}
              name="product_size"
            />
          </Field>
          <Field>
            <FieldLabel>Production Type</FieldLabel>
            <Input
              defaultValue={dossier.productionType ?? ""}
              name="production_type"
            />
          </Field>
          <Field>
            <FieldLabel>Material Grade</FieldLabel>
            <NativeSelect
              defaultValue={dossier.materialGradeId ?? ""}
              name="material_grade_id"
            >
              <NativeSelectOption value="">Not Set</NativeSelectOption>
              {materialGrades.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Rod Type</FieldLabel>
            <NativeSelect
              defaultValue={dossier.rodTypeId ?? ""}
              name="rod_type_id"
            >
              <NativeSelectOption value="">Not Set</NativeSelectOption>
              {rodTypes.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Piece Weight (g)</FieldLabel>
            <Input
              defaultValue={dossier.weight100Pcs}
              min="0"
              name="weight_100_pcs"
              step="any"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Blank Piece Weight (g)</FieldLabel>
            <Input
              defaultValue={dossier.casting}
              min="0"
              name="casting"
              step="any"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Rod Size</FieldLabel>
            <Input defaultValue={dossier.rodSize ?? ""} name="rod_size" />
          </Field>
          <Field>
            <FieldLabel>Die Code</FieldLabel>
            <Input defaultValue={dossier.dieCode ?? ""} name="die_code" />
          </Field>
          <Field className="md:col-span-2 xl:col-span-4">
            <FieldLabel>Design / Process Remarks</FieldLabel>
            <Textarea defaultValue={dossier.remarks ?? ""} name="remarks" />
          </Field>
        </div>
      </section>

      <section hidden={activeSection !== "bom"} role="tabpanel">
        <EcnBomEditor
          initialLines={dossier.bomLines}
          items={products}
          parentItemId={dossier.itemId}
        />
      </section>

      <section hidden={activeSection !== "files"} role="tabpanel">
        <div className="grid gap-4 rounded-xl border p-4">
          <div>
            <h3 className="font-medium">Approved Design Files</h3>
            <p className="text-sm text-muted-foreground">
              Files from the original Design Task remain immutable evidence for
              this Product Design Dossier.
            </p>
          </div>
          {dossier.attachments?.length ? (
            <div className="flex flex-wrap gap-2">
              {dossier.attachments.map((attachment) => (
                <Button
                  asChild
                  key={`${attachment.purpose}-${attachment.href}`}
                  size="sm"
                  variant="outline"
                >
                  <AttachmentViewerLink
                    fileName={attachment.fileName}
                    href={attachment.href}
                  />
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No approved design files are linked to this Product yet.
            </p>
          )}
        </div>
      </section>

      <section hidden={activeSection !== "controls"} role="tabpanel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <YesNoField
            defaultValue={dossier.designBomCompleted}
            label="BOM Complete"
            name="design_bom_completed"
          />
          <Field>
            <FieldLabel>Target Completion Date</FieldLabel>
            <Input
              defaultValue={dossier.targetCompletionDate ?? ""}
              name="target_completion_date"
              type="date"
            />
          </Field>
          <YesNoField
            defaultValue={dossier.toolingRequired}
            label="Tooling Required"
            name="tooling_required"
          />
          <Field>
            <FieldLabel>Tooling Approx. Cost</FieldLabel>
            <Input
              defaultValue={dossier.toolingApproxCost}
              min="0"
              name="tooling_approx_cost"
              step="any"
              type="number"
            />
          </Field>
          <YesNoField
            defaultValue={dossier.fixtureRequired}
            label="Fixture Required"
            name="fixture_required"
          />
          <Field>
            <FieldLabel>Fixture Approx. Cost</FieldLabel>
            <Input
              defaultValue={dossier.fixtureApproxCost}
              min="0"
              name="fixture_approx_cost"
              step="any"
              type="number"
            />
          </Field>
          <YesNoField
            defaultValue={dossier.gaugesRequired}
            label="Gauges Required"
            name="gauges_required"
          />
          <Field>
            <FieldLabel>Inspection Approx. Cost</FieldLabel>
            <Input
              defaultValue={dossier.inspectionApproxCost}
              min="0"
              name="inspection_approx_cost"
              step="any"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Checked By</FieldLabel>
            <Input defaultValue={dossier.checkedBy ?? ""} name="checked_by" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Operation Notes</FieldLabel>
            <Textarea
              defaultValue={dossier.operationNotes ?? ""}
              name="operation_notes"
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Design Remarks</FieldLabel>
            <Textarea
              defaultValue={dossier.designRemarks ?? ""}
              name="design_remarks"
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          name="design_save_intent"
          type="submit"
          value="draft"
          variant="outline"
        >
          Save Draft
        </Button>
        <Button name="design_save_intent" type="submit" value="complete">
          Complete ECN Design
        </Button>
      </div>
    </div>
  )
}
