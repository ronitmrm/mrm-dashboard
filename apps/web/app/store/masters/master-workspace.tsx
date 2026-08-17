"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  createStoreAssetCategoryAction,
  createStoreAssetNameAction,
  createStoreAssetSubcategoryAction,
  createStoreItemTypeAction,
  createStoreLocationAction,
  createStoreSupplierPriceAction,
  createStoreSupplierAction,
  createStoreVendorAction,
} from "../actions"

const masterOptions = [
  ["ITEM_TYPE", "Store Item Type"],
  ["CATEGORY", "Asset Category"],
  ["SUBCATEGORY", "Asset Subcategory"],
  ["ASSET_NAME", "Asset Name"],
  ["LOCATION", "Store Location"],
  ["SUPPLIER", "Supplier"],
  ["SUPPLIER_PRICE", "Supplier Price"],
  ["VENDOR", "Vendor"],
] as const

type MasterKey = (typeof masterOptions)[number][0]

export type StoreMasterData = {
  items: Array<{
    assetCategory: string
    assetName: string
    assetSubcategory: string
    assetType: string
    id: string
    identificationName: string
    typeCode: string
    unit: string
  }>
  locations: Array<{
    code: string
    id: string
    locationType: string
    name: string
  }>
  masters: {
    assetNames: Array<{
      categoryName: string
      id: string
      name: string
      subcategoryName: string
    }>
    categories: Array<{ id: string; name: string }>
    subcategories: Array<{
      categoryId: string
      categoryName: string
      id: string
      name: string
    }>
  }
  suppliers: Array<{
    code: string
    contactDetails: string | null
    email: string | null
    id: string
    name: string
  }>
  supplierPrices: Array<{
    id: string
    itemName: string
    itemTypeId: string
    quoteReference: string | null
    supplierId: string
    supplierName: string
    typeCode: string
    unitPrice: string
    validFrom: string
  }>
  vendors: Array<{
    code: string
    contactDetails: string | null
    id: string
    name: string
  }>
}

export function StoreMasterWorkspace({
  canManage,
  data,
  mode = "combined",
}: {
  canManage: boolean
  data: StoreMasterData
  mode?: "combined" | "entry" | "table"
}) {
  const [selectedMaster, setSelectedMaster] = useState<MasterKey>("ITEM_TYPE")
  const selectedLabel =
    masterOptions.find(([key]) => key === selectedMaster)?.[1] ?? "Master"
  const rows = masterRows(selectedMaster, data)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "table"
              ? "Select Store Master Table"
              : "Select Store Data Entry"}
          </CardTitle>
          <CardDescription>
            Select one Store master. Only the corresponding{" "}
            {mode === "table" ? "saved records" : "entry form"} are shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-xl">
            <FieldLabel htmlFor="store-master-selector">Master</FieldLabel>
            <NativeSelect
              id="store-master-selector"
              onChange={(event) =>
                setSelectedMaster(event.target.value as MasterKey)
              }
              value={selectedMaster}
            >
              {masterOptions.map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      {canManage && mode !== "table" ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedLabel} Data Entry</CardTitle>
          </CardHeader>
          <CardContent>{masterForm(selectedMaster, data)}</CardContent>
        </Card>
      ) : null}

      {mode !== "entry" ? (
        <Card>
          <CardHeader>
            <CardTitle>Saved {selectedLabel} Records</CardTitle>
            <CardDescription>{rows.length} active records</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.details}</TableCell>
                  </TableRow>
                ))}
                {!rows.length ? (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={3}
                    >
                      No saved records for this master.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function masterRows(selectedMaster: MasterKey, data: StoreMasterData) {
  switch (selectedMaster) {
    case "ITEM_TYPE":
      return data.items.map((item) => ({
        code: item.typeCode,
        details: `${item.assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable"} · ${item.assetCategory} / ${item.assetSubcategory} / ${item.assetName} · ${item.unit}`,
        key: item.id,
        name: item.identificationName,
      }))
    case "CATEGORY":
      return data.masters.categories.map((category) => ({
        code: "—",
        details: "Asset Category",
        key: category.id,
        name: category.name,
      }))
    case "SUBCATEGORY":
      return data.masters.subcategories.map((subcategory) => ({
        code: "—",
        details: `Category: ${subcategory.categoryName}`,
        key: subcategory.id,
        name: subcategory.name,
      }))
    case "ASSET_NAME":
      return data.masters.assetNames.map((assetName) => ({
        code: "—",
        details: `${assetName.categoryName} / ${assetName.subcategoryName}`,
        key: assetName.id,
        name: assetName.name,
      }))
    case "LOCATION":
      return data.locations.map((location) => ({
        code: location.code,
        details: location.locationType,
        key: location.id,
        name: location.name,
      }))
    case "SUPPLIER":
      return data.suppliers.map((supplier) => ({
        code: supplier.code,
        details:
          [supplier.email, supplier.contactDetails]
            .filter(Boolean)
            .join(" · ") || "No contact details",
        key: supplier.id,
        name: supplier.name,
      }))
    case "SUPPLIER_PRICE":
      return data.supplierPrices.map((price) => ({
        code: price.typeCode,
        details: `${price.supplierName} · ₹ ${price.unitPrice} · Effective ${price.validFrom}${price.quoteReference ? ` · ${price.quoteReference}` : ""}`,
        key: price.id,
        name: price.itemName,
      }))
    case "VENDOR":
      return data.vendors.map((vendor) => ({
        code: vendor.code,
        details: vendor.contactDetails || "No contact details",
        key: vendor.id,
        name: vendor.name,
      }))
  }
}

function masterForm(selectedMaster: MasterKey, data: StoreMasterData) {
  switch (selectedMaster) {
    case "ITEM_TYPE":
      return (
        <form action={createStoreItemTypeAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Identification Name"
              name="identification_name"
              required
            />
            <SelectField
              label="Asset Type"
              name="asset_type"
              options={[
                { label: "Non Consumable", value: "NON_CONSUMABLE" },
                { label: "Consumable", value: "CONSUMABLE" },
              ]}
            />
            <SelectField
              label="Category"
              name="asset_category_id"
              options={data.masters.categories.map((row) => ({
                label: row.name,
                value: row.id,
              }))}
            />
            <SelectField
              label="Subcategory"
              name="asset_subcategory_id"
              options={data.masters.subcategories.map((row) => ({
                label: `${row.categoryName} — ${row.name}`,
                value: row.id,
              }))}
            />
            <SelectField
              label="Asset Name"
              name="asset_name_id"
              options={data.masters.assetNames.map((row) => ({
                label: `${row.categoryName} — ${row.subcategoryName} — ${row.name}`,
                value: row.id,
              }))}
            />
            <TextField
              label="For Product / Item Code"
              name="applicable_item_code"
            />
            <TextField label="Drawing Number" name="drawing_number" />
            <TextField defaultValue="Nos" label="Unit" name="unit" required />
            <TextField
              defaultValue="0"
              label="Minimum Stock Alert"
              name="minimum_stock"
              type="number"
            />
          </FieldGroup>
          <Button
            className="mt-5"
            disabled={!data.masters.assetNames.length}
            type="submit"
          >
            Create & Generate Asset Code
          </Button>
        </form>
      )
    case "CATEGORY":
      return (
        <form action={createStoreAssetCategoryAction}>
          <TextField
            label="Category Name"
            name="asset_category_name"
            required
          />
          <Button className="mt-5" type="submit">
            Save Category
          </Button>
        </form>
      )
    case "SUBCATEGORY":
      return (
        <form action={createStoreAssetSubcategoryAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Category"
              name="asset_category_id"
              options={data.masters.categories.map((row) => ({
                label: row.name,
                value: row.id,
              }))}
            />
            <TextField
              label="Subcategory Name"
              name="asset_subcategory_name"
              required
            />
          </FieldGroup>
          <Button
            className="mt-5"
            disabled={!data.masters.categories.length}
            type="submit"
          >
            Save Subcategory
          </Button>
        </form>
      )
    case "ASSET_NAME":
      return (
        <form action={createStoreAssetNameAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Subcategory"
              name="asset_subcategory_id"
              options={data.masters.subcategories.map((row) => ({
                label: `${row.categoryName} — ${row.name}`,
                value: row.id,
              }))}
            />
            <TextField label="Asset Name" name="asset_name" required />
          </FieldGroup>
          <Button
            className="mt-5"
            disabled={!data.masters.subcategories.length}
            type="submit"
          >
            Save Asset Name
          </Button>
        </form>
      )
    case "LOCATION":
      return (
        <form action={createStoreLocationAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <TextField label="Code" name="location_code" required />
            <TextField label="Name" name="location_name" required />
            <SelectField
              label="Type"
              name="location_type"
              options={[
                { label: "Store", value: "STORE" },
                { label: "Unit", value: "UNIT" },
                { label: "Department", value: "DEPARTMENT" },
              ]}
            />
          </FieldGroup>
          <Button className="mt-5" type="submit">
            Save Location
          </Button>
        </form>
      )
    case "SUPPLIER":
      return (
        <form action={createStoreSupplierAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <TextField label="Supplier Code" name="supplier_code" required />
            <TextField label="Supplier Name" name="supplier_name" required />
            <TextField
              label="Supplier Email"
              name="supplier_email"
              type="email"
            />
            <TextField label="Contact Details" name="contact_details" />
          </FieldGroup>
          <Button className="mt-5" type="submit">
            Save Supplier
          </Button>
        </form>
      )
    case "SUPPLIER_PRICE":
      return (
        <form action={createStoreSupplierPriceAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Store Item"
              name="item_type_id"
              options={data.items.map((item) => ({
                label: `${item.typeCode} — ${item.identificationName}`,
                value: item.id,
              }))}
            />
            <SelectField
              label="Supplier"
              name="supplier_id"
              options={data.suppliers.map((supplier) => ({
                label: `${supplier.code} — ${supplier.name}`,
                value: supplier.id,
              }))}
            />
            <TextField
              label="Unit Price"
              min="0"
              name="unit_price"
              required
              step="0.01"
              type="number"
            />
            <TextField label="Effective From" name="valid_from" type="date" />
            <TextField label="Quote Reference" name="quote_reference" />
          </FieldGroup>
          <Button
            className="mt-5"
            disabled={!data.items.length || !data.suppliers.length}
            type="submit"
          >
            Save Supplier Price
          </Button>
        </form>
      )
    case "VENDOR":
      return (
        <form action={createStoreVendorAction}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <TextField label="Vendor Code" name="vendor_code" required />
            <TextField label="Vendor Name" name="vendor_name" required />
            <TextField label="Contact Details" name="contact_details" />
          </FieldGroup>
          <Button className="mt-5" type="submit">
            Save Vendor
          </Button>
        </form>
      )
  }
}

function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `master-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
    </Field>
  )
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string
  name: string
  options: Array<{ label: string; value: string }>
}) {
  const id = `master-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required>
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
