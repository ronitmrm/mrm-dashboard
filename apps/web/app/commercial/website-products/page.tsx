import type { ReactNode } from "react"
import {
  createCommercialMasterRepository,
  createCommercialReportingRepository,
  createCustomerRepository,
  type WebsiteProductRow,
} from "@workspace/db"
import { Download, Pencil, RotateCcw } from "lucide-react"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { updateWebsiteProductAction } from "./actions"

const websiteProductsPath = "/commercial/website-products"
const selectClassName =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

const columns: Array<{
  label: string
  value: (row: WebsiteProductRow) => ReactNode
}> = [
  { label: "UID", value: (row) => row.uid },
  { label: "partCode", value: (row) => row.partCode },
  { label: "Product Description", value: (row) => row.productDescription },
  { label: "category", value: (row) => row.category },
  { label: "subCategory", value: (row) => row.subCategory },
  { label: "size", value: (row) => row.size },
  { label: "Grade", value: (row) => row.grade },
  { label: "material", value: (row) => row.material },
  {
    label: "MATERIAL CONSTRUCTION",
    value: (row) => row.materialConstruction,
  },
  { label: "finishPlating", value: (row) => row.finishPlating },
  { label: "DRAWING CATEGORY", value: (row) => row.drawingCategory },
  { label: "dimensions", value: (row) => row.dimensions },
  { label: "THREAD SIZE 1", value: (row) => row.threadSize1 },
  { label: "THREAD SIZE 2", value: (row) => row.threadSize2 },
  { label: "THREAD SIZE 3", value: (row) => row.threadSize3 },
  { label: "THREAD SIZE 4", value: (row) => row.threadSize4 },
  { label: "threadStandard", value: (row) => row.threadStandard },
  { label: "connections", value: (row) => row.connections },
  { label: "Pressure", value: (row) => row.pressure },
  { label: "temperature", value: (row) => row.temperature },
  { label: "sealant", value: (row) => row.sealant },
  {
    label: "Final Assemblies Code",
    value: (row) => row.finalAssembliesCode,
  },
  { label: "description", value: (row) => row.description },
  { label: "applications", value: (row) => row.applications },
  { label: "certifications", value: (row) => row.certifications },
  { label: "additiolNotes", value: (row) => row.additionalNotes },
  { label: "Assembly 1 UID", value: (row) => row.assemblyUid1 },
  { label: "Assembly 1 Code", value: (row) => row.assemblyCode1 },
  { label: "Assembly 2 UID", value: (row) => row.assemblyUid2 },
  { label: "Assembly 2 Code", value: (row) => row.assemblyCode2 },
  { label: "Assembly 3 UID", value: (row) => row.assemblyUid3 },
  { label: "Assembly 3 Code", value: (row) => row.assemblyCode3 },
  { label: "Assembly 4 UID", value: (row) => row.assemblyUid4 },
  { label: "Assembly 4 Code", value: (row) => row.assemblyCode4 },
  { label: "Assembly 5 UID", value: (row) => row.assemblyUid5 },
  { label: "Assembly 5 Code", value: (row) => row.assemblyCode5 },
  { label: "Assembly 6 UID", value: (row) => row.assemblyUid6 },
  { label: "Assembly 6 Code", value: (row) => row.assemblyCode6 },
  { label: "Remark", value: (row) => row.remark },
  {
    label: "Website Active",
    value: (row) => (row.isActive ? "TRUE" : "FALSE"),
  },
  { label: "createdAt", value: (row) => row.entryCreatedAt },
  {
    label: "STATUS FOR WEBSIT",
    value: (row) => (
      <Badge
        variant={row.websiteStatus === "Completed" ? "default" : "secondary"}
      >
        {row.websiteStatus}
      </Badge>
    ),
  },
]

function Field({
  defaultValue,
  label,
  name,
  type = "text",
}: {
  defaultValue?: string | null
  label: string
  name: string
  type?: string
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        defaultValue={defaultValue ?? ""}
        id={name}
        name={name}
        type={type}
      />
    </div>
  )
}

function SelectField({
  current,
  label,
  name,
  options,
}: {
  current?: string | null
  label: string
  name: string
  options: Array<{ label?: string; value: string }>
}) {
  const values = new Set(options.map((option) => option.value.toLowerCase()))
  const resolved =
    current && !values.has(current.toLowerCase())
      ? [{ label: current, value: current }, ...options]
      : options
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        className={selectClassName}
        defaultValue={current ?? ""}
        id={name}
        name={name}
      >
        <option value="">Select</option>
        {resolved.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </select>
    </div>
  )
}

function OptionChecklist({
  current,
  label,
  name,
  options,
}: {
  current?: string | null
  label: string
  name: string
  options: string[]
}) {
  const selected = new Set(
    (current ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
  )
  return (
    <fieldset className="grid gap-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label className="flex items-center gap-2 text-sm" key={option}>
            <input
              defaultChecked={selected.has(option)}
              name={name}
              type="checkbox"
              value={option}
            />
            {option}
          </label>
        ))}
      </div>
      {!options.length ? (
        <p className="text-xs text-muted-foreground">
          Add options in Pricing masters before selecting values.
        </p>
      ) : null}
    </fieldset>
  )
}

export default async function WebsiteProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    active?: string
    category?: string
    edit?: string
    q?: string
    status?: string
  }>
}) {
  await requireCapability("pricing.masters.read", websiteProductsPath)
  const filters = await searchParams
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const mastersRepository = createCommercialMasterRepository({
    connectionString,
  })
  const repository = createCommercialReportingRepository({ connectionString })
  let rows
  let masters
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    ;[rows, masters] = await Promise.all([
      repository.listWebsiteProducts({
        active:
          filters.active === "true"
            ? true
            : filters.active === "false"
              ? false
              : null,
        category: filters.category,
        organizationId,
        query: filters.q,
        status: filters.status,
      }),
      mastersRepository.snapshot(organizationId),
    ])
  } finally {
    await repository.close()
    await mastersRepository.close()
    await customers.close()
  }
  const editing = rows.find((row) => row.profileId === filters.edit)
  const websiteOptions = (fieldType: string) =>
    masters.websiteFields
      .filter((row) => row.fieldType === fieldType)
      .map((row) => ({ value: row.name }))

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Website Product Data</CardTitle>
              <CardDescription>
                Ordered products and BOM-adjacent parts with source-equivalent
                derived codes, status, thread standards, and assembly slots.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href={`${websiteProductsPath}/export.xlsx`}>
                <Download /> Export Excel
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem_auto_auto]">
            <Input
              aria-label="Search website products"
              defaultValue={filters.q}
              name="q"
              placeholder="Search UID, code, description or grade"
            />
            <select
              aria-label="Filter category"
              className={selectClassName}
              defaultValue={filters.category ?? ""}
              name="category"
            >
              <option value="">All categories</option>
              {masters.categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter website status"
              className={selectClassName}
              defaultValue={filters.status ?? ""}
              name="status"
            >
              <option value="">All statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <select
              aria-label="Filter website active"
              className={selectClassName}
              defaultValue={filters.active ?? ""}
              name="active"
            >
              <option value="">All activation states</option>
              <option value="true">TRUE</option>
              <option value="false">FALSE</option>
            </select>
            <Button type="submit">Apply filters</Button>
            <Button asChild variant="ghost">
              <Link href={websiteProductsPath}>
                <RotateCcw /> Reset
              </Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit {editing.uid}</CardTitle>
            <CardDescription>
              Part code, product description, material construction, thread
              standard, assembly slots, and completion status are derived on
              save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateWebsiteProductAction} className="grid gap-5">
              <input
                name="profile_id"
                type="hidden"
                value={editing.profileId}
              />
              <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="text-muted-foreground">partCode:</span>{" "}
                  {editing.partCode || "Auto"}
                </p>
                <p>
                  <span className="text-muted-foreground">Description:</span>{" "}
                  {editing.productDescription || "Auto"}
                </p>
                <p>
                  <span className="text-muted-foreground">Construction:</span>{" "}
                  {editing.materialConstruction || "Auto"}
                </p>
                <p>
                  <span className="text-muted-foreground">Thread:</span>{" "}
                  {editing.threadStandard || "Auto"}
                </p>
                <p className="sm:col-span-2 lg:col-span-4">
                  <span className="text-muted-foreground">Assemblies:</span>{" "}
                  {editing.finalAssembliesCode || "Auto from BOM"}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  current={editing.category}
                  label="category"
                  name="category"
                  options={masters.categories.map((row) => ({
                    label: row.code ? `${row.code} - ${row.name}` : row.name,
                    value: row.name,
                  }))}
                />
                <SelectField
                  current={editing.subCategory}
                  label="subCategory"
                  name="sub_category"
                  options={masters.subcategories.map((row) => ({
                    label: `${row.category} / ${row.name}`,
                    value: row.name,
                  }))}
                />
                <Field defaultValue={editing.size} label="size" name="size" />
                <SelectField
                  current={editing.grade}
                  label="Grade"
                  name="grade"
                  options={masters.materialGrades.map((row) => ({
                    value: row.name,
                  }))}
                />
                <SelectField
                  current={editing.material}
                  label="material"
                  name="material"
                  options={websiteOptions("material")}
                />
                <Field
                  defaultValue={editing.finishPlating}
                  label="finishPlating"
                  name="finish_plating"
                />
                <Field
                  defaultValue={editing.drawingCategory}
                  label="DRAWING CATEGORY"
                  name="drawing_category"
                />
                <Field
                  defaultValue={editing.dimensions}
                  label="dimensions"
                  name="dimensions"
                />
                <Field
                  defaultValue={editing.threadSize1}
                  label="THREAD SIZE 1"
                  name="thread_size_1"
                />
                <Field
                  defaultValue={editing.threadSize2}
                  label="THREAD SIZE 2"
                  name="thread_size_2"
                />
                <Field
                  defaultValue={editing.threadSize3}
                  label="THREAD SIZE 3"
                  name="thread_size_3"
                />
                <Field
                  defaultValue={editing.threadSize4}
                  label="THREAD SIZE 4"
                  name="thread_size_4"
                />
                <SelectField
                  current={editing.connections}
                  label="connections"
                  name="connections"
                  options={websiteOptions("connections")}
                />
                <SelectField
                  current={editing.pressure}
                  label="Pressure"
                  name="pressure"
                  options={websiteOptions("pressure")}
                />
                <SelectField
                  current={editing.temperature}
                  label="temperature"
                  name="temperature"
                  options={websiteOptions("temperature")}
                />
                <SelectField
                  current={editing.sealant}
                  label="sealant"
                  name="sealant"
                  options={websiteOptions("sealant")}
                />
                <Field
                  defaultValue={editing.websiteCategory}
                  label="Website category"
                  name="website_category"
                />
                <Field
                  defaultValue={editing.websiteSubCategory}
                  label="Website sub category"
                  name="website_sub_category"
                />
                <div className="grid gap-2">
                  <Label htmlFor="is_active">Website Active</Label>
                  <select
                    className={selectClassName}
                    defaultValue={editing.isActive ? "TRUE" : "FALSE"}
                    id="is_active"
                    name="is_active"
                  >
                    <option value="TRUE">TRUE</option>
                    <option value="FALSE">FALSE</option>
                  </select>
                </div>
                <Field
                  defaultValue={editing.entryCreatedAt}
                  label="createdAt"
                  name="entry_created_at"
                  type="date"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <OptionChecklist
                  current={editing.applications}
                  label="applications"
                  name="applications"
                  options={masters.applications.map((row) => row.name)}
                />
                <OptionChecklist
                  current={editing.certifications}
                  label="certifications"
                  name="certifications"
                  options={masters.certifications.map((row) => row.name)}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="description">description</Label>
                  <Textarea
                    defaultValue={editing.description ?? ""}
                    id="description"
                    name="description"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="additional_notes">additiolNotes</Label>
                  <Textarea
                    defaultValue={editing.additionalNotes ?? ""}
                    id="additional_notes"
                    name="additional_notes"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="remark">Remark</Label>
                  <Textarea
                    defaultValue={editing.remark ?? ""}
                    id="remark"
                    name="remark"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save Website Product</Button>
                <Button asChild variant="outline">
                  <Link href={websiteProductsPath}>Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Website Product Excel View</CardTitle>
          <CardDescription>
            Showing {rows.length} ordered product rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-auto rounded-2xl border">
            <Table className="min-w-max text-xs">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="sticky left-0 z-20 bg-background">
                    Action
                  </TableHead>
                  {columns.map((column) => (
                    <TableHead key={column.label}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.profileId}>
                      <TableCell className="sticky left-0 bg-background">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            href={`${websiteProductsPath}?edit=${row.profileId}`}
                          >
                            <Pencil /> Edit
                          </Link>
                        </Button>
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell
                          className="max-w-72 whitespace-normal"
                          key={column.label}
                        >
                          {column.value(row) || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={columns.length + 1}
                    >
                      No website products match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
