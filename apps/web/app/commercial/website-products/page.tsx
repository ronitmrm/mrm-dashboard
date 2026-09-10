import {
  createCommercialMasterRepository,
  createCommercialReportingRepository,
  createCustomerRepository,
  type WebsiteProductRow,
} from "@workspace/db"
import { Pencil } from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { BoundedResultNotice } from "@/components/bounded-result-notice"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { DataDownloadButton } from "@/components/data-download-button"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import {
  requireCapability,
  listGrantedCapabilities,
} from "@/lib/auth/require-capability"
import {
  externalMasterAllMastersHref,
  externalMasterView,
  externalMasterViewHref,
} from "@/lib/external-master-workspace"

import { websiteProductFields, websiteProductValue } from "./fields"

import { updateWebsiteProductAction } from "./actions"
import { importWebsiteProductsCsvAction } from "./import-action"

const websiteProductsPath = "/commercial/website-products"
const selectClassName =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

const columns = websiteProductFields.map((field) => ({
  label: field.label,
  value: (row: WebsiteProductRow) => websiteProductValue(row, field.key),
}))

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
    edit?: string
    masterView?: string | string[]
  }>
}) {
  const session = await requireCapability(
    "masters.universal.commercial_website_products.read",
    websiteProductsPath
  )
  const canSave =
    (
      await listGrantedCapabilities(session.user.id, [
        "masters.universal.commercial_website_products.save",
      ])
    ).length > 0
  const filters = await searchParams
  const activeView = canSave
    ? externalMasterView(filters.masterView)
    : "masterTables"
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
      showMasterTables
        ? repository
            .listWebsiteProductsForExport({ organizationId })
            .then((rows) => ({
              rows,
              coverage: {
                limit: rows.length,
                returned: rows.length,
                total: rows.length,
                truncated: false,
              },
            }))
        : repository.listWebsiteProducts({
            organizationId,
            profileId: filters.edit,
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
            columns={websiteProductFields.map((field) => field.header)}
            fileName="website-product-master-template.csv"
          />
        }
        csvImportAction={
          canSave ? (
            <MasterDataCsvImportButton
              action={importWebsiteProductsCsvAction}
            />
          ) : null
        }
        dataEntryHref={externalMasterViewHref(
          websiteProductsPath,
          "dataEntry",
          { edit: editing?.profileId }
        )}
        exportAction={
          <DataDownloadButton href={`${websiteProductsPath}/export.xlsx`} />
        }
        masterTablesHref={externalMasterViewHref(
          websiteProductsPath,
          "masterTables"
        )}
      />

      {showMasterTables ? (
        <MetricSummary
          scope="All website products · before table filters"
          items={[
            {
              label: "Product Profiles",
              value: rows.length,
              tone: "information",
            },
            {
              label: "Website Active",
              value: rows.filter((row) => row.isActive).length,
              tone: "positive",
            },
            {
              label: "Completed Profiles",
              value: rows.filter((row) => row.websiteStatus === "Completed")
                .length,
              tone: "brand",
            },
          ]}
        />
      ) : null}

      {showDataEntry && !editing ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Select Website Product</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <CompanyWideMasterScope />
            <BoundedResultNotice
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
        </SectionCard>
      ) : null}

      {showDataEntry && editing ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Edit {editing.uid}</CardTitle>
            <CardDescription>
              Part Code, Product Description, Material Construction, Thread
              Standard, Assembly Slots, And Completion Status Are Derived On
              Save. Size, Category And Subcategory Come From Product Portfolio.
              Grade Is Entered Separately For The Website Catalogue.
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
                <Field defaultValue={editing.grade} label="Grade" name="grade" />
                {[
                  ["Size", editing.size],
                  ["Category", editing.category],
                  ["Subcategory", editing.subCategory],
                ].map(([label, value]) => (
                  <div className="grid gap-2" key={label}>
                    <span className="text-sm font-medium">{label}</span>
                    <p className="text-sm">{value || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      From Product Portfolio
                    </p>
                  </div>
                ))}
                <SelectField
                  current={editing.material}
                  label="Material"
                  name="material"
                  options={websiteOptions("material")}
                />
                <Field
                  defaultValue={editing.finishPlating}
                  label="Finish Plating"
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
                  label="Created At"
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
                  <Label htmlFor="additional_notes">Additional Notes</Label>
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
        </SectionCard>
      ) : null}

      {showMasterTables ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Website Product Excel View</CardTitle>
            <CardDescription>
              Showing {result.coverage.returned} Ordered Product Rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              containerClassName="max-h-[70vh] rounded-2xl border"
              filterStorageKey="website-products"
              className="min-w-max text-xs"
            >
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
                        {canSave ? (
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
                        ) : null}
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
            </OperationalTable>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
