"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Pencil, Trash2 } from "lucide-react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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

import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"
import { masterSelectionFromContext } from "@/lib/master-module"

import {
  createStoreAssetCategoryAction,
  createStoreAssetNameAction,
  createStoreAssetSubcategoryAction,
  createStoreItemTypeAction,
  createStoreLocationAction,
  createStoreSupplierPriceAction,
  createStoreSupplierAction,
  createStoreVendorAction,
  deleteStoreMasterAction,
  uploadStoreItemDrawingAction,
} from "../actions"
import {
  findExistingStoreItem,
  normalizeStoreMasterKey,
  storeMasterShowsCode,
  storeMasterOptions,
  type StoreMasterKey,
} from "@/lib/store-master-selection"

type StoreMasterRow = {
  code?: string
  details: string
  editable: boolean
  editDefaults: Record<string, string>
  key: string
  kind: string
  name: string
}

export type StoreMasterData = {
  itemDrawings: Array<{
    fileName: string
    id: string
    itemTypeId: string
    storageKey: string
  }>
  items: Array<{
    assetCategory: string
    assetCategoryId: string
    assetName: string
    assetNameId: string
    assetSubcategory: string
    assetSubcategoryId: string
    assetType: string
    applicableItemCode?: string | null
    drawingNumber?: string | null
    id: string
    identificationName: string
    minimumStock?: string
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
      subcategoryId: string
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
    address: string | null
    code: string
    contactDetails: string | null
    email: string | null
    gstNumber: string | null
    id: string
    name: string
  }>
  supplierPrices: Array<{
    active: boolean
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
  const searchParams = useSearchParams()
  const selectionLocked =
    mode === "table" || Boolean(masterSelectionFromContext(searchParams))
  const selectedMaster = normalizeStoreMasterKey(
    searchParams.get("storeMaster")
  )
  const [editRow, setEditRow] = useState<StoreMasterRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<StoreMasterRow | null>(null)
  const selectedLabel =
    storeMasterOptions.find(([key]) => key === selectedMaster)?.[1] ?? "Master"
  const rows = masterRows(selectedMaster, data)
  const showsCode = storeMasterShowsCode(selectedMaster)

  function selectMaster(master: StoreMasterKey) {
    const url = new URL(window.location.href)
    url.searchParams.set("storeMaster", master)
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="grid gap-6">
      {!selectionLocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Select Store Master</CardTitle>
          </CardHeader>
          <CardContent>
            <Field className="max-w-xl">
              <FieldLabel htmlFor="store-master-selector">Master</FieldLabel>
              <NativeSelect
                id="store-master-selector"
                onChange={(event) =>
                  selectMaster(event.target.value as StoreMasterKey)
                }
                value={selectedMaster}
              >
                {storeMasterOptions.map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>
      ) : null}

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
            {selectedMaster === "ITEM_TYPE" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Subcategory</TableHead>
                    <TableHead>Asset Name</TableHead>
                    <TableHead>Asset Type</TableHead>
                    <TableHead>Identification</TableHead>
                    <TableHead>Drawing</TableHead>
                    <TableHead>Unit</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => {
                    const row = rows.find(
                      (candidate) => candidate.key === item.id
                    )!
                    const drawing = data.itemDrawings.find(
                      (candidate) => candidate.itemTypeId === item.id
                    )
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <Link
                            className="underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                            href={storeAssetWorkspaceHref(item.typeCode)}
                          >
                            {item.typeCode}
                          </Link>
                        </TableCell>
                        <TableCell>{item.assetCategory}</TableCell>
                        <TableCell>{item.assetSubcategory}</TableCell>
                        <TableCell>{item.assetName}</TableCell>
                        <TableCell>
                          {item.assetType === "NON_CONSUMABLE"
                            ? "Non Consumable"
                            : "Consumable"}
                        </TableCell>
                        <TableCell>{item.identificationName}</TableCell>
                        <TableCell>
                          {drawing ? (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`/store/items/${item.id}/drawings/${drawing.id}`}
                              >
                                {drawing.fileName}
                              </a>
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                        {canManage ? (
                          <TableCell>
                            <div className="grid min-w-72 gap-2">
                              <form
                                action={uploadStoreItemDrawingAction}
                                className="flex gap-2"
                                encType="multipart/form-data"
                              >
                                <input
                                  name="item_type_id"
                                  type="hidden"
                                  value={item.id}
                                />
                                <Input
                                  accept="application/pdf,image/jpeg,image/png"
                                  aria-label={`Drawing for ${item.typeCode}`}
                                  name="asset_drawing"
                                  required
                                  type="file"
                                />
                                <Button
                                  size="sm"
                                  type="submit"
                                  variant="outline"
                                >
                                  {drawing ? "Replace" : "Upload"}
                                </Button>
                              </form>
                              <div className="flex justify-end gap-1">
                                <Button
                                  onClick={() => setEditRow(row)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <Pencil className="size-3.5" /> Edit
                                </Button>
                                <Button
                                  onClick={() => setDeleteRow(row)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <Trash2 className="size-3.5" /> Delete
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {showsCode ? <TableHead>Code</TableHead> : null}
                    <TableHead>Name</TableHead>
                    <TableHead>Details</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      {showsCode ? (
                        <TableCell className="font-medium">
                          {row.code}
                        </TableCell>
                      ) : null}
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.details}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {row.editable ? (
                              <Button
                                onClick={() => setEditRow(row)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Pencil className="size-3.5" /> Edit
                              </Button>
                            ) : null}
                            <Button
                              onClick={() => setDeleteRow(row)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Trash2 className="size-3.5" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={(showsCode ? 3 : 2) + (canManage ? 1 : 0)}
                      >
                        No saved records for this master.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Dialog
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {selectedLabel}</DialogTitle>
            <DialogDescription>
              Codes remain fixed. Changes apply everywhere this master is
              referenced.
            </DialogDescription>
          </DialogHeader>
          {editRow
            ? masterForm(selectedMaster, data, editRow.editDefaults)
            : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteRow)}
        onOpenChange={(open) => {
          if (!open) setDeleteRow(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedLabel}</DialogTitle>
            <DialogDescription>
              Unused records delete immediately. If this record is used, choose
              a replacement before deleting it.
            </DialogDescription>
          </DialogHeader>
          {deleteRow ? (
            <form action={deleteStoreMasterAction} className="grid gap-4">
              <input name="master_id" type="hidden" value={deleteRow.key} />
              <input name="master_kind" type="hidden" value={deleteRow.kind} />
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {deleteRow.code ? `${deleteRow.code} — ` : ""}
                {deleteRow.name}
              </div>
              <SelectField
                label="Replacement (Required Only If Used)"
                name="replacement_master_id"
                required={false}
                options={rows
                  .filter((row) => row.key !== deleteRow.key)
                  .map((row) => ({
                    label: `${row.code} — ${row.name}`,
                    value: row.key,
                  }))}
                placeholder="No replacement — record must be unused"
              />
              <TextField
                label="Reason For Deletion"
                name="deletion_reason"
                required
              />
              <DialogFooter>
                <Button
                  onClick={() => setDeleteRow(null)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function masterRows(
  selectedMaster: StoreMasterKey,
  data: StoreMasterData
): StoreMasterRow[] {
  switch (selectedMaster) {
    case "ITEM_TYPE":
      return data.items.map((item) => ({
        code: item.typeCode,
        details: `${item.assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable"} · ${item.assetCategory} / ${item.assetSubcategory} / ${item.assetName} · ${item.unit}`,
        key: item.id,
        kind: "store_item_type",
        name: item.identificationName,
        editable: true,
        editDefaults: {
          applicable_item_code: item.applicableItemCode ?? "",
          asset_category_id: item.assetCategoryId,
          asset_name_id: item.assetNameId,
          asset_subcategory_id: item.assetSubcategoryId,
          asset_type: item.assetType,
          drawing_number: item.drawingNumber ?? "",
          identification_name: item.identificationName,
          master_id: item.id,
          minimum_stock: item.minimumStock ?? "0",
          type_code: item.typeCode,
          unit: item.unit,
        },
      }))
    case "CATEGORY":
      return data.masters.categories.map((category) => ({
        details: "Asset Category",
        key: category.id,
        kind: "store_category",
        name: category.name,
        editable: true,
        editDefaults: {
          asset_category_name: category.name,
          master_id: category.id,
        },
      }))
    case "SUBCATEGORY":
      return data.masters.subcategories.map((subcategory) => ({
        details: `Category: ${subcategory.categoryName}`,
        key: subcategory.id,
        kind: "store_subcategory",
        name: subcategory.name,
        editable: true,
        editDefaults: {
          asset_category_id: subcategory.categoryId,
          asset_subcategory_name: subcategory.name,
          master_id: subcategory.id,
        },
      }))
    case "ASSET_NAME":
      return data.masters.assetNames.map((assetName) => ({
        details: `${assetName.categoryName} / ${assetName.subcategoryName}`,
        key: assetName.id,
        kind: "store_asset_name",
        name: assetName.name,
        editable: true,
        editDefaults: {
          asset_name: assetName.name,
          asset_subcategory_id: assetName.subcategoryId,
          master_id: assetName.id,
        },
      }))
    case "LOCATION":
      return data.locations.map((location) => ({
        code: location.code,
        details: location.locationType,
        key: location.id,
        kind: "store_location",
        name: location.name,
        editable: true,
        editDefaults: {
          location_code: location.code,
          location_name: location.name,
          location_type: location.locationType,
          master_id: location.id,
        },
      }))
    case "SUPPLIER":
      return data.suppliers.map((supplier) => ({
        code: supplier.code,
        details:
          [
            supplier.gstNumber,
            supplier.email,
            supplier.contactDetails,
            supplier.address,
          ]
            .filter(Boolean)
            .join(" · ") || "No contact details",
        key: supplier.id,
        kind: "store_supplier",
        name: supplier.name,
        editable: true,
        editDefaults: {
          contact_details: supplier.contactDetails ?? "",
          gst_number: supplier.gstNumber ?? "",
          master_id: supplier.id,
          supplier_address: supplier.address ?? "",
          supplier_code: supplier.code,
          supplier_email: supplier.email ?? "",
          supplier_name: supplier.name,
        },
      }))
    case "SUPPLIER_PRICE":
      return data.supplierPrices.map((price) => ({
        code: price.typeCode,
        details: `${price.supplierName} · ₹ ${price.unitPrice} · Effective ${price.validFrom} · ${price.active ? "Active" : "History"}${price.quoteReference ? ` · ${price.quoteReference}` : ""}`,
        key: price.id,
        kind: "store_supplier_price",
        name: price.itemName,
        editable: false,
        editDefaults: {},
      }))
    case "VENDOR":
      return data.vendors.map((vendor) => ({
        code: vendor.code,
        details: vendor.contactDetails || "No contact details",
        key: vendor.id,
        kind: "store_vendor",
        name: vendor.name,
        editable: true,
        editDefaults: {
          contact_details: vendor.contactDetails ?? "",
          master_id: vendor.id,
          vendor_code: vendor.code,
          vendor_name: vendor.name,
        },
      }))
  }
}

function masterForm(
  selectedMaster: StoreMasterKey,
  data: StoreMasterData,
  defaults: Record<string, string> = {}
) {
  const editing = Boolean(defaults.master_id)
  switch (selectedMaster) {
    case "ITEM_TYPE":
      return <StoreItemTypeForm data={data} defaults={defaults} />
    case "CATEGORY":
      return (
        <form action={createStoreAssetCategoryAction}>
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <TextField
            defaultValue={defaults.asset_category_name}
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
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              defaultValue={defaults.asset_category_id}
              label="Parent Category"
              name="asset_category_id"
              options={data.masters.categories.map((row) => ({
                label: row.name,
                value: row.id,
              }))}
            />
            <TextField
              defaultValue={defaults.asset_subcategory_name}
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
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              defaultValue={defaults.asset_subcategory_id}
              label="Subcategory"
              name="asset_subcategory_id"
              options={data.masters.subcategories.map((row) => ({
                label: `${row.categoryName} — ${row.name}`,
                value: row.id,
              }))}
            />
            <TextField
              defaultValue={defaults.asset_name}
              label="Asset Name"
              name="asset_name"
              required
            />
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
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <TextField
              defaultValue={defaults.location_code}
              label="Code"
              name="location_code"
              readOnly={editing}
              required
            />
            <TextField
              defaultValue={defaults.location_name}
              label="Name"
              name="location_name"
              required
            />
            <SelectField
              defaultValue={defaults.location_type}
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
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <p className="mb-4 text-sm text-muted-foreground">
            Supplier Code is generated automatically when the record is saved.
          </p>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <TextField
              defaultValue={defaults.supplier_name}
              label="Supplier Name"
              name="supplier_name"
              required
            />
            <TextField
              defaultValue={defaults.gst_number}
              label="GST Number"
              name="gst_number"
            />
            <TextField
              defaultValue={defaults.supplier_email}
              label="Supplier Email"
              name="supplier_email"
              type="email"
            />
            <TextField
              defaultValue={defaults.contact_details}
              label="Contact Details"
              name="contact_details"
            />
            <TextField
              defaultValue={defaults.supplier_address}
              label="Supplier Address"
              name="supplier_address"
            />
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
          <input
            name="master_id"
            type="hidden"
            value={defaults.master_id ?? ""}
          />
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <TextField
              defaultValue={defaults.vendor_code}
              label="Vendor Code"
              name="vendor_code"
              readOnly={editing}
              required
            />
            <TextField
              defaultValue={defaults.vendor_name}
              label="Vendor Name"
              name="vendor_name"
              required
            />
            <TextField
              defaultValue={defaults.contact_details}
              label="Contact Details"
              name="contact_details"
            />
          </FieldGroup>
          <Button className="mt-5" type="submit">
            Save Vendor
          </Button>
        </form>
      )
  }
}

function StoreItemTypeForm({
  data,
  defaults,
}: {
  data: StoreMasterData
  defaults: Record<string, string>
}) {
  const editing = Boolean(defaults.master_id)
  const initialAssetType = defaults.asset_type ?? "NON_CONSUMABLE"
  const initialCategoryId =
    defaults.asset_category_id ?? data.masters.categories[0]?.id ?? ""
  const initialSubcategoryId =
    defaults.asset_subcategory_id ??
    data.masters.subcategories.find(
      (row) => row.categoryId === initialCategoryId
    )?.id ??
    ""
  const initialAssetNameId =
    defaults.asset_name_id ??
    data.masters.assetNames.find(
      (row) => row.subcategoryId === initialSubcategoryId
    )?.id ??
    ""
  const [assetType, setAssetType] = useState(initialAssetType)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [subcategoryId, setSubcategoryId] = useState(initialSubcategoryId)
  const [assetNameId, setAssetNameId] = useState(initialAssetNameId)
  const subcategories = data.masters.subcategories.filter(
    (row) => row.categoryId === categoryId
  )
  const assetNames = data.masters.assetNames.filter(
    (row) => row.subcategoryId === subcategoryId
  )
  const existingItem = findExistingStoreItem(
    data.items,
    {
      assetCategoryId: categoryId,
      assetNameId,
      assetSubcategoryId: subcategoryId,
      assetType,
    },
    defaults.master_id
  )

  function selectCategory(nextCategoryId: string) {
    const nextSubcategoryId =
      data.masters.subcategories.find(
        (row) => row.categoryId === nextCategoryId
      )?.id ?? ""
    const nextAssetNameId =
      data.masters.assetNames.find(
        (row) => row.subcategoryId === nextSubcategoryId
      )?.id ?? ""
    setCategoryId(nextCategoryId)
    setSubcategoryId(nextSubcategoryId)
    setAssetNameId(nextAssetNameId)
  }

  function selectSubcategory(nextSubcategoryId: string) {
    setSubcategoryId(nextSubcategoryId)
    setAssetNameId(
      data.masters.assetNames.find(
        (row) => row.subcategoryId === nextSubcategoryId
      )?.id ?? ""
    )
  }

  return (
    <form action={createStoreItemTypeAction} encType="multipart/form-data">
      <input name="master_id" type="hidden" value={defaults.master_id ?? ""} />
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        {editing ? (
          <TextField
            defaultValue={defaults.type_code}
            label="Asset Code"
            name="type_code"
            readOnly
          />
        ) : null}
        <TextField
          defaultValue={defaults.identification_name}
          label="Identification"
          name="identification_name"
          required
        />
        {editing ? (
          <input name="asset_type" type="hidden" value={defaults.asset_type} />
        ) : null}
        <SelectField
          disabled={editing}
          label="Asset Type"
          name={editing ? "asset_type_display" : "asset_type"}
          onChange={(event) => setAssetType(event.target.value)}
          options={[
            { label: "Non Consumable", value: "NON_CONSUMABLE" },
            { label: "Consumable", value: "CONSUMABLE" },
          ]}
          value={assetType}
        />
        <SelectField
          label="Category"
          name="asset_category_id"
          onChange={(event) => selectCategory(event.target.value)}
          options={data.masters.categories.map((row) => ({
            label: row.name,
            value: row.id,
          }))}
          value={categoryId}
        />
        <SelectField
          label="Subcategory"
          name="asset_subcategory_id"
          onChange={(event) => selectSubcategory(event.target.value)}
          options={subcategories.map((row) => ({
            label: row.name,
            value: row.id,
          }))}
          value={subcategoryId}
        />
        <SelectField
          label="Asset Name"
          name="asset_name_id"
          onChange={(event) => setAssetNameId(event.target.value)}
          options={assetNames.map((row) => ({
            label: row.name,
            value: row.id,
          }))}
          value={assetNameId}
        />
        <TextField
          defaultValue={defaults.applicable_item_code}
          label="For Product / Item Code"
          name="applicable_item_code"
        />
        <TextField
          defaultValue={defaults.drawing_number}
          label="Drawing Number"
          name="drawing_number"
        />
        <TextField
          defaultValue={defaults.unit ?? "Nos"}
          label="Unit"
          name="unit"
          required
        />
        <TextField
          defaultValue={defaults.minimum_stock ?? "0"}
          label="Minimum Stock Alert"
          name="minimum_stock"
          type="number"
        />
        <Field>
          <FieldLabel htmlFor="master-asset-drawing">
            Asset Drawing (PDF, JPG, or PNG)
          </FieldLabel>
          <Input
            accept="application/pdf,image/jpeg,image/png"
            id="master-asset-drawing"
            name="asset_drawing"
            type="file"
          />
        </Field>
      </FieldGroup>
      {!editing && existingItem ? (
        <div className="mt-5 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="font-semibold">
            Existing Asset Code: {existingItem.typeCode}
          </div>
          <div>
            {existingItem.identificationName}. This exact combination already
            exists, so no new code will be generated.
          </div>
        </div>
      ) : null}
      <Button
        className="mt-5"
        disabled={!assetNameId || Boolean(existingItem)}
        type="submit"
      >
        {editing
          ? "Save Changes"
          : existingItem
            ? `Existing Code ${existingItem.typeCode}`
            : "Create & Generate Asset Code"}
      </Button>
    </form>
  )
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
  defaultValue,
  disabled = false,
  label,
  name,
  onChange,
  options,
  placeholder,
  required = true,
  value,
}: {
  defaultValue?: string
  disabled?: boolean
  label: string
  name: string
  onChange?: React.ChangeEventHandler<HTMLSelectElement>
  options: Array<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
  value?: string
}) {
  const id = `master-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        defaultValue={defaultValue}
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        required={required}
        value={value}
      >
        {placeholder ? (
          <NativeSelectOption value="">{placeholder}</NativeSelectOption>
        ) : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
