"use client"

import { useRef, useState } from "react"

import {
  designProductName,
  designProductionTypeOptions,
} from "@workspace/db/commercial-design-domain"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  componentCategory?: string | null
  componentProductSize?: string | null
  componentSubcategory?: string | null
  existingProductId?: string | null
  grade?: string | null
  lineNumber: number
  manufacturingProcess?: string | null
  notes?: string | null
  packagePart?: string | null
  packagePartUid?: string | null
  parentLineNumber?: number | null
  pieceWeight?: number | null
  productionType?: string | null
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

type DesignOptions = {
  categories: string[]
  designers: string[]
  machineTypes: string[]
  materialGrades: string[]
  processes: string[]
  rodSizes: string[]
  rodTypes: string[]
  subcategories: Array<{ category: string; name: string }>
}

const designSections = [
  { id: "product", label: "Product Details" },
  { id: "bom", label: "BOM" },
  { id: "files", label: "Files" },
  { id: "controls", label: "Design Controls" },
] as const

type DesignSection = (typeof designSections)[number]["id"]

const equalFieldGridClassName =
  "grid gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-4"
const fieldLabelClassName = "flex h-full w-full flex-col justify-between gap-2"

const costingProcessOptions = [
  ["Washing", "Washing (INR/kg)"],
  ["Checking", "Checking (INR/kg)"],
  ["Marking", "Marking (INR/kg)"],
  ["Plating", "Plating (INR/kg)"],
  ["Annealing", "Annealing (INR/kg)"],
  ["Deburring", "Deburring (INR/kg)"],
  ["Buffing", "Buffing (INR/kg)"],
  ["Sealant", "Sealant (INR/kg)"],
] as const

function optionsWithCurrent(
  options: readonly string[] | undefined,
  current?: string | null
) {
  const availableOptions = options ?? []
  const value = current?.trim()
  if (!value || availableOptions.includes(value)) return availableOptions
  return [...availableOptions, value].sort((left, right) =>
    left.localeCompare(right)
  )
}

function TextField({
  defaultValue,
  disabled = false,
  label,
  name,
  onChange,
  placeholder,
  readOnly = false,
  submittedValue,
  type = "text",
}: {
  defaultValue: number | string
  disabled?: boolean
  label: string
  name: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  submittedValue?: number | string
  type?: string
}) {
  return (
    <Field className="min-w-0">
      <FieldLabel className={fieldLabelClassName}>
        {label}
        {disabled ? (
          <input
            name={name}
            type="hidden"
            value={submittedValue ?? defaultValue}
          />
        ) : null}
        <Input
          autoComplete="off"
          defaultValue={defaultValue}
          disabled={disabled}
          min={type === "number" ? "0" : undefined}
          name={disabled ? undefined : name}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          placeholder={placeholder}
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
  disabled = false,
  label,
  name,
  onChange,
  options,
  placeholder,
}: {
  defaultValue: string
  disabled?: boolean
  label: string
  name: string
  onChange?: (value: string) => void
  options: readonly string[]
  placeholder?: string
}) {
  return (
    <Field className="min-w-0">
      <FieldLabel className={fieldLabelClassName}>
        {label}
        {disabled ? (
          <input name={name} type="hidden" value={defaultValue} />
        ) : null}
        <NativeSelect
          autoComplete="off"
          className="w-full"
          defaultValue={defaultValue}
          disabled={disabled}
          name={disabled ? undefined : name}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        >
          {placeholder ? (
            <NativeSelectOption value="">{placeholder}</NativeSelectOption>
          ) : null}
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
  designOptions,
  generatedProductName,
  index,
  itemType,
  onRemove,
  productionType,
  products,
  row,
}: {
  canRemove: boolean
  designOptions: DesignOptions
  generatedProductName: string
  index: number
  itemType: string
  onRemove: () => void
  productionType: string
  products: ProductOption[]
  row: BomLine
}) {
  const isListProduct = itemType === "List"
  const [componentSource, setComponentSource] = useState(
    row.componentSource || "New"
  )
  const [componentItemType, setComponentItemType] = useState(
    row.componentItemType || "List"
  )
  const effectiveSource = isListProduct ? "New" : componentSource
  const effectiveComponentType = isListProduct ? "List" : componentItemType
  const isExistingComponent = effectiveSource === "Existing"
  const isNewPackageList =
    !isListProduct && !isExistingComponent && effectiveComponentType === "List"
  const initialComponentCategory = designOptions.categories.includes(
    row.componentCategory ?? ""
  )
    ? row.componentCategory!
    : ""
  const [componentCategory, setComponentCategory] = useState(
    initialComponentCategory
  )
  const [componentProductSize, setComponentProductSize] = useState(
    row.componentProductSize ?? ""
  )
  const [componentSubcategory, setComponentSubcategory] = useState(() =>
    designOptions.subcategories.some(
      (option) =>
        option.category === initialComponentCategory &&
        option.name === row.componentSubcategory
    )
      ? row.componentSubcategory!
      : ""
  )
  const [selectedProcesses, setSelectedProcesses] = useState(() =>
    (row.processRequired ?? "")
      .split(/[,;\n]+/)
      .map((process) => process.trim())
      .filter(Boolean)
  )
  const productionTypeOptions = designProductionTypeOptions(
    designOptions.machineTypes
  )
  const effectiveProductType = row.productionType ?? ""
  const requestedProductionType = isListProduct
    ? productionType
    : (row.manufacturingProcess ?? "")
  const effectiveProductionType = productionTypeOptions.includes(
    requestedProductionType
  )
    ? requestedProductionType
    : ""
  const componentSubcategoryOptions = designOptions.subcategories
    .filter((option) => option.category === componentCategory)
    .map((option) => option.name)
  const generatedComponentName = designProductName({
    category: componentCategory,
    size: componentProductSize,
    subcategory: componentSubcategory,
  })
  const automaticProductName = isListProduct
    ? generatedProductName
    : isNewPackageList
      ? generatedComponentName
      : null

  return (
    <section
      className={`rounded-xl border bg-background p-5 shadow-sm ${equalFieldGridClassName}`}
    >
      <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
        <h4 className="font-medium">BOM Line {index + 1}</h4>
        <span className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {effectiveSource} · {effectiveComponentType}
        </span>
      </div>
      <TextField
        defaultValue={row.lineNumber || index + 1}
        label="Line Number"
        name="bom_line_number"
        readOnly
        type="number"
      />
      <TextField
        defaultValue={isListProduct ? "" : (row.parentLineNumber ?? "")}
        disabled={isListProduct}
        label="Parent Line"
        name="bom_parent_line_number"
        placeholder="Top-level component"
        type="number"
      />
      <ChoiceField
        defaultValue={effectiveSource}
        disabled={isListProduct}
        label="Source"
        name="bom_component_source"
        onChange={setComponentSource}
        options={["New", "Existing"]}
      />
      <ChoiceField
        defaultValue={effectiveComponentType}
        disabled={isListProduct}
        key={`${itemType}-component-type`}
        label="Component Type"
        name="bom_component_item_type"
        onChange={setComponentItemType}
        options={["List", "Assembly"]}
      />
      <Field className="min-w-0">
        <FieldLabel className={fieldLabelClassName}>
          Existing Product
          <NativeSelect
            autoComplete="off"
            className="w-full"
            defaultValue={row.existingProductId ?? ""}
            disabled={!isExistingComponent}
            name={isExistingComponent ? "bom_existing_product_id" : undefined}
          >
            <NativeSelectOption value="">None</NativeSelectOption>
            {products.map((product) => (
              <NativeSelectOption key={product.id} value={product.id}>
                {product.uid} · {product.description}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {!isExistingComponent ? (
            <input name="bom_existing_product_id" type="hidden" value="" />
          ) : null}
        </FieldLabel>
      </Field>
      <input
        name="bom_package_part_uid"
        type="hidden"
        value={isListProduct ? "" : (row.packagePartUid ?? "")}
      />
      <TextField
        defaultValue={row.componentCode ?? ""}
        label={
          isListProduct ? "Part UID (automatic)" : "Component UID (automatic)"
        }
        name="bom_component_code"
        placeholder={
          isListProduct
            ? "Uses the main Q/C Number"
            : isExistingComponent
              ? "Uses the selected Product UID"
              : "Allocated on save"
        }
        readOnly
      />
      <TextField
        defaultValue={isListProduct ? 1 : (row.quantity ?? 1)}
        disabled={isListProduct}
        label="Quantity"
        name="bom_quantity"
        type="number"
      />
      <TextField
        defaultValue={
          automaticProductName !== null
            ? automaticProductName
            : isExistingComponent
              ? ""
              : (row.packagePart ?? "")
        }
        disabled={automaticProductName !== null || isExistingComponent}
        key={automaticProductName ?? undefined}
        label={
          automaticProductName !== null
            ? "Product Name (automatic)"
            : "New Component Name"
        }
        name="bom_package_part"
        placeholder="Describe the component being created"
        submittedValue={isListProduct ? "" : undefined}
      />
      {isNewPackageList ? (
        <>
          <TextField
            defaultValue={componentProductSize}
            label="Product Size"
            name="bom_component_product_size"
            onChange={setComponentProductSize}
          />
          <ChoiceField
            defaultValue={componentCategory}
            label="Component Category"
            name="bom_component_category"
            onChange={(category) => {
              setComponentCategory(category)
              setComponentSubcategory("")
            }}
            options={designOptions.categories}
            placeholder="Select category"
          />
          <ChoiceField
            defaultValue={componentSubcategory}
            disabled={!componentCategory}
            key={componentCategory || "no-component-category"}
            label="Component Subcategory"
            name="bom_component_subcategory"
            onChange={setComponentSubcategory}
            options={componentSubcategoryOptions}
            placeholder={
              componentCategory ? "Select subcategory" : "Select category first"
            }
          />
        </>
      ) : (
        <>
          <input name="bom_component_product_size" type="hidden" value="" />
          <input name="bom_component_category" type="hidden" value="" />
          <input name="bom_component_subcategory" type="hidden" value="" />
        </>
      )}
      <input name="bom_item" type="hidden" value={row.bomItem ?? ""} />
      <ChoiceField
        defaultValue={row.rodSize ?? ""}
        disabled={isExistingComponent}
        label="Rod Size"
        name="bom_rod_size"
        options={optionsWithCurrent(designOptions.rodSizes, row.rodSize)}
        placeholder="Select Product Rod Size"
      />
      <ChoiceField
        defaultValue={row.rodType ?? ""}
        disabled={isExistingComponent}
        label="Rod Type"
        name="bom_rod_type"
        options={optionsWithCurrent(designOptions.rodTypes, row.rodType)}
        placeholder="Select Rod Type"
      />
      <ChoiceField
        defaultValue={row.grade ?? ""}
        disabled={isExistingComponent}
        label="Grade"
        name="bom_grade"
        options={optionsWithCurrent(designOptions.materialGrades, row.grade)}
        placeholder="Select Material Grade"
      />
      <ChoiceField
        defaultValue={effectiveProductType}
        disabled={isExistingComponent}
        label="Product Type"
        name="bom_production_type"
        options={optionsWithCurrent(
          designOptions.processes,
          effectiveProductType
        )}
        placeholder="Select Product Type"
      />
      <ChoiceField
        defaultValue={effectiveProductionType}
        disabled={isListProduct || isExistingComponent}
        key={`${index}-${effectiveProductionType}`}
        label="Production Type"
        name="bom_manufacturing_process"
        options={productionTypeOptions}
        placeholder="Select Conventional or CNC"
      />
      <TextField
        defaultValue={row.casting ?? ""}
        disabled={isExistingComponent}
        label="Blank Piece Weight ( gm )"
        name="bom_casting"
        type="number"
      />
      <TextField
        defaultValue={row.pieceWeight ?? ""}
        disabled={isExistingComponent}
        label="1 Piece Weight ( gm )"
        name="bom_piece_weight"
        type="number"
      />
      <Field className="min-w-0 md:col-span-2 xl:col-span-4">
        <FieldLabel>Pricing Process Columns Required</FieldLabel>
        <input
          name="bom_process_required"
          type="hidden"
          value={selectedProcesses.join(", ")}
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {costingProcessOptions.map(([value, label]) => {
            const checkboxId = `bom-${index}-process-${value.toLowerCase()}`
            return (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium has-data-checked:border-primary/50 has-data-checked:bg-[var(--color-brand-tint)]"
                htmlFor={checkboxId}
                key={value}
              >
                <Checkbox
                  checked={selectedProcesses.includes(value)}
                  disabled={isExistingComponent}
                  id={checkboxId}
                  onCheckedChange={(checked) =>
                    setSelectedProcesses((current) =>
                      checked
                        ? [
                            ...current.filter((process) => process !== value),
                            value,
                          ]
                        : current.filter((process) => process !== value)
                    )
                  }
                />
                <span>{label}</span>
              </label>
            )
          })}
        </div>
      </Field>
      <TextField
        defaultValue={row.notes ?? ""}
        label="Line Notes"
        name="bom_notes"
      />
      {canRemove ? (
        <div className="flex min-h-[4.75rem] items-end">
          <Button
            className="w-full"
            onClick={onRemove}
            type="button"
            variant="outline"
          >
            Remove Line
          </Button>
        </div>
      ) : null}
    </section>
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
  designOptions,
  editable,
  initial,
  initialSection = "product",
  products,
  portfolioDecisionLocked = false,
}: {
  designOptions: DesignOptions
  editable: boolean
  initial: EditorInitial
  initialSection?: DesignSection
  products: ProductOption[]
  portfolioDecisionLocked?: boolean
}) {
  const productionTypeOptions = designProductionTypeOptions(
    designOptions.machineTypes
  )
  const [portfolioDecision, setPortfolioDecision] = useState(
    portfolioDecisionLocked ? "New Quoted Part" : initial.portfolioMatchStatus
  )
  const [itemType, setItemType] = useState(initial.itemType)
  const [toolingRequired, setToolingRequired] = useState(
    initial.toolingRequired
  )
  const [fixtureRequired, setFixtureRequired] = useState(
    initial.fixtureRequired
  )
  const [gaugesRequired, setGaugesRequired] = useState(initial.gaugesRequired)
  const initialCategory = designOptions.categories.includes(
    initial.internalPartCategory ?? ""
  )
    ? initial.internalPartCategory!
    : ""
  const [internalPartCategory, setInternalPartCategory] =
    useState(initialCategory)
  const [internalPartSize, setInternalPartSize] = useState(
    initial.internalPartSize ?? ""
  )
  const [internalPartSubCategory, setInternalPartSubCategory] = useState(() =>
    designOptions.subcategories.some(
      (option) =>
        option.category === initialCategory &&
        option.name === initial.internalPartSubCategory
    )
      ? initial.internalPartSubCategory!
      : ""
  )
  const [productionType, setProductionType] = useState(() => {
    const current = initial.manufacturingProcess ?? ""
    return productionTypeOptions.includes(current) ? current : ""
  })
  const [activeSection, setActiveSection] =
    useState<DesignSection>(initialSection)
  const nextKey = useRef(initial.bomLines.length)
  const [rows, setRows] = useState(() =>
    (initial.bomLines.length ? initial.bomLines : [blankBomLine(1)]).map(
      (row, index) => ({ key: `bom-${index}`, row })
    )
  )
  const isNewDesign = portfolioDecision === "New Quoted Part"
  const visibleRows = itemType === "List" ? rows.slice(0, 1) : rows
  const subcategoryOptions = designOptions.subcategories
    .filter((option) => option.category === internalPartCategory)
    .map((option) => option.name)
  const generatedProductName = designProductName({
    category: internalPartCategory,
    size: internalPartSize,
    subcategory: internalPartSubCategory,
  })

  return (
    <div className="grid gap-8">
      <input name="design_active_section" type="hidden" value={activeSection} />
      <input name="design_status" type="hidden" value="Pending Design" />
      <input name="revision_no" type="hidden" value="0" />
      <input name="approval_status" type="hidden" value="Pending" />
      <div
        aria-label="Design workspace sections"
        className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1 lg:grid-cols-4"
        role="tablist"
      >
        {designSections.map((section) => {
          const selected = activeSection === section.id
          return (
            <Button
              aria-controls={`design-panel-${section.id}`}
              aria-selected={selected}
              className="h-10 w-full"
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
              variant={selected ? "default" : "ghost"}
            >
              {section.label}
            </Button>
          )
        })}
      </div>

      {/* prettier-ignore */}
      <fieldset className="grid gap-8" disabled={!editable}>
      <div
        className="max-w-4xl"
        hidden={activeSection !== "product"}
        id="design-panel-product"
        role="tabpanel"
      >
        <FieldSet className="gap-4 rounded-xl border bg-muted/20 p-4">
          <FieldLegend>
            {portfolioDecisionLocked
              ? "New Product Design"
              : "Portfolio Decision"}
          </FieldLegend>
          <FieldDescription>
            {portfolioDecisionLocked
              ? "The portfolio review confirmed that a new controlled product is required."
              : "Match an ordered internal product, or create a controlled quoted part."}{" "}
            Q, C, and nested A identifiers are allocated atomically on save.
          </FieldDescription>
          <div className="grid gap-4 md:grid-cols-2">
            {portfolioDecisionLocked ? (
              <input
                name="portfolio_match_status"
                type="hidden"
                value="New Quoted Part"
              />
            ) : (
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
            )}
            {portfolioDecision === "Matches Existing Portfolio" ? (
              <Field className="min-w-0">
                <FieldLabel className={fieldLabelClassName}>
                  Ordered Portfolio Product
                  <NativeSelect
                    autoComplete="off"
                    className="w-full"
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
                  defaultValue={initial.quotedPartUid ?? ""}
                  label="Q / C Number"
                  name="quoted_part_uid"
                  placeholder="Allocated on save"
                  readOnly
                />
              </>
            ) : null}
          </div>
        </FieldSet>
      </div>

      {isNewDesign ? (
        <>
          <div
            hidden={
              activeSection !== "product" && activeSection !== "controls"
            }
            id={
              activeSection === "controls"
                ? "design-panel-controls"
                : undefined
            }
            role="tabpanel"
          >
            <FieldSet className="rounded-xl border bg-muted/20 p-5">
              <FieldLegend>
                {activeSection === "product"
                  ? "Product Definition"
                  : "Design Controls & Notes"}
              </FieldLegend>
              <FieldDescription>
                {activeSection === "product"
                  ? "Define ownership, classification, and manufacturing details."
                  : "Record design requirements, review ownership, and working notes."}
              </FieldDescription>
              <div className="grid gap-7">
                <section
                  className="grid gap-4"
                  hidden={activeSection !== "product"}
                >
                  <h4 className="text-sm font-medium">Product Details</h4>
                  <div className={equalFieldGridClassName}>
                    <ChoiceField
                      defaultValue={
                        designOptions.designers.includes(
                          initial.designerName ?? ""
                        )
                          ? initial.designerName!
                          : ""
                      }
                      label="Designer"
                      name="designer_name"
                      options={designOptions.designers}
                      placeholder="Select design team member"
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
                      onChange={setInternalPartSize}
                    />
                    <ChoiceField
                      defaultValue={initialCategory}
                      label="Internal Category"
                      name="internal_part_category"
                      onChange={(category) => {
                        setInternalPartCategory(category)
                        setInternalPartSubCategory("")
                      }}
                      options={designOptions.categories}
                      placeholder="Select category"
                    />
                    <ChoiceField
                      defaultValue={internalPartSubCategory}
                      disabled={!internalPartCategory}
                      key={internalPartCategory || "no-category"}
                      label="Internal Subcategory"
                      name="internal_part_sub_category"
                      onChange={setInternalPartSubCategory}
                      options={subcategoryOptions}
                      placeholder={
                        internalPartCategory
                          ? "Select subcategory"
                          : "Select category first"
                      }
                    />
                    <ChoiceField
                      defaultValue={productionType}
                      label="Production Type"
                      name="manufacturing_process"
                      onChange={setProductionType}
                      options={productionTypeOptions}
                      placeholder="Select Production Type"
                    />
                  </div>
                </section>

                <section
                  className="grid gap-4"
                  hidden={activeSection !== "controls"}
                >
                  <h4 className="text-sm font-medium">Design Controls</h4>
                  <div className={equalFieldGridClassName}>
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
                    <ChoiceField
                      defaultValue={
                        designOptions.designers.includes(
                          initial.checkedBy ?? ""
                        )
                          ? initial.checkedBy!
                          : ""
                      }
                      label="Checked By"
                      name="checked_by"
                      options={designOptions.designers}
                      placeholder="Select design team member"
                    />
                  </div>
                </section>

                <section
                  className="grid gap-4"
                  hidden={activeSection !== "controls"}
                >
                  <h4 className="text-sm font-medium">Notes</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field className="min-w-0">
                      <FieldLabel className="w-full">
                        Operation Notes
                        <Textarea
                          autoComplete="off"
                          className="min-h-28 resize-y"
                          defaultValue={initial.operationNotes ?? ""}
                          name="operation_notes"
                        />
                      </FieldLabel>
                    </Field>
                    <Field className="min-w-0">
                      <FieldLabel className="w-full">
                        Design Remarks
                        <Textarea
                          autoComplete="off"
                          className="min-h-28 resize-y"
                          defaultValue={initial.designRemarks ?? ""}
                          name="design_remarks"
                        />
                      </FieldLabel>
                    </Field>
                  </div>
                </section>
              </div>
            </FieldSet>
          </div>

          <div
            hidden={activeSection !== "bom"}
            id="design-panel-bom"
            role="tabpanel"
          >
            <FieldSet className="rounded-xl border bg-muted/20 p-5">
              <FieldLegend>
                {itemType === "Package"
                  ? "Package / Assembly BOM"
                  : "List BOM"}
              </FieldLegend>
              <FieldDescription>
                {itemType === "List"
                  ? "A List is one manufactured part. Enter its material, weight, and process details in this single row. The main Q/C Number becomes its Part UID."
                  : "Add each Package component. Existing components select an ordered Product; new components receive a UID on save. Parent Line is used only for a child below an Assembly component."}
              </FieldDescription>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {itemType === "List"
                    ? "Choose Package in Product Details to build a multi-component BOM."
                    : "Use Add Component for every direct or nested part in the Package."}
                </p>
                <Button
                  disabled={itemType === "List"}
                  onClick={() => {
                    const key = nextKey.current++
                    setRows((current) => {
                      const lineNumber =
                        Math.max(
                          ...current.map(({ row }) => row.lineNumber),
                          0
                        ) + 1
                      return [
                        ...current,
                        {
                          key: `bom-${key}`,
                          row: blankBomLine(lineNumber),
                        },
                      ]
                    })
                  }}
                  type="button"
                  variant="outline"
                >
                  Add Component Line
                </Button>
              </div>
              <div className="grid gap-4">
                {visibleRows.map(({ key, row }, index) => (
                  <BomRow
                    canRemove={
                      itemType === "Package" && visibleRows.length > 1
                    }
                    designOptions={designOptions}
                    generatedProductName={generatedProductName}
                    index={index}
                    itemType={itemType}
                    key={key}
                    onRemove={() =>
                      setRows((current) =>
                        current.filter((entry) => entry.key !== key)
                      )
                    }
                    productionType={productionType}
                    products={products}
                    row={row}
                  />
                ))}
              </div>
            </FieldSet>
          </div>

          <div
            hidden={activeSection !== "files"}
            id="design-panel-files"
            role="tabpanel"
          >
            <FieldSet className="rounded-xl border bg-muted/20 p-5">
              <FieldLegend>Design Files</FieldLegend>
              <FieldDescription>
                Attach the current internal drawing, marked customer drawing,
                and CAD evidence.
              </FieldDescription>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["internal_drawing_file", "Internal Drawing"],
                  ["customer_marked_file", "Customer Marked Drawing"],
                  ["cad_file", "CAD File"],
                ].map(([name, label]) => (
                  <Field
                    className="rounded-xl border bg-background p-4"
                    key={name}
                  >
                    <FieldLabel>
                      {label}
                      <Input name={name} type="file" />
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Save draft progress at any time. Complete Design from the final
          Design Controls tab after all required fields are entered.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            name="design_save_intent"
            type="submit"
            value="draft"
            variant="outline"
          >
            Save Draft
          </Button>
          {activeSection === "controls" ? (
            <Button name="design_save_intent" type="submit" value="complete">
              Complete Design Task
            </Button>
          ) : null}
        </div>
      </div>
      </fieldset>
    </div>
  )
}
