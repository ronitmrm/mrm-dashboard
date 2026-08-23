import type { ReactNode } from "react"
import {
  createCommercialMasterRepository,
  createCommercialReportingRepository,
  createCustomerRepository,
  type WebsiteProductRow,
} from "@workspace/db"
import { Pencil, RotateCcw } from "lucide-react"
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
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
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
import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  externalMasterAllMastersHref,
  externalMasterView,
  externalMasterViewHref,
} from "@/lib/external-master-workspace"

import { updateWebsiteProductAction } from "./actions"
import { importWebsiteProductsCsvAction } from "./import-action"

const websiteProductsPath = "/commercial/website-products"
const selectClassName =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

const columns: Array<{
  label: string
  value: (row: WebsiteProductRow) => ReactNode
}> = [
  { label: "Uid", value: (row) => row.uid },
  { label: "Partcode", value: (row) => row.partCode },
  { label: "Product Description", value: (row) => row.productDescription },
  { label: "Category", value: (row) => row.category },
  { label: "Subcategory", value: (row) => row.subCategory },
  { label: "Size", value: (row) => row.size },
  { label: "Grade", value: (row) => row.grade },
  { label: "Material", value: (row) => row.material },
  {
    label: "Material Construction",
    value: (row) => row.materialConstruction,
  },
  { label: "Finishplating", value: (row) => row.finishPlating },
  { label: "Drawing Category", value: (row) => row.drawingCategory },
  { label: "Dimensions", value: (row) => row.dimensions },
  { label: "Thread Size 1", value: (row) => row.threadSize1 },
  { label: "Thread Size 2", value: (row) => row.threadSize2 },
  { label: "Thread Size 3", value: (row) => row.threadSize3 },
  { label: "Thread Size 4", value: (row) => row.threadSize4 },
  { label: "Threadstandard", value: (row) => row.threadStandard },
  { label: "Connections", value: (row) => row.connections },
  { label: "Pressure", value: (row) => row.pressure },
  { label: "Temperature", value: (row) => row.temperature },
  { label: "Sealant", value: (row) => row.sealant },
  {
    label: "Final Assemblies Code",
    value: (row) => row.finalAssembliesCode,
  },
  { label: "Description", value: (row) => row.description },
  { label: "Applications", value: (row) => row.applications },
  { label: "Certifications", value: (row) => row.certifications },
  { label: "Additiolnotes", value: (row) => row.additionalNotes },
  { label: "Assembly 1 Uid", value: (row) => row.assemblyUid1 },
  { label: "Assembly 1 Code", value: (row) => row.assemblyCode1 },
  { label: "Assembly 2 Uid", value: (row) => row.assemblyUid2 },
  { label: "Assembly 2 Code", value: (row) => row.assemblyCode2 },
  { label: "Assembly 3 Uid", value: (row) => row.assemblyUid3 },
  { label: "Assembly 3 Code", value: (row) => row.assemblyCode3 },
  { label: "Assembly 4 Uid", value: (row) => row.assemblyUid4 },
  { label: "Assembly 4 Code", value: (row) => row.assemblyCode4 },
  { label: "Assembly 5 Uid", value: (row) => row.assemblyUid5 },
  { label: "Assembly 5 Code", value: (row) => row.assemblyCode5 },
  { label: "Assembly 6 Uid", value: (row) => row.assemblyUid6 },
  { label: "Assembly 6 Code", value: (row) => row.assemblyCode6 },
  { label: "Remark", value: (row) => row.remark },
  {
    label: "Website Active",
    value: (row) => (row.isActive ? "TRUE" : "FALSE"),
  },
  { label: "Createdat", value: (row) => row.entryCreatedAt },
  {
    label: "Status For Websit",
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
      <SearchableSelect
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
      </SearchableSelect>
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
          Add Options In Pricing Masters Before Selecting Values.
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
    masterView?: string | string[]
    q?: string
    status?: string
  }>
}) {
  await requireCapability("pricing.website_products.read", websiteProductsPath)
  const filters = await searchParams
  const activeView = externalMasterView(filters.masterView)
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const mastersRepository = createCommercialMasterRepository({
    connectionString,
  })
  const repository = createCommercialReportingRepository({ connectionString })
  let result
  let masters
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    ;[result, masters] = await Promise.all([
      repository.listWebsiteProducts({
        active:
          filters.active === "true"
            ? true
            : filters.active === "false"
              ? false
              : null,
        category: filters.category,
        organizationId,
        profileId: showDataEntry ? filters.edit : undefined,
        query: showMasterTables ? filters.q : undefined,
        status: filters.status,
      }),
      mastersRepository.snapshot(organizationId),
    ])
  } finally {
    await repository.close()
    await mastersRepository.close()
    await customers.close()
  }
  const rows = result.rows
  const editing = rows.find((row) => row.profileId === filters.edit)
  const websiteOptions = (fieldType: string) =>
    masters.websiteFields
      .filter((row) => row.fieldType === fieldType)
      .map((row) => ({ value: row.name }))

  return (
    <div className="grid gap-6">
      <MasterDataViewTabs
        activeView={activeView}
        allMastersHref={externalMasterAllMastersHref(activeView)}
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={[
              "uid",
              "description",
              "grade",
              "material",
              "size",
              "category",
              "sub_category",
              "applications",
              "certifications",
              "connections",
              "dimensions",
              "drawing_category",
              "finish_plating",
              "pressure",
              "sealant",
              "temperature",
              "thread_size_1",
              "thread_size_2",
              "thread_size_3",
              "thread_size_4",
              "website_category",
              "website_sub_category",
              "website_active",
              "created_at",
              "remark",
              "additional_notes",
            ]}
            fileName="website-product-master-template.csv"
          />
        }
        csvImportAction={
          <MasterDataCsvImportButton action={importWebsiteProductsCsvAction} />
        }
        dataEntryHref={externalMasterViewHref(
          websiteProductsPath,
          "dataEntry",
          { edit: editing?.profileId }
        )}
        exportAction={
          <Button asChild size="sm" variant="outline">
            <Link href={`${websiteProductsPath}/export.xlsx`}>Export</Link>
          </Button>
        }
        masterTablesHref={externalMasterViewHref(
          websiteProductsPath,
          "masterTables"
        )}
      />

      {showMasterTables ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Website Product Data</CardTitle>
                <CardDescription>
                  Ordered Products And Bom-Adjacent Parts With Source-Equivalent
                  Derived Codes, Status, Thread Standards, And Assembly Slots.
                </CardDescription>
              </div>
            </div>
            <BoundedResultNotice
              actionHref={`${websiteProductsPath}/export.xlsx`}
              actionLabel="Export every Website Product"
              coverage={result.coverage}
              searchQuery={filters.q?.trim()}
              section="Website Products"
            />
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem_auto_auto]">
              <input name="masterView" type="hidden" value="masterTables" />
              <Input
                aria-label="Search Website Products"
                defaultValue={filters.q}
                name="q"
                placeholder="Search Uid, Code, Description Or Grade"
              />
              <SearchableSelect
                aria-label="Filter Category"
                className={selectClassName}
                defaultValue={filters.category ?? ""}
                name="category"
              >
                <option value="">All Categories</option>
                {masters.categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </SearchableSelect>
              <SearchableSelect
                aria-label="Filter Website Status"
                className={selectClassName}
                defaultValue={filters.status ?? ""}
                name="status"
              >
                <option value="">All Statuses</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </SearchableSelect>
              <SearchableSelect
                aria-label="Filter Website Active"
                className={selectClassName}
                defaultValue={filters.active ?? ""}
                name="active"
              >
                <option value="">All Activation States</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </SearchableSelect>
              <Button type="submit">Apply Filters</Button>
              <Button asChild variant="ghost">
                <Link
                  href={externalMasterViewHref(
                    websiteProductsPath,
                    "masterTables"
                  )}
                >
                  <RotateCcw /> Reset
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showDataEntry && !editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Select Website Product</CardTitle>
            <CardDescription>
              Choose The Existing Product Profile You Want To Maintain.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <CompanyWideMasterScope />
            <BoundedResultNotice
              actionHref={`${websiteProductsPath}/export.xlsx`}
              actionLabel="Export every Website Product"
              coverage={result.coverage}
              section="Website Product choices"
            />
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input name="masterView" type="hidden" value="dataEntry" />
              <div className="grid min-w-0 flex-1 gap-2">
                <Label htmlFor="website-product-profile">Website Product</Label>
                <SearchableSelect
                  className={selectClassName}
                  id="website-product-profile"
                  name="edit"
                  required
                >
                  <option value="">Select Website Product</option>
                  {rows.map((row) => (
                    <option key={row.profileId} value={row.profileId}>
                      {row.uid} — {row.productDescription || row.partCode}
                    </option>
                  ))}
                </SearchableSelect>
              </div>
              <Button type="submit">Open For Editing</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showDataEntry && editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit {editing.uid}</CardTitle>
            <CardDescription>
              Part Code, Product Description, Material Construction, Thread
              Standard, Assembly Slots, And Completion Status Are Derived On
              Save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateWebsiteProductAction} className="grid gap-5">
              <CompanyWideMasterScope />
              <input
                name="profile_id"
                type="hidden"
                value={editing.profileId}
              />
              <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="text-muted-foreground">Partcode:</span>{" "}
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
                  label="Category"
                  name="category"
                  options={masters.categories.map((row) => ({
                    label: row.code ? `${row.code} - ${row.name}` : row.name,
                    value: row.name,
                  }))}
                />
                <SelectField
                  current={editing.subCategory}
                  label="Subcategory"
                  name="sub_category"
                  options={masters.subcategories.map((row) => ({
                    label: `${row.category} / ${row.name}`,
                    value: row.name,
                  }))}
                />
                <Field defaultValue={editing.size} label="Size" name="size" />
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
                  label="Material"
                  name="material"
                  options={websiteOptions("material")}
                />
                <Field
                  defaultValue={editing.finishPlating}
                  label="Finishplating"
                  name="finish_plating"
                />
                <Field
                  defaultValue={editing.drawingCategory}
                  label="Drawing Category"
                  name="drawing_category"
                />
                <Field
                  defaultValue={editing.dimensions}
                  label="Dimensions"
                  name="dimensions"
                />
                <Field
                  defaultValue={editing.threadSize1}
                  label="Thread Size 1"
                  name="thread_size_1"
                />
                <Field
                  defaultValue={editing.threadSize2}
                  label="Thread Size 2"
                  name="thread_size_2"
                />
                <Field
                  defaultValue={editing.threadSize3}
                  label="Thread Size 3"
                  name="thread_size_3"
                />
                <Field
                  defaultValue={editing.threadSize4}
                  label="Thread Size 4"
                  name="thread_size_4"
                />
                <SelectField
                  current={editing.connections}
                  label="Connections"
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
                  label="Temperature"
                  name="temperature"
                  options={websiteOptions("temperature")}
                />
                <SelectField
                  current={editing.sealant}
                  label="Sealant"
                  name="sealant"
                  options={websiteOptions("sealant")}
                />
                <Field
                  defaultValue={editing.websiteCategory}
                  label="Website Category"
                  name="website_category"
                />
                <Field
                  defaultValue={editing.websiteSubCategory}
                  label="Website Sub Category"
                  name="website_sub_category"
                />
                <div className="grid gap-2">
                  <Label htmlFor="is_active">Website Active</Label>
                  <SearchableSelect
                    className={selectClassName}
                    defaultValue={editing.isActive ? "TRUE" : "FALSE"}
                    id="is_active"
                    name="is_active"
                  >
                    <option value="TRUE">True</option>
                    <option value="FALSE">False</option>
                  </SearchableSelect>
                </div>
                <Field
                  defaultValue={editing.entryCreatedAt}
                  label="Createdat"
                  name="entry_created_at"
                  type="date"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <OptionChecklist
                  current={editing.applications}
                  label="Applications"
                  name="applications"
                  options={masters.applications.map((row) => row.name)}
                />
                <OptionChecklist
                  current={editing.certifications}
                  label="Certifications"
                  name="certifications"
                  options={masters.certifications.map((row) => row.name)}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    defaultValue={editing.description ?? ""}
                    id="description"
                    name="description"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="additional_notes">Additiolnotes</Label>
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
                  <Link
                    href={externalMasterViewHref(
                      websiteProductsPath,
                      "masterTables"
                    )}
                  >
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showMasterTables ? (
        <Card>
          <CardHeader>
            <CardTitle>Website Product Excel View</CardTitle>
            <CardDescription>
              Showing {result.coverage.returned} Ordered Product Rows.
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
                              href={externalMasterViewHref(
                                websiteProductsPath,
                                "dataEntry",
                                { edit: row.profileId }
                              )}
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
                        No Website Products Match These Filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
