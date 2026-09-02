"use client"

import { useRef, useState } from "react"

import {
  designAssemblyPieceWeight,
  designPackagePieceWeight,
  designProductName,
  designProductTypeOptions,
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

import { AttachmentViewerLink } from "../../../components/attachment-viewer-link"

type BomLine = {
  bomItem?: string | null
  casting?: number | null
  componentCode: string
  componentItemType?: string
  componentSource: string
  componentCategory?: string | null
  componentProductSize?: string | null
  componentSubcategory?: string | null
  drawingRequirement?: string | null
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
  drawingRequirement?: string
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
  blankPieceWeight: number | null
  category: string | null
  description: string
  grade: string | null
  id: string
  itemType: string
  lineNotes: string | null
  pieceWeight: number | null
  processRequired: string | null
  productSize: string | null
  productType: string | null
  productionType: string | null
  rodSize: string | null
  rodType: string | null
  subcategory: string | null
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

type DesignAttachment = {
  fileName: string
  href: string
  purpose: string
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

function DesignFileFields({
  attachments,
  namePrefix = "",
}: {
  attachments: DesignAttachment[]
  namePrefix?: string
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["internal_drawing", "Internal Drawing"],
          ["customer_marked", "Customer Marked Drawing"],
          ["cad", "CAD File"],
        ].map(([kind, label]) => (
          <Field className="rounded-xl border bg-background p-4" key={kind}>
            <FieldLabel>
              {label}
              <Input name={`${namePrefix}${kind}_file`} type="file" />
            </FieldLabel>
          </Field>
        ))}
      </div>
      {attachments.length ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
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
      ) : null}
    </div>
  )
}

function BomRow({
  assemblyWeight,
  canRemove,
  designOptions,
  generatedProductName,
  index,
  itemType,
  onAddAssemblyChild,
  onComponentItemTypeChange,
  onParentLineNumberChange,
  onPieceWeightChange,
  onQuantityChange,
  onRemove,
  parentAssemblyLines,
  products,
  row,
  selectedProductUid,
}: {
  assemblyWeight: number
  canRemove: boolean
  designOptions: DesignOptions
  generatedProductName: string
  index: number
  itemType: string
  onAddAssemblyChild: () => void
  onComponentItemTypeChange: (componentItemType: string) => void
  onParentLineNumberChange: (parentLineNumber: number | null) => void
  onPieceWeightChange: (pieceWeight: number | null) => void
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
  parentAssemblyLines: number[]
  products: ProductOption[]
  row: BomLine
  selectedProductUid?: string
}) {
  const isListProduct = itemType === "List"
  const portfolioProduct = selectedProductUid
    ? products.find(({ uid }) => uid === selectedProductUid)
    : undefined
  const componentSource = portfolioProduct
    ? "Existing"
    : row.componentSource || "New"
  const [componentItemType, setComponentItemType] = useState(
    row.componentItemType || "List"
  )
  const selectedProductId = portfolioProduct?.id ?? row.existingProductId ?? ""
  const effectiveSource = isListProduct ? "New" : componentSource
  const isExistingComponent = effectiveSource === "Existing"
  const fallbackProduct: ProductOption | null =
    selectedProductId && !products.some(({ id }) => id === selectedProductId)
      ? {
          blankPieceWeight: row.casting ?? null,
          category: row.componentCategory ?? null,
          description: row.packagePart ?? row.componentCode,
          grade: row.grade ?? null,
          id: selectedProductId,
          itemType: row.componentItemType ?? "List",
          lineNotes: row.notes ?? null,
          pieceWeight: row.pieceWeight ?? null,
          processRequired: row.processRequired ?? null,
          productSize: row.componentProductSize ?? null,
          productType: row.productionType ?? null,
          productionType: row.manufacturingProcess ?? null,
          rodSize: row.rodSize ?? null,
          rodType: row.rodType ?? null,
          subcategory: row.componentSubcategory ?? null,
          uid: row.componentCode,
        }
      : null
  const availableProducts = fallbackProduct
    ? [fallbackProduct, ...products]
    : products
  const selectedProduct = availableProducts.find(
    ({ id }) => id === selectedProductId
  )
  const isAssemblyChild =
    row.parentLineNumber !== null && row.parentLineNumber !== undefined
  const effectiveComponentType =
    isListProduct || isAssemblyChild
      ? "List"
      : isExistingComponent
        ? (selectedProduct?.itemType ?? componentItemType)
        : componentItemType
  const isIndividualList = effectiveComponentType === "List"
  const isNewPackageComponent = !isListProduct && !isExistingComponent
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
  const productTypeOptions = designProductTypeOptions(designOptions.processes)
  const requestedProductType = isIndividualList
    ? isExistingComponent
      ? (selectedProduct?.productType ?? row.productionType ?? "")
      : (row.productionType ?? "")
    : ""
  const effectiveProductType =
    isExistingComponent || productTypeOptions.includes(requestedProductType)
      ? requestedProductType
      : ""
  const requestedProductionType = isExistingComponent
    ? (selectedProduct?.productionType ?? row.manufacturingProcess ?? "")
    : (row.manufacturingProcess ?? "")
  const effectiveProductionType =
    isExistingComponent ||
    productionTypeOptions.includes(requestedProductionType)
      ? requestedProductionType
      : ""
  const effectiveSelectedProcesses = isExistingComponent
    ? (selectedProduct?.processRequired ?? row.processRequired ?? "")
        .split(/[,;\n]+/)
        .map((process) => process.trim())
        .filter(Boolean)
    : selectedProcesses
  const effectiveProductSize = isExistingComponent
    ? (selectedProduct?.productSize ?? row.componentProductSize ?? "")
    : componentProductSize
  const effectiveCategory = isExistingComponent
    ? (selectedProduct?.category ?? row.componentCategory ?? "")
    : componentCategory
  const effectiveSubcategory = isExistingComponent
    ? (selectedProduct?.subcategory ?? row.componentSubcategory ?? "")
    : componentSubcategory
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
    : isNewPackageComponent
      ? generatedComponentName
      : null
  const displayedAssemblyWeight =
    assemblyWeight > 0
      ? assemblyWeight
      : isExistingComponent
        ? (selectedProduct?.pieceWeight ?? 0)
        : 0
  const processSelectionField = (
    <Field className="min-w-0 md:col-span-2 xl:col-span-4">
      <FieldLabel>Pricing Process Columns Required</FieldLabel>
      <input
        name="bom_process_required"
        type="hidden"
        value={effectiveSelectedProcesses.join(", ")}
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
                checked={effectiveSelectedProcesses.includes(value)}
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
  )

  return (
    <section
      className={`rounded-xl border bg-background p-5 shadow-sm ${equalFieldGridClassName}`}
      key={isExistingComponent ? selectedProductId : "new-component"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2 xl:col-span-4">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">BOM Line {index + 1}</h4>
          <span className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {effectiveSource} · {effectiveComponentType}
          </span>
        </div>
        {!isListProduct ? (
          <div className="flex flex-wrap gap-2">
            {effectiveComponentType === "Assembly" && !isExistingComponent ? (
              <Button
                onClick={onAddAssemblyChild}
                size="sm"
                type="button"
                variant="outline"
              >
                Add List Part
              </Button>
            ) : null}
            <Button
              name="design_save_intent"
              size="sm"
              type="submit"
              value={`portfolio:${index}`}
              variant="outline"
            >
              {selectedProduct
                ? "Change Product from Portfolio"
                : "Select Product from Portfolio"}
            </Button>
          </div>
        ) : null}
      </div>
      <TextField
        defaultValue={row.lineNumber || index + 1}
        label="Line Number"
        name="bom_line_number"
        readOnly
        type="number"
      />
      <Field className="min-w-0">
        <FieldLabel className={fieldLabelClassName}>
          Parent Assembly (optional)
          {isListProduct || parentAssemblyLines.length === 0 ? (
            <input
              name="bom_parent_line_number"
              type="hidden"
              value={row.parentLineNumber ?? ""}
            />
          ) : null}
          <NativeSelect
            autoComplete="off"
            className="w-full"
            defaultValue={String(row.parentLineNumber ?? "")}
            disabled={isListProduct || parentAssemblyLines.length === 0}
            name={
              isListProduct || parentAssemblyLines.length === 0
                ? undefined
                : "bom_parent_line_number"
            }
            onChange={(event) =>
              onParentLineNumberChange(
                event.currentTarget.value
                  ? Number(event.currentTarget.value)
                  : null
              )
            }
          >
            <NativeSelectOption value="">
              Top-level component — no parent required
            </NativeSelectOption>
            {parentAssemblyLines.map((lineNumber) => (
              <NativeSelectOption key={lineNumber} value={String(lineNumber)}>
                Child of Assembly line {lineNumber}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FieldLabel>
      </Field>
      <TextField
        defaultValue={effectiveSource}
        disabled
        label="Source"
        name="bom_component_source"
      />
      <ChoiceField
        defaultValue={effectiveComponentType}
        disabled={isListProduct || isAssemblyChild || isExistingComponent}
        key={`${itemType}-component-type`}
        label="Component Type"
        name="bom_component_item_type"
        onChange={(value) => {
          setComponentItemType(value)
          onComponentItemTypeChange(value)
        }}
        options={["List", "Assembly"]}
      />
      <TextField
        defaultValue={
          selectedProduct
            ? `${selectedProduct.uid} · ${selectedProduct.description}`
            : "Not selected — this line creates a new Product"
        }
        disabled
        label="Selected Product"
        name="bom_existing_product_id"
        submittedValue={selectedProduct?.id ?? ""}
      />
      <input
        name="bom_package_part_uid"
        type="hidden"
        value={isListProduct ? "" : (row.packagePartUid ?? "")}
      />
      <TextField
        defaultValue={
          isExistingComponent
            ? (selectedProduct?.uid ?? row.componentCode)
            : (row.componentCode ?? "")
        }
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
        onChange={(value) => onQuantityChange(Number(value) || 0)}
        type="number"
      />
      <TextField
        defaultValue={
          isExistingComponent
            ? (selectedProduct?.description ?? row.packagePart ?? "")
            : automaticProductName !== null
              ? automaticProductName
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
      {isNewPackageComponent || isExistingComponent ? (
        <>
          <TextField
            defaultValue={effectiveProductSize}
            disabled={isExistingComponent}
            label="Product Size"
            name="bom_component_product_size"
            onChange={setComponentProductSize}
          />
          <ChoiceField
            defaultValue={effectiveCategory}
            disabled={isExistingComponent}
            label="Component Category"
            name="bom_component_category"
            onChange={(category) => {
              setComponentCategory(category)
              setComponentSubcategory("")
            }}
            options={optionsWithCurrent(
              designOptions.categories,
              effectiveCategory
            )}
            placeholder="Select category"
          />
          <ChoiceField
            defaultValue={effectiveSubcategory}
            disabled={isExistingComponent || !effectiveCategory}
            key={effectiveCategory || "no-component-category"}
            label="Component Subcategory"
            name="bom_component_subcategory"
            onChange={setComponentSubcategory}
            options={optionsWithCurrent(
              componentSubcategoryOptions,
              effectiveSubcategory
            )}
            placeholder={
              effectiveCategory ? "Select subcategory" : "Select category first"
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
      {isIndividualList ? (
        <>
          <ChoiceField
            defaultValue={
              isExistingComponent
                ? (selectedProduct?.rodSize ?? row.rodSize ?? "")
                : (row.rodSize ?? "")
            }
            disabled={!isIndividualList || isExistingComponent}
            label="Rod Size"
            name="bom_rod_size"
            options={optionsWithCurrent(
              designOptions.rodSizes,
              isExistingComponent ? selectedProduct?.rodSize : row.rodSize
            )}
            placeholder="Select Product Rod Size"
          />
          <ChoiceField
            defaultValue={
              isExistingComponent
                ? (selectedProduct?.rodType ?? row.rodType ?? "")
                : (row.rodType ?? "")
            }
            disabled={isExistingComponent}
            label="Rod Type"
            name="bom_rod_type"
            options={optionsWithCurrent(
              designOptions.rodTypes,
              isExistingComponent ? selectedProduct?.rodType : row.rodType
            )}
            placeholder="Select Rod Type"
          />
          <ChoiceField
            defaultValue={
              isExistingComponent
                ? (selectedProduct?.grade ?? row.grade ?? "")
                : (row.grade ?? "")
            }
            disabled={isExistingComponent}
            label="Grade"
            name="bom_grade"
            options={optionsWithCurrent(
              designOptions.materialGrades,
              isExistingComponent ? selectedProduct?.grade : row.grade
            )}
            placeholder="Select Material Grade"
          />
          <ChoiceField
            defaultValue={effectiveProductType}
            disabled={!isIndividualList || isExistingComponent}
            label="Product Type"
            name="bom_production_type"
            options={optionsWithCurrent(
              productTypeOptions,
              effectiveProductType
            )}
            placeholder="Select Product Type"
          />
          <ChoiceField
            defaultValue={effectiveProductionType}
            disabled={!isIndividualList || isExistingComponent}
            key={`${index}-${effectiveProductionType}`}
            label="Production Type"
            name="bom_manufacturing_process"
            options={optionsWithCurrent(
              productionTypeOptions,
              effectiveProductionType
            )}
            placeholder="Select CNC, Conventional, or DP"
          />
          <TextField
            defaultValue={
              isExistingComponent
                ? (selectedProduct?.blankPieceWeight ?? row.casting ?? "")
                : (row.casting ?? "")
            }
            disabled={isExistingComponent}
            label="Blank Piece Weight ( gm )"
            name="bom_casting"
            type="number"
          />
          <TextField
            defaultValue={
              isExistingComponent
                ? (selectedProduct?.pieceWeight ?? row.pieceWeight ?? "")
                : (row.pieceWeight ?? "")
            }
            disabled={isExistingComponent}
            label="1 Piece Weight ( gm )"
            name="bom_piece_weight"
            onChange={(value) =>
              onPieceWeightChange(value ? Number(value) : null)
            }
            type="number"
          />
          {processSelectionField}
        </>
      ) : (
        <>
          <input name="bom_rod_size" type="hidden" value="" />
          <input name="bom_rod_type" type="hidden" value="" />
          <input name="bom_grade" type="hidden" value="" />
          <input name="bom_production_type" type="hidden" value="" />
          <input name="bom_casting" type="hidden" value="" />
          <ChoiceField
            defaultValue={effectiveProductionType}
            disabled={isExistingComponent}
            key={`${index}-${effectiveProductionType}`}
            label="Production Type"
            name="bom_manufacturing_process"
            options={optionsWithCurrent(
              productionTypeOptions,
              effectiveProductionType
            )}
            placeholder="Select Production Type"
          />
          <TextField
            defaultValue={displayedAssemblyWeight}
            disabled
            key={`assembly-weight-${displayedAssemblyWeight}`}
            label="Assembly Weight (derived)"
            name="bom_piece_weight"
            submittedValue=""
            type="number"
          />
          <Field className="min-w-0 md:col-span-1 xl:col-span-3">
            <FieldLabel>Assembly BOM</FieldLabel>
            <FieldDescription>
              Add List Part, then select a Product or create a new List part.
              Weight is calculated from each child&apos;s 1 Piece Weight × BOM
              Quantity.
            </FieldDescription>
          </Field>
          {processSelectionField}
        </>
      )}
      <TextField
        defaultValue={
          isExistingComponent
            ? (selectedProduct?.lineNotes ?? row.notes ?? "")
            : (row.notes ?? "")
        }
        disabled={isExistingComponent}
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

const blankBomLine = (
  lineNumber: number,
  parentLineNumber: number | null = null
): BomLine => ({
  componentCode: "",
  componentItemType: "List",
  componentSource: "New",
  drawingRequirement: "Required",
  lineNumber,
  parentLineNumber,
  quantity: 1,
})

export function DesignTaskEditor({
  attachments = [],
  designOptions,
  editable,
  initial,
  initialSection = "product",
  portfolioSelection,
  products,
  portfolioDecisionLocked = false,
}: {
  attachments?: DesignAttachment[]
  designOptions: DesignOptions
  editable: boolean
  initial: EditorInitial
  initialSection?: DesignSection
  portfolioSelection?: { lineIndex: number; productUid: string }
  products: ProductOption[]
  portfolioDecisionLocked?: boolean
}) {
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
  const [activeSection, setActiveSection] =
    useState<DesignSection>(initialSection)
  const [activeFileGroup, setActiveFileGroup] = useState("root")
  const [rootDrawingRequirement, setRootDrawingRequirement] = useState(
    initial.drawingRequirement ?? "Required"
  )
  const [packageProcesses, setPackageProcesses] = useState(() => {
    const allowed = new Set<string>(
      costingProcessOptions.map(([value]) => value)
    )
    return (initial.packageProcessRequired ?? "")
      .split(/[,;\n]+/)
      .map((process) => process.trim())
      .filter((process) => allowed.has(process))
  })
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
  const weightRows = visibleRows.map(({ row }, index) => {
    const selectedProduct =
      portfolioSelection?.lineIndex === index
        ? products.find(({ uid }) => uid === portfolioSelection.productUid)
        : undefined
    return {
      ...row,
      componentItemType: selectedProduct?.itemType ?? row.componentItemType,
      pieceWeight: selectedProduct?.pieceWeight ?? row.pieceWeight,
    }
  })
  const packageWeight = designPackagePieceWeight(weightRows)
  const packageProductionTypeOptions = designProductionTypeOptions(
    designOptions.machineTypes
  )
  const addBomLine = (parentLineNumber: number | null = null) => {
    const key = nextKey.current++
    setRows((current) => {
      const lineNumber =
        Math.max(...current.map(({ row }) => row.lineNumber), 0) + 1
      return [
        ...current,
        {
          key: `bom-${key}`,
          row: blankBomLine(lineNumber, parentLineNumber),
        },
      ]
    })
  }

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
                Step 1 of 2: complete all structured Product and BOM data. {" "}
                {itemType === "List"
                  ? "A List is one manufactured part. Enter its material, weight, and process details in this single row. The main Q/C Number becomes its Part UID."
                  : "Add each Package component. Existing components select an ordered Product; new components receive a UID on save. Parent Line is used only for a child below an Assembly component."}
              </FieldDescription>
              {itemType === "Package" ? (
                <section className="grid gap-4 rounded-xl border bg-background p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2 xl:col-span-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">Package Parent</h4>
                      <span className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Root · Package
                      </span>
                    </div>
                    <Button
                      onClick={() => addBomLine()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Add Component Line
                    </Button>
                  </div>
                  <TextField
                    defaultValue={initial.quotedPartUid ?? ""}
                    disabled
                    label="Package UID (automatic)"
                    name="package_parent_uid"
                    submittedValue=""
                  />
                  <TextField
                    defaultValue={internalPartSize}
                    disabled
                    label="Package Product Size"
                    name="package_parent_product_size"
                    submittedValue=""
                  />
                  <TextField
                    defaultValue={internalPartCategory}
                    disabled
                    label="Package Category"
                    name="package_parent_category"
                    submittedValue=""
                  />
                  <TextField
                    defaultValue={internalPartSubCategory}
                    disabled
                    label="Package Subcategory"
                    name="package_parent_subcategory"
                    submittedValue=""
                  />
                  <TextField
                    defaultValue={generatedProductName}
                    disabled
                    label="Package Product Name (automatic)"
                    name="package_parent_name"
                    submittedValue=""
                  />
                  <TextField
                    defaultValue={packageWeight}
                    disabled
                    label="Package Weight (derived)"
                    name="package_parent_piece_weight"
                    submittedValue=""
                    type="number"
                  />
                  <ChoiceField
                    defaultValue={initial.manufacturingProcess ?? ""}
                    label="Production Type"
                    name="manufacturing_process"
                    options={optionsWithCurrent(
                      packageProductionTypeOptions,
                      initial.manufacturingProcess
                    )}
                    placeholder="Select Production Type"
                  />
                  <Field className="min-w-0 md:col-span-2 xl:col-span-4">
                    <FieldLabel>Pricing Process Columns Required</FieldLabel>
                    <input
                      name="package_process_required"
                      type="hidden"
                      value={packageProcesses.join(", ")}
                    />
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {costingProcessOptions.map(([value, label]) => {
                        const checkboxId = `package-process-${value.toLowerCase()}`
                        return (
                          <label
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium has-data-checked:border-primary/50 has-data-checked:bg-[var(--color-brand-tint)]"
                            htmlFor={checkboxId}
                            key={value}
                          >
                            <Checkbox
                              checked={packageProcesses.includes(value)}
                              id={checkboxId}
                              onCheckedChange={(checked) =>
                                setPackageProcesses((current) =>
                                  checked
                                    ? [
                                        ...current.filter(
                                          (process) => process !== value
                                        ),
                                        value,
                                      ]
                                    : current.filter(
                                        (process) => process !== value
                                      )
                                )
                              }
                            />
                            <span>{label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </Field>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose Package in Product Details to build a multi-component
                  BOM.
                </p>
              )}
              <div className="grid gap-4">
                {visibleRows.map(({ key, row }, index) => (
                  <BomRow
                    assemblyWeight={designAssemblyPieceWeight(
                      weightRows,
                      row.lineNumber
                    )}
                    canRemove={
                      itemType === "Package" && visibleRows.length > 1
                    }
                    designOptions={designOptions}
                    generatedProductName={generatedProductName}
                    index={index}
                    itemType={itemType}
                    key={key}
                    onAddAssemblyChild={() => addBomLine(row.lineNumber)}
                    onComponentItemTypeChange={(componentItemType) =>
                      setRows((current) =>
                        current.map((entry) =>
                          entry.key === key
                            ? {
                                ...entry,
                                row: { ...entry.row, componentItemType },
                              }
                            : componentItemType !== "Assembly" &&
                                entry.row.parentLineNumber === row.lineNumber
                              ? {
                                  ...entry,
                                  row: {
                                    ...entry.row,
                                    parentLineNumber: null,
                                  },
                                }
                            : entry
                        )
                      )
                    }
                    onParentLineNumberChange={(parentLineNumber) =>
                      setRows((current) =>
                        current.map((entry) =>
                          entry.key === key
                            ? {
                                ...entry,
                                row: { ...entry.row, parentLineNumber },
                              }
                            : entry
                        )
                      )
                    }
                    onRemove={() =>
                      setRows((current) =>
                        current
                          .filter((entry) => entry.key !== key)
                          .map((entry) =>
                            entry.row.parentLineNumber === row.lineNumber
                              ? {
                                  ...entry,
                                  row: {
                                    ...entry.row,
                                    parentLineNumber: null,
                                  },
                                }
                              : entry
                          )
                      )
                    }
                    onPieceWeightChange={(pieceWeight) =>
                      setRows((current) =>
                        current.map((entry) =>
                          entry.key === key
                            ? {
                                ...entry,
                                row: { ...entry.row, pieceWeight },
                              }
                            : entry
                        )
                      )
                    }
                    onQuantityChange={(quantity) =>
                      setRows((current) =>
                        current.map((entry) =>
                          entry.key === key
                            ? {
                                ...entry,
                                row: { ...entry.row, quantity },
                              }
                            : entry
                        )
                      )
                    }
                    parentAssemblyLines={visibleRows
                      .slice(0, index)
                      .filter(
                        ({ row: candidate }, candidateIndex) =>
                          (portfolioSelection?.lineIndex === candidateIndex
                            ? products.find(
                                ({ uid }) =>
                                  uid === portfolioSelection.productUid
                              )?.itemType
                            : candidate.componentItemType) === "Assembly"
                      )
                      .map(({ row: candidate }) => candidate.lineNumber)}
                    products={products}
                    row={row}
                    selectedProductUid={
                      portfolioSelection?.lineIndex === index
                        ? portfolioSelection.productUid
                        : undefined
                    }
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
                Step 2 of 2: resolve every part as Uploaded or Not Required.
                Initial released drawings use revision 00.
              </FieldDescription>
              <div
                aria-label="Design file groups"
                className="flex flex-wrap gap-2 rounded-xl border bg-muted/40 p-2"
                role="tablist"
              >
                <Button
                  aria-selected={activeFileGroup === "root"}
                  onClick={() => setActiveFileGroup("root")}
                  role="tab"
                  size="sm"
                  type="button"
                  variant={activeFileGroup === "root" ? "default" : "ghost"}
                >
                  {itemType === "Package" ? "Package Files" : "List Files"}
                </Button>
                {visibleRows.map(({ row }) => {
                  const group = String(row.lineNumber)
                  return (
                    <Button
                      aria-selected={activeFileGroup === group}
                      key={group}
                      onClick={() => setActiveFileGroup(group)}
                      role="tab"
                      size="sm"
                      type="button"
                      variant={
                        activeFileGroup === group ? "default" : "ghost"
                      }
                    >
                      BOM Line {row.lineNumber} Files
                    </Button>
                  )
                })}
              </div>
              <div hidden={activeFileGroup !== "root"} role="tabpanel">
                <Field className="mb-4 max-w-sm">
                  <FieldLabel>
                    Root Product Drawing Status
                    <NativeSelect
                      name="drawing_requirement"
                      onChange={(event) =>
                        setRootDrawingRequirement(event.currentTarget.value)
                      }
                      value={rootDrawingRequirement}
                    >
                      <NativeSelectOption value="Required">Required</NativeSelectOption>
                      <NativeSelectOption value="Not Required">Not Required</NativeSelectOption>
                    </NativeSelect>
                  </FieldLabel>
                  <FieldDescription>
                    Revision 00 · {rootDrawingRequirement === "Not Required"
                      ? "Not Required"
                      : attachments.some(({ purpose }) => purpose === "internal_drawing")
                        ? "Uploaded"
                        : "Missing"}
                  </FieldDescription>
                </Field>
                <DesignFileFields
                  attachments={attachments.filter((attachment) =>
                    ["cad", "customer_marked", "internal_drawing"].includes(
                      attachment.purpose
                    )
                  )}
                />
              </div>
              {visibleRows.map(({ row }) => (
                <div
                  hidden={activeFileGroup !== String(row.lineNumber)}
                  key={row.lineNumber}
                  role="tabpanel"
                >
                  {row.componentSource === "Existing" ? (
                    <input
                      name="bom_drawing_requirement"
                      type="hidden"
                      value="Not Required"
                    />
                  ) : (
                    <Field className="mb-4 max-w-sm">
                      <FieldLabel>
                        Drawing Status
                        <NativeSelect
                          name="bom_drawing_requirement"
                          onChange={(event) => {
                            const drawingRequirement = event.currentTarget.value
                            setRows((current) =>
                              current.map((entry) =>
                                entry.row.lineNumber === row.lineNumber
                                  ? { ...entry, row: { ...entry.row, drawingRequirement } }
                                  : entry
                              )
                            )
                          }}
                          value={row.drawingRequirement ?? "Required"}
                        >
                          <NativeSelectOption value="Required">Required</NativeSelectOption>
                          <NativeSelectOption value="Not Required">Not Required</NativeSelectOption>
                        </NativeSelect>
                      </FieldLabel>
                      <FieldDescription>
                        Revision 00 · {row.drawingRequirement === "Not Required"
                          ? "Not Required"
                          : attachments.some(
                                ({ purpose }) =>
                                  purpose === `bom_line_${row.lineNumber}_internal_drawing`
                              )
                            ? "Uploaded"
                            : "Missing"}
                      </FieldDescription>
                    </Field>
                  )}
                  {row.componentSource === "Existing" ? (
                    <p className="mb-4 text-sm text-muted-foreground">
                      Drawing status: Not Required (uses the selected Product&apos;s released drawing).
                    </p>
                  ) : null}
                  <DesignFileFields
                    attachments={attachments.filter((attachment) =>
                      attachment.purpose.startsWith(
                        `bom_line_${row.lineNumber}_`
                      )
                    )}
                    namePrefix={`bom_line_${row.lineNumber}_`}
                  />
                </div>
              ))}
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
