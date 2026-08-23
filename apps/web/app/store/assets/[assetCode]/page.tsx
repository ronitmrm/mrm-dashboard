import { createStoreRepository, storeUnitId } from "@workspace/db"
import Link from "next/link"
import { notFound } from "next/navigation"
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
import { Textarea } from "@workspace/ui/components/textarea"

import {
  StoreAssetWorkspacePane,
  StoreAssetWorkspaceTabs,
} from "@/components/store-asset-workspace-tabs"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { formatIstDateTime, istDateValue } from "@/lib/date-time"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"
import {
  requireCapability,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"

import {
  completeStoreAssetMaintenanceAction,
  completeStoreRepairPurchaseOrderAction,
  createStoreRepairPurchaseOrderAction,
  moveStoreAssetAction,
  scheduleStoreAssetMaintenanceAction,
  setStoreAssetLifecycleAction,
} from "../../actions"

export default async function StoreAssetWorkspacePage({
  params,
}: {
  params: Promise<{ assetCode: string }>
}) {
  const { assetCode } = await params
  const session = await requireCapability(
    "store.asset_history.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const capabilities = await listGrantedStoreActions(session.user.id)
  const canMove = capabilities.has("store.asset_movement.write")
  const canMaintain = capabilities.has("store.asset_maintenance.write")
  const canRepair = capabilities.has("store.asset_repair.write")
  const canManageLifecycle = capabilities.has("store.asset_lifecycle.write")
  const canManage = canMove || canMaintain || canRepair
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const workspace = await repository.getAssetWorkspace({
      assetCode,
      organizationId,
    })
    if (!workspace) {
      return {
        kind: "item" as const,
        workspace: await repository.getItemTypeWorkspace({
          organizationId,
          typeCode: assetCode,
        }),
      }
    }
    const [definitions, suppliers, vendors] = await Promise.all([
      repository.listMaintenanceDefinitions(organizationId),
      repository.listSuppliers(organizationId),
      repository.listVendors(organizationId),
    ])
    return {
      definitions,
      kind: "asset" as const,
      suppliers,
      vendors,
      workspace,
    }
  })().finally(() => repository.close())
  if (!data.workspace) notFound()
  if (data.kind === "item") {
    return <StoreItemWorkspace workspace={data.workspace} />
  }
  const {
    asset,
    documents,
    maintenance,
    movements,
    repairOrders,
    schedules,
    supplierPrices,
  } = data.workspace

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {asset.assetCode}
          </h2>
          <p className="text-sm text-muted-foreground">
            Unit ID / Serial ID · Asset Code {asset.typeCode} ·{" "}
            {asset.identificationName}
          </p>
        </div>
        <Badge
          variant={asset.status === "BROKEN" ? "destructive" : "secondary"}
        >
          {asset.status}
        </Badge>
      </div>

      <StoreAssetWorkspaceTabs showLifecycle={canManageLifecycle}>
        <StoreAssetWorkspacePane tab="overview">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Info label="Asset Code" value={asset.typeCode} />
            <Info label="Unit ID" value={asset.assetCode} />
            <Info
              label="Manufacturer Serial"
              value={asset.manufacturerSerialNumber || "Not recorded"}
            />
            <Info
              label="Classification"
              value={`${asset.assetType} / ${asset.category} / ${asset.subcategory}`}
            />
            <Info label="Asset Name" value={asset.assetName} />
            <Info
              label="Current Assignment"
              value={asset.holderName || asset.locationName || asset.holderType}
            />
          </div>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="suppliers">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Info
              label="Purchase Order"
              value={asset.orderNumber || "Legacy receipt"}
            />
            <Info label="Supplier" value={asset.supplierName || "Not recorded"} />
            <Info
              label="Purchase Price"
              value={asset.unitPrice ? `₹ ${asset.unitPrice}` : "Not recorded"}
            />
            <Info label="Acquired On" value={asset.acquiredOn || "Not recorded"} />
          </div>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="documents">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Info
              label="Warranty Until"
              value={asset.warrantyUntil || "Not recorded"}
            />
          </div>
        </StoreAssetWorkspacePane>

        {canManage ? (
          <>
            <StoreAssetWorkspacePane tab="movement">
          {canMove ? <Card>
            <CardHeader>
              <CardTitle>Move / Assign Asset</CardTitle>
              <CardDescription>
                Non Consumables can move to a Department, Machine, registered
                Vendor, or return to Store.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={moveStoreAssetAction}>
                <input
                  name="asset_code"
                  type="hidden"
                  value={asset.assetCode}
                />
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="holder-type">Assign To</FieldLabel>
                    <NativeSelect id="holder-type" name="holder_type">
                      <NativeSelectOption value="MACHINE">
                        Machine
                      </NativeSelectOption>
                      <NativeSelectOption value="DEPARTMENT">
                        Department
                      </NativeSelectOption>
                      <NativeSelectOption value="VENDOR">
                        Vendor
                      </NativeSelectOption>
                      <NativeSelectOption value="STORE">
                        Store Return
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="vendor-id">Vendor</FieldLabel>
                    <NativeSelect id="vendor-id" name="vendor_id">
                      <NativeSelectOption value="">
                        Select only when assigning to Vendor
                      </NativeSelectOption>
                      {data.vendors.map((vendor) => (
                        <NativeSelectOption key={vendor.id} value={vendor.id}>
                          {vendor.code} — {vendor.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <TextField
                    label="Reference / Machine No. / Store Code"
                    name="holder_reference"
                  />
                  <TextField
                    label="Department / Destination Name"
                    name="holder_name"
                  />
                  <TextField label="Moved By" name="moved_by" />
                  <TextField label="Remark" name="remark" />
                </FieldGroup>
                <Button className="mt-5" type="submit">
                  Record Movement
                </Button>
              </form>
            </CardContent>
          </Card> : null}
            </StoreAssetWorkspacePane>

            <StoreAssetWorkspacePane tab="repairs">
          {canRepair ? <Card>
            <CardHeader>
              <CardTitle>Create Repair PO</CardTitle>
              <CardDescription>
                Creates a service PO and moves this Unit ID to the selected
                Supplier without duplicating a repair Vendor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createStoreRepairPurchaseOrderAction}>
                <input
                  name="asset_code"
                  type="hidden"
                  value={asset.assetCode}
                />
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="repair-supplier">Supplier</FieldLabel>
                    <NativeSelect
                      id="repair-supplier"
                      name="supplier_id"
                      required
                    >
                      {data.suppliers.map((supplier) => (
                        <NativeSelectOption
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.code} — {supplier.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <TextField
                    defaultValue={istDateValue()}
                    label="PO Date"
                    name="order_date"
                    type="date"
                  />
                  <TextField
                    label="Agreed Repair Price"
                    min="0"
                    name="service_price"
                    required
                    step="0.01"
                    type="number"
                  />
                  <Field>
                    <FieldLabel htmlFor="repair-description">
                      Repair / Calibration Scope
                    </FieldLabel>
                    <Textarea
                      id="repair-description"
                      name="service_description"
                      required
                    />
                  </Field>
                  <TextField label="Remark" name="remark" />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!data.suppliers.length}
                  type="submit"
                >
                  Create Repair PO
                </Button>
              </form>
            </CardContent>
          </Card> : null}
            </StoreAssetWorkspacePane>

            <StoreAssetWorkspacePane
              className="grid gap-4 xl:grid-cols-2"
              tab="maintenance"
            >
          {canMaintain ? <Card>
            <CardHeader>
              <CardTitle>Add Timetable</CardTitle>
              <CardDescription>
                Schedules come from Maintenance Master and belong to this
                specific Unit ID.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={scheduleStoreAssetMaintenanceAction}>
                <input
                  name="asset_code"
                  type="hidden"
                  value={asset.assetCode}
                />
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="definition-code">
                      Maintenance Master
                    </FieldLabel>
                    <NativeSelect
                      id="definition-code"
                      name="definition_code"
                      required
                    >
                      {data.definitions.map((definition) => (
                        <NativeSelectOption
                          key={definition.code}
                          value={definition.code}
                        >
                          {definition.code} — {definition.name} (
                          {definition.frequencyDays} days)
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <TextField
                    label="First Due Date"
                    name="first_due_on"
                    required
                    type="date"
                  />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!data.definitions.length}
                  type="submit"
                >
                  Add Timetable
                </Button>
              </form>
            </CardContent>
          </Card> : null}

          {canMaintain ? <Card>
            <CardHeader>
              <CardTitle>Complete Maintenance</CardTitle>
              <CardDescription>
                Calibration is recorded as a maintenance type; completion
                calculates the next due date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={completeStoreAssetMaintenanceAction}>
                <input
                  name="asset_code"
                  type="hidden"
                  value={asset.assetCode}
                />
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="maintenance-type">Type</FieldLabel>
                    <NativeSelect id="maintenance-type" name="maintenance_type">
                      <NativeSelectOption value="MAINTENANCE">
                        Maintenance
                      </NativeSelectOption>
                      <NativeSelectOption value="CALIBRATION">
                        Calibration
                      </NativeSelectOption>
                      <NativeSelectOption value="BREAKDOWN">
                        Breakdown
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="schedule-id">Timetable</FieldLabel>
                    <NativeSelect id="schedule-id" name="schedule_id">
                      <NativeSelectOption value="">
                        Unscheduled / Breakdown
                      </NativeSelectOption>
                      {schedules.map((schedule) => (
                        <NativeSelectOption
                          key={schedule.id}
                          value={schedule.id}
                        >
                          {schedule.code} — due {schedule.nextDueOn}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <TextField
                    defaultValue={istDateValue()}
                    label="Completed On"
                    name="completed_on"
                    required
                    type="date"
                  />
                  <TextField
                    label="Completed By"
                    name="completed_by"
                    required
                  />
                  <TextField label="Supplier / Lab" name="supplier_name" />
                  <TextField
                    label="Certificate Number"
                    name="certificate_number"
                  />
                  <TextField
                    label="Cost"
                    name="cost"
                    step="0.01"
                    type="number"
                  />
                  <TextField label="Result" name="result" />
                  <Field>
                    <FieldLabel htmlFor="work-done">Work Done</FieldLabel>
                    <Textarea id="work-done" name="work_done" />
                  </Field>
                </FieldGroup>
                <Button className="mt-5" type="submit">
                  Complete & Calculate Next Due
                </Button>
              </form>
            </CardContent>
          </Card> : null}
            </StoreAssetWorkspacePane>
          </>
        ) : null}

        {canManageLifecycle ? (
          <StoreAssetWorkspacePane tab="lifecycle">
        <Card>
          <CardHeader>
            <CardTitle>Asset Lifecycle</CardTitle>
            <CardDescription>
              A broken or scrapped physical asset keeps its history. A purchased
              replacement receives a new Unit ID. Use Store Return above to make
              an asset available again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={setStoreAssetLifecycleAction}
              className="grid gap-4 md:grid-cols-4"
            >
              <input name="asset_code" type="hidden" value={asset.assetCode} />
              <Field>
                <FieldLabel htmlFor="asset-status">New Status</FieldLabel>
                <NativeSelect id="asset-status" name="asset_status">
                  <NativeSelectOption value="UNDER_MAINTENANCE">
                    Under Maintenance
                  </NativeSelectOption>
                  <NativeSelectOption value="BROKEN">Broken</NativeSelectOption>
                  <NativeSelectOption value="SCRAPPED">
                    Scrapped
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <TextField label="Changed By" name="changed_by" />
              <TextField label="Reason / Remark" name="status_remark" />
              <div className="flex items-end">
                <Button type="submit">Update Status</Button>
              </div>
            </form>
          </CardContent>
        </Card>
          </StoreAssetWorkspacePane>
        ) : null}

        <StoreAssetWorkspacePane tab="repairs">
      <Card>
        <CardHeader>
          <CardTitle>Repair Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PDF</TableHead>
                {canRepair ? <TableHead>Completion</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {repairOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell>{order.orderDate}</TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>{order.serviceDescription}</TableCell>
                  <TableCell>₹ {order.servicePrice}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{order.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/store/orders/${order.id}/pdf`}>Download</a>
                    </Button>
                  </TableCell>
                  {canRepair ? (
                    <TableCell>
                      {order.status === "Open" ? (
                        <form action={completeStoreRepairPurchaseOrderAction}>
                          <input
                            name="asset_code"
                            type="hidden"
                            value={asset.assetCode}
                          />
                          <input
                            name="purchase_order_id"
                            type="hidden"
                            value={order.id}
                          />
                          <Button size="sm" type="submit" variant="outline">
                            Mark Completed
                          </Button>
                        </form>
                      ) : (
                        "Completed"
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!repairOrders.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={canRepair ? 8 : 7}
                  >
                    No Repair Purchase Orders for this Unit ID.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="maintenance">
      <Card>
        <CardHeader>
          <CardTitle>Maintenance & Calibration Timetable</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Last Completed</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => {
                const due = schedule.nextDueOn <= istDateValue()
                return (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">
                      {schedule.code}
                    </TableCell>
                    <TableCell>{schedule.name}</TableCell>
                    <TableCell>{schedule.frequencyDays} days</TableCell>
                    <TableCell>{schedule.lastCompletedOn || "—"}</TableCell>
                    <TableCell
                      className={due ? "font-semibold text-destructive" : ""}
                    >
                      {schedule.nextDueOn}
                    </TableCell>
                    <TableCell>
                      <Badge variant={due ? "destructive" : "secondary"}>
                        {due ? "Due" : "Scheduled"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!schedules.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No maintenance timetable assigned.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="movement">
      <Card>
        <CardHeader>
          <CardTitle>Movement Record</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Moved By</TableHead>
                <TableHead>Remark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement, index) => (
                <TableRow key={`${movement.movedAt.toISOString()}-${index}`}>
                  <TableCell>{formatIstDateTime(movement.movedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{movement.movementType}</Badge>
                  </TableCell>
                  <TableCell>{movement.fromHolder || "—"}</TableCell>
                  <TableCell>{movement.toHolder || "—"}</TableCell>
                  <TableCell>{movement.movedBy || "—"}</TableCell>
                  <TableCell>{movement.remark || "—"}</TableCell>
                </TableRow>
              ))}
              {!movements.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No movement records.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="maintenance">
      <Card>
        <CardHeader>
          <CardTitle>Maintenance History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Completed By</TableHead>
                <TableHead>Work / Result</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenance.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.completedOn}</TableCell>
                  <TableCell>{record.maintenanceType}</TableCell>
                  <TableCell>{record.completedBy}</TableCell>
                  <TableCell>
                    {record.workDone || record.result || "—"}
                  </TableCell>
                  <TableCell>{record.certificateNumber || "—"}</TableCell>
                  <TableCell>{record.nextDueOn || "—"}</TableCell>
                  <TableCell>
                    {record.cost ? `₹ ${record.cost}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!maintenance.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No completed maintenance records.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="suppliers">
      <Card>
        <CardHeader>
          <CardTitle>Supplier Price History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bill / Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPrices.map((price, index) => (
                <TableRow
                  key={`${price.supplierName}-${price.validFrom}-${price.quoteReference}-${index}`}
                >
                  <TableCell>{price.validFrom}</TableCell>
                  <TableCell>{price.supplierName}</TableCell>
                  <TableCell>₹ {price.unitPrice}</TableCell>
                  <TableCell>
                    <Badge variant={price.active ? "secondary" : "outline"}>
                      {price.active ? "Active" : "History"}
                    </Badge>
                  </TableCell>
                  <TableCell>{price.quoteReference || "—"}</TableCell>
                </TableRow>
              ))}
              {!supplierPrices.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No supplier price history for this Asset Type.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="documents">
      <Card>
        <CardHeader>
          <CardTitle>Bills & Guarantee Cards</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {documents.map((document) => (
            <div
              className="flex items-center justify-between rounded-lg border p-3"
              key={document.id}
            >
              <div>
                <p className="font-medium">
                  {document.documentType.replaceAll("_", " ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {document.billNumber
                    ? `Bill ${document.billNumber}`
                    : document.fileName || "Recorded document"}
                </p>
              </div>
              {document.storageKey ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`/store/assets/${encodeURIComponent(asset.assetCode)}/documents/${document.id}`}
                  >
                    Open
                  </a>
                </Button>
              ) : null}
            </div>
          ))}
          {!documents.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bill or guarantee documents recorded.
            </p>
          ) : null}
        </CardContent>
      </Card>
        </StoreAssetWorkspacePane>
      </StoreAssetWorkspaceTabs>
    </div>
  )
}

type StoreItemWorkspaceData = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<typeof createStoreRepository>["getItemTypeWorkspace"]
    >
  >
>

function StoreItemWorkspace({
  workspace,
}: {
  workspace: StoreItemWorkspaceData
}) {
  const { assets, item, supplierPrices } = workspace
  const isNonConsumable = item.assetType === "NON_CONSUMABLE"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {item.typeCode}
          </h2>
          <p className="text-sm text-muted-foreground">
            Asset Code · {item.identificationName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {isNonConsumable ? "Non Consumable" : "Consumable"}
          </Badge>
          <Button asChild size="sm" variant="outline">
            <Link href="/store/stock">Back to Stock</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Asset Name" value={item.assetName} />
        <Info label="Identification" value={item.identificationName} />
        <Info
          label="Classification"
          value={`${item.assetCategory} / ${item.assetSubcategory}`}
        />
        <Info
          label="Available Stock"
          value={`${item.availableStock} ${item.unit}`}
        />
        <Info label="Storage Location" value={item.storageLocations} />
        <Info
          label="Minimum Stock"
          value={`${item.minimumStock} ${item.unit}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Physical Units</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Assignment</TableHead>
                <TableHead>Acquired On</TableHead>
                <TableHead>Next Maintenance / Calibration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                      href={storeAssetWorkspaceHref(asset.assetCode)}
                    >
                      {asset.assetCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        asset.status === "BROKEN" ? "destructive" : "outline"
                      }
                    >
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {asset.holderName ||
                      asset.locationName ||
                      asset.holderType}
                  </TableCell>
                  <TableCell>{asset.acquiredOn || "Not recorded"}</TableCell>
                  <TableCell>{asset.nextDueOn || "Not scheduled"}</TableCell>
                </TableRow>
              ))}
              {!assets.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    {isNonConsumable
                      ? `No physical unit received yet. The first Unit ID will be ${storeUnitId(item.typeCode, 1)}.`
                      : "Consumable items do not receive individual Unit IDs."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppliers & Price History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Quote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPrices.map((price, index) => (
                <TableRow
                  key={`${price.supplierCode}-${price.validFrom}-${index}`}
                >
                  <TableCell>{price.validFrom}</TableCell>
                  <TableCell>
                    <span className="font-medium">{price.supplierName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {price.supplierCode}
                    </span>
                  </TableCell>
                  <TableCell>₹ {price.unitPrice}</TableCell>
                  <TableCell>
                    <Badge variant={price.active ? "secondary" : "outline"}>
                      {price.active ? "Available" : "History"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {price.email || price.contactDetails || "Not recorded"}
                  </TableCell>
                  <TableCell>{price.quoteReference || "—"}</TableCell>
                </TableRow>
              ))}
              {!supplierPrices.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No Supplier Price has been recorded for this Asset Code.
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-2 font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `asset-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
    </Field>
  )
}
