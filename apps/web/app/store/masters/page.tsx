import { createStoreRepository } from "@workspace/db"
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
  createStoreVendorAction,
} from "../actions"

export default async function StoreMastersPage() {
  const session = await requireCapability("store.read", "/store/masters")
  const canManage =
    (await listGrantedCapabilities(session.user.id, ["store.manage"])).length > 0
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, locations, suppliers, vendors, masters] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listLocations(organizationId),
      repository.listSuppliers(organizationId),
      repository.listVendors(organizationId),
      repository.listAssetClassificationMasters(organizationId),
    ])
    return { items, locations, masters, suppliers, vendors }
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Store Masters</h2>
        <p className="text-sm text-muted-foreground">
          Maintain Store Items, classification, locations, Suppliers, and Vendors.
        </p>
      </div>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create Store Item Type</CardTitle>
              <CardDescription>
                Type Code is generated automatically. Asset Type has only two choices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createStoreItemTypeAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <TextField label="Identification Name" name="identification_name" required />
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
                  <TextField label="For Product / Item Code" name="applicable_item_code" />
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
                  Create & Generate Type Code
                </Button>
              </form>
            </CardContent>
          </Card>

          <MasterCard title="Asset Category Master">
            <form action={createStoreAssetCategoryAction}>
              <TextField label="Category Name" name="asset_category_name" required />
              <Button className="mt-5" type="submit">Save Category</Button>
            </form>
          </MasterCard>

          <MasterCard title="Asset Subcategory Master">
            <form action={createStoreAssetSubcategoryAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Category"
                  name="asset_category_id"
                  options={data.masters.categories.map((row) => ({ label: row.name, value: row.id }))}
                />
                <TextField label="Subcategory Name" name="asset_subcategory_name" required />
              </FieldGroup>
              <Button className="mt-5" disabled={!data.masters.categories.length} type="submit">
                Save Subcategory
              </Button>
            </form>
          </MasterCard>

          <MasterCard title="Asset Name Master">
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
              <Button className="mt-5" disabled={!data.masters.subcategories.length} type="submit">
                Save Asset Name
              </Button>
            </form>
          </MasterCard>

          <MasterCard title="Store Location Master">
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
              <Button className="mt-5" type="submit">Save Location</Button>
            </form>
          </MasterCard>

          <MasterCard title="Supplier Master">
            <form action={createStoreSupplierAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-3">
                <TextField label="Supplier Code" name="supplier_code" required />
                <TextField label="Supplier Name" name="supplier_name" required />
                <TextField label="Contact Details" name="contact_details" />
              </FieldGroup>
              <Button className="mt-5" type="submit">Save Supplier</Button>
            </form>
          </MasterCard>

          <MasterCard title="Vendor Master">
            <form action={createStoreVendorAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-3">
                <TextField label="Vendor Code" name="vendor_code" required />
                <TextField label="Vendor Name" name="vendor_name" required />
                <TextField label="Contact Details" name="contact_details" />
              </FieldGroup>
              <Button className="mt-5" type="submit">Save Vendor</Button>
            </form>
          </MasterCard>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Store Item Types</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type Code</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Asset Type</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.typeCode}</TableCell>
                  <TableCell>{item.identificationName}</TableCell>
                  <TableCell>
                    {item.assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable"}
                  </TableCell>
                  <TableCell>{item.assetCategory} / {item.assetSubcategory} / {item.assetName}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                </TableRow>
              ))}
              {!data.items.length ? (
                <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>No Store item types yet.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MasterCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>
}

function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `master-${name}`
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} name={name} {...props} /></Field>
}

function SelectField({ label, name, options }: { label: string; name: string; options: { label: string; value: string }[] }) {
  const id = `master-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required>
        {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
  )
}
