import { createStoreRepository } from "@workspace/db"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { formatIstDateTime, istDateValue } from "@/lib/date-time"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import {
  completeStoreAssetMaintenanceAction,
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
    "store.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const canManage =
    (await listGrantedCapabilities(session.user.id, ["store.manage"])).length >
    0
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [workspace, definitions, vendors] = await Promise.all([
      repository.getAssetWorkspace({ assetCode, organizationId }),
      repository.listMaintenanceDefinitions(organizationId),
      repository.listVendors(organizationId),
    ])
    return { definitions, vendors, workspace }
  })().finally(() => repository.close())
  if (!data.workspace) notFound()
  const {
    asset,
    documents,
    maintenance,
    movements,
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Info
          label="Warranty Until"
          value={asset.warrantyUntil || "Not recorded"}
        />
        <Info label="Purchase Order" value={asset.orderNumber || "Legacy receipt"} />
        <Info label="Supplier" value={asset.supplierName || "Not recorded"} />
        <Info
          label="Purchase Price"
          value={asset.unitPrice ? `₹ ${asset.unitPrice}` : "Not recorded"}
        />
        <Info label="Acquired On" value={asset.acquiredOn || "Not recorded"} />
      </div>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
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
                  <TextField label="Department / Destination Name" name="holder_name" />
                  <TextField label="Moved By" name="moved_by" />
                  <TextField label="Remark" name="remark" />
                </FieldGroup>
                <Button className="mt-5" type="submit">
                  Record Movement
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
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
          </Card>

          <Card>
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
          </Card>
        </div>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Asset Lifecycle</CardTitle>
            <CardDescription>
              A broken or scrapped physical asset keeps its history. A purchased
              replacement receives a new Unit ID. Use Store Return above to
              make an asset available again.
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
      ) : null}

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

      <Card>
        <CardHeader>
          <CardTitle>Movement Record</CardTitle>
          <CardDescription>
            Complete immutable assignment and transfer history for this physical
            asset.
          </CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Supplier Price History</CardTitle>
          <CardDescription>
            Purchase prices for this Asset Type are kept with the Asset.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
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
                  <TableCell>{price.quoteReference || "—"}</TableCell>
                </TableRow>
              ))}
              {!supplierPrices.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No supplier price history for this Asset Type.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
