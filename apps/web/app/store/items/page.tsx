import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { formatIstDateTime } from "@/lib/date-time"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import {
  createStoreAssetCategoryAction,
  createStoreAssetNameAction,
  createStoreAssetSubcategoryAction,
  createStoreItemTypeAction,
  createStoreLocationAction,
  createStoreSupplierAction,
  receiveStoreStockAction,
} from "../actions"

export default async function StoreItemsPage() {
  const session = await requireCapability("store.read", "/store/items")
  const canManage =
    (await listGrantedCapabilities(session.user.id, ["store.manage"])).length >
    0
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, locations, suppliers, prices, movements, masters] =
      await Promise.all([
        repository.listItemTypes(organizationId),
        repository.listLocations(organizationId),
        repository.listSuppliers(organizationId),
        repository.listSupplierPrices(organizationId),
        repository.listRecentStockMovements(organizationId),
        repository.listAssetClassificationMasters(organizationId),
      ])
    return { items, locations, masters, movements, prices, suppliers }
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Items & Receipts
        </h2>
        <p className="text-sm text-muted-foreground">
          Create the shared code once, then receive it into any Store location.
        </p>
      </div>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create Asset / Item Type</CardTitle>
              <CardDescription>
                Type Code is generated automatically after selecting the
                maintained classification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createStoreItemTypeAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="Identification Name"
                    name="identification_name"
                    required
                  />
                  <TextField label="Asset Type" name="asset_type" required />
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
                  <Field>
                    <FieldLabel htmlFor="tracking-mode">Tracking</FieldLabel>
                    <NativeSelect id="tracking-mode" name="tracking_mode">
                      <NativeSelectOption value="SERIALIZED">
                        Returnable / Individually Numbered
                      </NativeSelectOption>
                      <NativeSelectOption value="CONSUMABLE">
                        Consumable / Quantity Only
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <TextField
                    defaultValue="Nos"
                    label="Unit"
                    name="unit"
                    required
                  />
                  <TextField
                    defaultValue="0"
                    label="Minimum Stock Alert"
                    name="minimum_stock"
                    type="number"
                  />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={
                    !data.masters.categories.length ||
                    !data.masters.subcategories.length ||
                    !data.masters.assetNames.length
                  }
                  type="submit"
                >
                  Create & Generate Type Code
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asset Category Master</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asset Subcategory Master</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asset Name Master</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receive Stock</CardTitle>
              <CardDescription>
                Serialized receipts automatically generate one Asset Code per
                physical asset.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={receiveStoreStockAction}
                encType="multipart/form-data"
              >
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Item"
                    name="item_type_id"
                    options={data.items.map((item) => ({
                      label: `${item.typeCode} — ${item.identificationName}`,
                      value: item.id,
                    }))}
                  />
                  <SelectField
                    label="Store Location"
                    name="location_id"
                    options={data.locations
                      .filter((row) => row.locationType === "STORE")
                      .map((row) => ({
                        label: `${row.code} — ${row.name}`,
                        value: row.id,
                      }))}
                  />
                  <SelectField
                    allowBlank
                    label="Supplier"
                    name="supplier_id"
                    options={data.suppliers.map((row) => ({
                      label: `${row.code} — ${row.name}`,
                      value: row.id,
                    }))}
                  />
                  <TextField
                    label="Quantity"
                    name="quantity"
                    required
                    step="0.001"
                    type="number"
                  />
                  <TextField
                    label="Unit Price"
                    name="unit_price"
                    required
                    step="0.01"
                    type="number"
                  />
                  <TextField label="Bill Number" name="bill_number" />
                  <TextField label="Bill Date" name="bill_date" type="date" />
                  <TextField
                    label="Warranty / Guarantee Until"
                    name="warranty_until"
                    type="date"
                  />
                  <TextField label="Received By" name="received_by" />
                  <TextField
                    accept="application/pdf,image/jpeg,image/png"
                    label="Guarantee Card"
                    name="guarantee_card"
                    type="file"
                  />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!data.items.length || !data.locations.length}
                  type="submit"
                >
                  Receive & Generate Numbers
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add Store Location</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createStoreLocationAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-3">
                  <TextField label="Code" name="location_code" required />
                  <TextField label="Name" name="location_name" required />
                  <Field>
                    <FieldLabel htmlFor="location-type">Type</FieldLabel>
                    <NativeSelect id="location-type" name="location_type">
                      <NativeSelectOption value="STORE">
                        Store
                      </NativeSelectOption>
                      <NativeSelectOption value="UNIT">Unit</NativeSelectOption>
                      <NativeSelectOption value="DEPARTMENT">
                        Department
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                </FieldGroup>
                <Button className="mt-5" type="submit">
                  Save Location
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add Supplier</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createStoreSupplierAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-3">
                  <TextField
                    label="Supplier Code"
                    name="supplier_code"
                    required
                  />
                  <TextField
                    label="Supplier Name"
                    name="supplier_name"
                    required
                  />
                  <TextField label="Contact Details" name="contact_details" />
                </FieldGroup>
                <Button className="mt-5" type="submit">
                  Save Supplier
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current Stock</CardTitle>
          <CardDescription>
            Consumables use ledger quantity; returnable stock counts available
            physical Asset Codes.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type Code</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Alert Level</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const low =
                  Number(item.availableStock) <= Number(item.minimumStock)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.typeCode}
                    </TableCell>
                    <TableCell>
                      {item.identificationName}
                      <span className="block text-xs text-muted-foreground">
                        {item.assetName}
                        {item.applicableItemCode
                          ? ` · Item ${item.applicableItemCode}`
                          : ""}
                        {item.drawingNumber
                          ? ` · Drg ${item.drawingNumber}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.assetType} / {item.assetCategory} /{" "}
                      {item.assetSubcategory}
                    </TableCell>
                    <TableCell>
                      {item.trackingMode === "SERIALIZED"
                        ? "Returnable"
                        : "Consumable"}
                    </TableCell>
                    <TableCell>
                      {item.availableStock} {item.unit}
                    </TableCell>
                    <TableCell>
                      {item.minimumStock} {item.unit}
                    </TableCell>
                    <TableCell>
                      <Badge variant={low ? "destructive" : "secondary"}>
                        {low ? "Reorder" : "Available"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!data.items.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No Store item types yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Receipts & Issues</CardTitle>
          <CardDescription>
            Latest purchase, issue, return, transfer, breakage and scrap
            history.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Item / Asset</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Supplier / Bill</TableHead>
                <TableHead>Issued / Moved To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.movements.map((movement, index) => (
                <TableRow
                  key={`${movement.typeCode}-${movement.movedAt.toISOString()}-${index}`}
                >
                  <TableCell>{formatIstDateTime(movement.movedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{movement.movementType}</Badge>
                  </TableCell>
                  <TableCell>
                    {movement.typeCode} — {movement.identificationName}
                    <span className="block text-xs text-muted-foreground">
                      {movement.assetCode || "Quantity item"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {movement.quantity} {movement.unit}
                  </TableCell>
                  <TableCell>{movement.locationName}</TableCell>
                  <TableCell>
                    {movement.supplierName || "—"}
                    <span className="block text-xs text-muted-foreground">
                      {movement.billNumber ? `Bill ${movement.billNumber}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{movement.toHolder || "—"}</TableCell>
                </TableRow>
              ))}
              {!data.movements.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No Store movements yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Price History</CardTitle>
          <CardDescription>
            Every supplier price entered with a receipt remains comparable.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Bill / Quote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.prices.map((price, index) => (
                <TableRow
                  key={`${price.typeCode}-${price.supplierName}-${price.validFrom}-${index}`}
                >
                  <TableCell>{price.validFrom}</TableCell>
                  <TableCell>
                    {price.typeCode} — {price.itemName}
                  </TableCell>
                  <TableCell>{price.supplierName}</TableCell>
                  <TableCell>₹ {price.unitPrice}</TableCell>
                  <TableCell>{price.quoteReference || "—"}</TableCell>
                </TableRow>
              ))}
              {!data.prices.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No supplier prices received yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `store-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
    </Field>
  )
}

function SelectField({
  allowBlank = false,
  label,
  name,
  options,
}: {
  allowBlank?: boolean
  label: string
  name: string
  options: { label: string; value: string }[]
}) {
  const id = `store-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required={!allowBlank}>
        {allowBlank ? (
          <NativeSelectOption value="">Not selected</NativeSelectOption>
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
