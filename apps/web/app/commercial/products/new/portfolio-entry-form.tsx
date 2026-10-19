"use client"

import { useActionState, useState, type ChangeEvent } from "react"
import {
  designProductName,
  designProductTypes,
  designProductionTypes,
} from "@workspace/db/commercial-design-domain"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import { createPortfolioProductAction } from "./actions"

type Options = {
  categories: string[]
  subcategories: Array<{ category: string; name: string }>
  materialGrades: string[]
  rodTypes: string[]
  rodSizes: string[]
}
const processes = [
  "Machining",
  "Package Assembly",
  "Washing",
  "Checking",
  "Marking",
  "Plating",
  "Annealing",
  "Deburring",
  "Buffing",
  "Sealant",
]
export function PortfolioEntryForm({
  options,
  masterData = false,
}: {
  options: Options
  masterData?: boolean
}) {
  const [state, action, pending] = useActionState(
    createPortfolioProductAction,
    { error: "" }
  )
  const [type, setType] = useState("List")
  const [production, setProduction] = useState("CNC")
  const [size, setSize] = useState("")
  const [category, setCategory] = useState("")
  const [subcategory, setSubcategory] = useState("")
  const [rows, setRows] = useState([0, 1])
  const [values, setValues] = useState<Record<string, string>>({})
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([])
  const bind = (name: string, fallback = "") => ({
    value: values[name] ?? fallback,
    onChange: (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      const value = event.target.value
      setValues((current) => ({ ...current, [name]: value }))
    },
  })
  const container = type !== "List"
  const material = !container && production !== "DP"
  const select = (
    name: string,
    label: string,
    values: readonly string[],
    required = true
  ) => (
    <Field>
      <FieldLabel htmlFor={`portfolio-${name}`}>{label}</FieldLabel>
      <NativeSelect
        id={`portfolio-${name}`}
        name={name}
        required={required}
        {...bind(name)}
      >
        <NativeSelectOption value="">Select {label}</NativeSelectOption>
        {values.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {value}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
  return (
    <form action={action} className="grid gap-6">
      {masterData ? (
        <input type="hidden" name="master_data" value="true" />
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <FormSection title="Product Details">
        <FieldGroup>
          <FormGrid>
            <Field>
              <FieldLabel htmlFor="portfolio-uid">Internal UID</FieldLabel>
              <Input
                id="portfolio-uid"
                name="uid"
                {...bind("uid")}
                placeholder="Generate automatically, or enter M855"
              />
              <FieldDescription>
                Leave blank to generate an M-number. An existing Portfolio UID
                cannot be overwritten.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-type">Item Type</FieldLabel>
              <NativeSelect
                id="portfolio-type"
                name="item_type"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                {["List", "Package", "Assembly"].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-size">Product Size</FieldLabel>
              <Input
                id="portfolio-size"
                name="product_size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-category">Category</FieldLabel>
              <NativeSelect
                id="portfolio-category"
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  setSubcategory("")
                }}
                required
              >
                <NativeSelectOption value="">
                  Select Category
                </NativeSelectOption>
                {options.categories.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-subcategory">
                Subcategory
              </FieldLabel>
              <NativeSelect
                id="portfolio-subcategory"
                name="subcategory"
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
                required
              >
                <NativeSelectOption value="">
                  Select Subcategory
                </NativeSelectOption>
                {options.subcategories
                  .filter((row) => row.category === category)
                  .map((row) => (
                    <NativeSelectOption key={row.name} value={row.name}>
                      {row.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-name">Product Name</FieldLabel>
              <Input
                id="portfolio-name"
                value={designProductName({ size, category, subcategory })}
                readOnly
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="portfolio-production">
                Production Type
              </FieldLabel>
              <NativeSelect
                id="portfolio-production"
                name="production_type"
                value={production}
                onChange={(event) => setProduction(event.target.value)}
              >
                {designProductionTypes.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {!container
              ? select(
                  "product_type",
                  "Product Type",
                  designProductTypes,
                  production !== "DP"
                )
              : null}
            {material ? (
              <>
                {select("grade", "Grade", options.materialGrades)}
                {select("rod_type", "Rod Type", options.rodTypes)}
                {select("rod_size", "Rod Size", options.rodSizes)}
              </>
            ) : null}
            {!container ? (
              <>
                <Field>
                  <FieldLabel htmlFor="portfolio-weight">
                    One-Piece Weight (gm)
                  </FieldLabel>
                  <Input
                    id="portfolio-weight"
                    name="piece_weight"
                    {...bind("piece_weight")}
                    type="number"
                    min="0.00000001"
                    step="any"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="portfolio-blank">
                    Blank Piece Weight (gm)
                  </FieldLabel>
                  <Input
                    id="portfolio-blank"
                    name="blank_piece_weight"
                    type="number"
                    min="0"
                    step="any"
                    {...bind("blank_piece_weight", "0")}
                    required
                  />
                </Field>
              </>
            ) : null}
            <Field>
              <FieldLabel htmlFor="portfolio-die">Die Code</FieldLabel>
              <Input id="portfolio-die" name="die_code" {...bind("die_code")} />
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel htmlFor="portfolio-remarks">Product Remarks</FieldLabel>
            <Textarea
              id="portfolio-remarks"
              name="remarks"
              {...bind("remarks")}
            />
          </Field>
        </FieldGroup>
      </FormSection>
      <FormSection
        title="Processes Required"
        description="Select the processes that Product Costing should price. Product Overhead is always available."
      >
        <FormGrid>
          {processes
            .filter((value) => container || value !== "Package Assembly")
            .map((value) => (
              <label className="flex items-center gap-2 text-sm" key={value}>
                <Checkbox
                  name="processes_required"
                  value={value}
                  checked={selectedProcesses.includes(value)}
                  onCheckedChange={(checked) =>
                    setSelectedProcesses((current) =>
                      checked === true
                        ? [...current, value]
                        : current.filter((process) => process !== value)
                    )
                  }
                />
                {value}
              </label>
            ))}
        </FormGrid>
      </FormSection>
      {container ? (
        <FormSection
          title="BOM Components"
          description="Add each component to Portfolio first, then enter its UID and quantity here. Package weight is calculated from its components."
        >
          <FieldGroup>
            {rows.map((key, index) => (
              <FormGrid key={key}>
                <Field>
                  <FieldLabel htmlFor={`component-${key}`}>
                    Component {index + 1} UID
                  </FieldLabel>
                  <Input
                    id={`component-${key}`}
                    name="component_uid"
                    {...bind(`component_uid_${key}`)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`quantity-${key}`}>Quantity</FieldLabel>
                  <Input
                    id={`quantity-${key}`}
                    name="component_quantity"
                    type="number"
                    min="0.00000001"
                    step="any"
                    {...bind(`component_quantity_${key}`, "1")}
                    required
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rows.length <= (type === "Package" ? 2 : 1)}
                  onClick={() =>
                    setRows((current) => current.filter((row) => row !== key))
                  }
                >
                  Remove Component {index + 1}
                </Button>
              </FormGrid>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRows((current) => [...current, Math.max(...current) + 1])
              }
            >
              Add Component
            </Button>
          </FieldGroup>
        </FormSection>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding Product…" : "Add Product to Portfolio"}
        </Button>
      </div>
    </form>
  )
}
