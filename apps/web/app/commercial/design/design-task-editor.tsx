"use client"

import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

type BomLine = {
  bomItem?: string | null
  casting?: number | null
  componentCode: string
  componentItemType?: string
  componentSource: string
  existingProductId?: string | null
  grade?: string | null
  lineNumber: number
  manufacturingProcess?: string | null
  notes?: string | null
  packagePart?: string | null
  packagePartUid?: string | null
  parentLineNumber?: number | null
  pieceWeight?: number | null
  processRequired?: string | null
  quantity: number
  rodSize?: string | null
  rodType?: string | null
}

type EditorInitial = {
  bomLines: BomLine[]
  checkedBy: string | null
  componentsRequired: string | null
  designBomCompleted: string
  designRemarks: string | null
  designerName: string | null
  fixtureApproxCost: number
  fixtureRequired: string
  gaugesRequired: string
  inspectionApproxCost: number
  internalPartCategory: string | null
  internalPartSize: string | null
  internalPartSubCategory: string | null
  itemType: string
  manufacturingProcess: string | null
  matchedProductId: string | null
  operationNotes: string | null
  packageProcessRequired: string | null
  portfolioMatchStatus: string
  quotedPartUid: string | null
  targetCompletionDate: string | null
  toolingApproxCost: number
  toolingRequired: string
}

type ProductOption = {
  description: string
  id: string
  itemType: string
  uid: string
}

function TextField({
  defaultValue,
  label,
  name,
  readOnly = false,
  type = "text",
}: {
  defaultValue: number | string
  label: string
  name: string
  readOnly?: boolean
  type?: string
}) {
  return (
    <Field>
      <FieldLabel>
        {label}
        <Input
          defaultValue={defaultValue}
          min={type === "number" ? "0" : undefined}
          name={name}
          readOnly={readOnly}
          step={type === "number" ? "0.000001" : undefined}
          type={type}
        />
      </FieldLabel>
    </Field>
  )
}

function ChoiceField({
  defaultValue,
  label,
  name,
  onChange,
  options,
}: {
  defaultValue: string
  label: string
  name: string
  onChange?: (value: string) => void
  options: readonly string[]
}) {
  return (
    <Field>
      <FieldLabel>
        {label}
        <NativeSelect
          defaultValue={defaultValue}
          name={name}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        >
          {options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FieldLabel>
    </Field>
  )
}

function BomRow({
  canRemove,
  index,
  onRemove,
  products,
  row,
}: {
  canRemove: boolean
  index: number
  onRemove: () => void
  products: ProductOption[]
  row: BomLine
}) {
  return (
    <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-4">
      <TextField
        defaultValue={row.lineNumber || index + 1}
        label="Line"
        name="bom_line_number"
        type="number"
      />
      <TextField
        defaultValue={row.parentLineNumber ?? ""}
        label="Parent Line"
        name="bom_parent_line_number"
        type="number"
      />
      <ChoiceField
        defaultValue={row.componentSource || "New"}
        label="Source"
        name="bom_component_source"
        options={["New", "Existing"]}
      />
      <ChoiceField
        defaultValue={row.componentItemType || "List"}
        label="Type"
        name="bom_component_item_type"
        options={["List", "Assembly"]}
      />
      <Field>
        <FieldLabel>
          Existing Ordered Product
          <NativeSelect
            defaultValue={row.existingProductId ?? ""}
            name="bom_existing_product_id"
          >
            <NativeSelectOption value="">None</NativeSelectOption>
            {products.map((product) => (
              <NativeSelectOption key={product.id} value={product.id}>
                {product.uid} · {product.description}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FieldLabel>
      </Field>
      <TextField
        defaultValue={row.packagePartUid ?? ""}
        label="Allocated Child UID"
        name="bom_package_part_uid"
        readOnly
      />
      <TextField
        defaultValue={row.componentCode ?? ""}
        label="Component Code"
        name="bom_component_code"
      />
      <TextField
        defaultValue={row.quantity ?? 1}
        label="Quantity"
        name="bom_quantity"
        type="number"
      />
      <TextField
        defaultValue={row.packagePart ?? ""}
        label="Package Part"
        name="bom_package_part"
      />
      <TextField
        defaultValue={row.bomItem ?? ""}
        label="BOM Item"
        name="bom_item"
      />
      <TextField
        defaultValue={row.rodSize ?? ""}
        label="Rod Size"
        name="bom_rod_size"
      />
      <TextField
        defaultValue={row.rodType ?? ""}
        label="Rod Type"
        name="bom_rod_type"
      />
      <TextField
        defaultValue={row.grade ?? ""}
        label="Grade"
        name="bom_grade"
      />
      <TextField
        defaultValue={row.manufacturingProcess ?? ""}
        label="Manufacturing Process"
        name="bom_manufacturing_process"
      />
      <TextField
        defaultValue={row.casting ?? ""}
        label="Casting Weight"
        name="bom_casting"
        type="number"
      />
      <TextField
        defaultValue={row.pieceWeight ?? ""}
        label="Piece Weight"
        name="bom_piece_weight"
        type="number"
      />
      <TextField
        defaultValue={row.processRequired ?? ""}
        label="Process Required"
        name="bom_process_required"
      />
      <div className="md:col-span-2 xl:col-span-3">
        <TextField
          defaultValue={row.notes ?? ""}
          label="Line Notes"
          name="bom_notes"
        />
      </div>
      {canRemove ? (
        <div className="flex items-end justify-end">
          <Button onClick={onRemove} type="button" variant="outline">
            Remove Line
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const blankBomLine = (lineNumber: number): BomLine => ({
  componentCode: "",
  componentItemType: "List",
  componentSource: "New",
  lineNumber,
  quantity: 1,
})

export function DesignTaskEditor({
  editable,
  initial,
  products,
}: {
  editable: boolean
  initial: EditorInitial
  products: ProductOption[]
}) {
  const [portfolioDecision, setPortfolioDecision] = useState(
    initial.portfolioMatchStatus
  )
  const [itemType, setItemType] = useState(initial.itemType)
  const [toolingRequired, setToolingRequired] = useState(
    initial.toolingRequired
  )
  const [fixtureRequired, setFixtureRequired] = useState(
    initial.fixtureRequired
  )
  const [gaugesRequired, setGaugesRequired] = useState(initial.gaugesRequired)
  const nextKey = useRef(initial.bomLines.length)
  const [rows, setRows] = useState(() =>
    (initial.bomLines.length ? initial.bomLines : [blankBomLine(1)]).map(
      (row, index) => ({ key: `bom-${index}`, row })
    )
  )
  const isNewDesign = portfolioDecision === "New Quoted Part"
  const visibleRows = itemType === "List" ? rows.slice(0, 1) : rows

  return (
    <fieldset className="grid gap-6" disabled={!editable}>
      <input name="design_status" type="hidden" value="Pending Design" />
      <input name="revision_no" type="hidden" value="0" />
      <input name="approval_status" type="hidden" value="Pending" />
      <FieldSet>
        <FieldLegend>Portfolio Decision</FieldLegend>
        <FieldDescription>
          Match an ordered internal product, or create a controlled quoted part.
          Q, C, and nested A identifiers are allocated atomically on save.
        </FieldDescription>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ChoiceField
            defaultValue={initial.portfolioMatchStatus}
            label="Decision"
            name="portfolio_match_status"
            onChange={setPortfolioDecision}
            options={[
              "Pending",
              "New Quoted Part",
              "Matches Existing Portfolio",
            ]}
          />
          {portfolioDecision === "Matches Existing Portfolio" ? (
            <Field>
              <FieldLabel>
                Ordered Portfolio Product
                <NativeSelect
                  defaultValue={initial.matchedProductId ?? ""}
                  name="matched_product_id"
                  required
                >
                  <NativeSelectOption value="">
                    Select product
                  </NativeSelectOption>
                  {products.map((product) => (
                    <NativeSelectOption key={product.id} value={product.id}>
                      {product.uid} · {product.description}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FieldLabel>
            </Field>
          ) : null}
          {isNewDesign ? (
            <>
              <ChoiceField
                defaultValue={initial.itemType}
                label="Item Type"
                name="item_type"
                onChange={setItemType}
                options={["List", "Package"]}
              />
              <TextField
                defaultValue={initial.quotedPartUid ?? "Allocated on save"}
                label="Q / C Number"
                name="quoted_part_uid"
                readOnly
              />
            </>
          ) : null}
        </div>
      </FieldSet>

      {isNewDesign ? (
        <>
          <FieldSet>
            <FieldLegend>Design Dossier</FieldLegend>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TextField
                defaultValue={initial.designerName ?? ""}
                label="Designer"
                name="designer_name"
              />
              <TextField
                defaultValue={initial.targetCompletionDate ?? ""}
                label="Target Completion"
                name="target_completion_date"
                type="date"
              />
              <TextField
                defaultValue={initial.internalPartSize ?? ""}
                label="Internal Part Size"
                name="internal_part_size"
              />
              <TextField
                defaultValue={initial.internalPartSubCategory ?? ""}
                label="Internal Subcategory"
                name="internal_part_sub_category"
              />
              <TextField
                defaultValue={initial.internalPartCategory ?? ""}
                label="Internal Category"
                name="internal_part_category"
              />
              <TextField
                defaultValue={initial.manufacturingProcess ?? ""}
                label="Manufacturing Process"
                name="manufacturing_process"
              />
              {itemType === "Package" ? (
                <TextField
                  defaultValue={initial.packageProcessRequired ?? ""}
                  label="Package Process"
                  name="package_process_required"
                />
              ) : null}
              <TextField
                defaultValue={initial.componentsRequired ?? ""}
                label="Components Required"
                name="components_required"
              />
              <ChoiceField
                defaultValue={initial.designBomCompleted}
                label="BOM Complete"
                name="design_bom_completed"
                options={["No", "Yes"]}
              />
              <ChoiceField
                defaultValue={initial.toolingRequired}
                label="Tooling Required"
                name="tooling_required"
                onChange={setToolingRequired}
                options={["No", "Yes"]}
              />
              {toolingRequired === "Yes" ? (
                <TextField
                  defaultValue={initial.toolingApproxCost}
                  label="Tooling Approximate Cost"
                  name="tooling_approx_cost"
                  type="number"
                />
              ) : null}
              <ChoiceField
                defaultValue={initial.fixtureRequired}
                label="Fixture Required"
                name="fixture_required"
                onChange={setFixtureRequired}
                options={["No", "Yes"]}
              />
              {fixtureRequired === "Yes" ? (
                <TextField
                  defaultValue={initial.fixtureApproxCost}
                  label="Fixture Approximate Cost"
                  name="fixture_approx_cost"
                  type="number"
                />
              ) : null}
              <ChoiceField
                defaultValue={initial.gaugesRequired}
                label="Inspection / Gauges Required"
                name="gauges_required"
                onChange={setGaugesRequired}
                options={["No", "Yes"]}
              />
              {gaugesRequired === "Yes" ? (
                <TextField
                  defaultValue={initial.inspectionApproxCost}
                  label="Inspection Approximate Cost"
                  name="inspection_approx_cost"
                  type="number"
                />
              ) : null}
              <TextField
                defaultValue={initial.checkedBy ?? ""}
                label="Checked By"
                name="checked_by"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>
                  Operation Notes
                  <Textarea
                    defaultValue={initial.operationNotes ?? ""}
                    name="operation_notes"
                  />
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel>
                  Design Remarks
                  <Textarea
                    defaultValue={initial.designRemarks ?? ""}
                    name="design_remarks"
                  />
                </FieldLabel>
              </Field>
            </div>
          </FieldSet>

          <FieldSet>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <FieldLegend>
                  {itemType === "Package"
                    ? "Package / Assembly BOM"
                    : "List BOM"}
                </FieldLegend>
                <FieldDescription>
                  Nested children are valid only below Assembly rows. Existing
                  rows must select an ordered internal product.
                </FieldDescription>
              </div>
              {itemType === "Package" ? (
                <Button
                  onClick={() => {
                    const key = nextKey.current++
                    setRows((current) => [
                      ...current,
                      {
                        key: `bom-${key}`,
                        row: blankBomLine(current.length + 1),
                      },
                    ])
                  }}
                  type="button"
                  variant="outline"
                >
                  Add BOM Line
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3">
              {visibleRows.map(({ key, row }, index) => (
                <BomRow
                  canRemove={itemType === "Package" && visibleRows.length > 1}
                  index={index}
                  key={key}
                  onRemove={() =>
                    setRows((current) =>
                      current.filter((entry) => entry.key !== key)
                    )
                  }
                  products={products}
                  row={row}
                />
              ))}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Design Files</FieldLegend>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["internal_drawing_file", "Internal Drawing"],
                ["customer_marked_file", "Customer Marked Drawing"],
                ["cad_file", "CAD File"],
              ].map(([name, label]) => (
                <Field key={name}>
                  <FieldLabel>
                    {label}
                    <Input name={name} type="file" />
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>
        </>
      ) : null}

      <Button className="w-fit" type="submit">
        Save Design Task
      </Button>
    </fieldset>
  )
}
