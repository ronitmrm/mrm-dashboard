import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"

import { createStoreRepository, storeUnitId } from "@workspace/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import {
  StoreAssetWorkspacePane,
  StoreAssetWorkspaceTabs,
  StoreItemWorkspacePane,
  StoreItemWorkspaceTabs,
} from "@/components/store-asset-workspace-tabs"
import {
  StoreAssetAcquisitionSection,
  StoreAssetCalibrationScheduleSection,
  StoreAssetMaintenanceSection,
} from "@/components/store-item-schedule-section"
import { StoreItemMaintenanceMasterForm } from "@/components/store-item-maintenance-master-form"
import { StoreAssetCalibration } from "@/components/store-asset-calibration"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { formatIstDateTime, istDateValue } from "@/lib/date-time"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { masterCapability } from "@/lib/auth/master-capabilities"

import {
  recordStoreAssetAcquisitionAction,
  scheduleStoreAssetMaintenanceAction,
  scheduleStoreAssetMaintenanceMasterAction,
  openStoreCalibrationVisitAction,
  addStoreCalibrationOfferAction,
  cancelStoreCalibrationVisitAction,
  dispatchStoreCalibrationVisitAction,
  returnStoreCalibrationVisitAction,
  uploadStoreCalibrationCertificateAction,
  completeStoreCalibrationVisitAction,
  setStoreAssetLifecycleAction,
  uploadStoreItemDrawingAction,
  uploadStoreSupplierQuoteAction,
} from "../../actions"

export default async function StoreAssetWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ assetCode: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { assetCode } = await params
  const { tab } = await searchParams
  const session = await requireCapability(
    "store.asset_history.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const capabilities = await listGrantedStoreActions(session.user.id)
  const canMove = capabilities.has("store.asset_movement.write")
  const canMaintain = capabilities.has("store.asset_maintenance.write")
  const canRepair = capabilities.has("store.asset_repair.write")
  const canRecordAcquisition = capabilities.has("store.receipts.receive")
  const canManageLifecycle = capabilities.has("store.asset_lifecycle.write")
  const grants = await listGrantedCapabilities(session.user.id, [
    masterCapability("ITEM_TYPE", "save"),
    masterCapability("SUPPLIER_PRICE", "save"),
    "store.purchase_register.read",
  ])
  const canOpenPurchaseRegister = canRepair || grants.includes("store.purchase_register.read")
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
    const [suppliers, performer] = await Promise.all([
      repository.listSuppliers(organizationId),
      canMove || canMaintain || canManageLifecycle
        ? signedInPerformer({
            connectionString: readAuthEnvironment().connectionString,
            organizationId,
            userId: session.user.id,
            userName: session.user.name,
          })
        : Promise.resolve(null),
    ])
    return {
      kind: "asset" as const,
      performer,
      suppliers,
      workspace,
    }
  })().finally(() => repository.close())
  if (!data.workspace) notFound()
  if (data.kind === "item") {
    return (
      <StoreItemWorkspace
        canUploadDrawing={grants.includes(masterCapability("ITEM_TYPE", "save"))}
        canUploadQuote={grants.includes(masterCapability("SUPPLIER_PRICE", "save"))}
        workspace={data.workspace}
      />
    )
  }
  const {
    asset,
    calibrationSuppliers,
    calibrationVisits,
    documents,
    maintenance,
    maintenanceMasters,
    movements,
    repairOrders,
    schedules,
    supplierPrices,
  } = data.workspace
  const performerDisplay = data.performer
    ? [data.performer.code, data.performer.name].filter(Boolean).join(" - ")
    : "Signed-in account name required"
  const maintenanceSchedules = schedules.filter((schedule) => schedule.scheduleType === "MAINTENANCE")
  const calibrationSchedules = schedules.filter((schedule) => schedule.scheduleType === "CALIBRATION")
  const maintenanceForm = canMaintain ? (
    <StoreItemMaintenanceMasterForm
      action={scheduleStoreAssetMaintenanceMasterAction}
      unitId={asset.assetCode}
      masters={maintenanceMasters.filter((master) =>
        !maintenanceSchedules.some((schedule) => schedule.code === master.code)
      )}
    />
  ) : null
  const calibrationForm = canMaintain ? (
    <form action={scheduleStoreAssetMaintenanceAction} className="grid gap-4">
      <input name="asset_code" type="hidden" value={asset.assetCode} />
      <input name="schedule_type" type="hidden" value="CALIBRATION" />
      <TextField label="Schedule Name" name="schedule_name" required />
      <TextField label="Frequency (days)" min="1" name="frequency_days" required step="1" type="number" />
      <TextField label="First Due Date" name="first_due_on" required type="date" />
      <Button className="w-fit" type="submit">Assign Schedule</Button>
    </form>
  ) : null
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
        <div className="flex items-center gap-2">
          <Badge
            variant={asset.status === "BROKEN" ? "destructive" : "secondary"}
          >
            {asset.status}
          </Badge>
          <Button asChild size="sm" variant="outline">
            <Link href="/store/stock">Back to Stock</Link>
          </Button>
        </div>
      </div>

      <StoreAssetWorkspaceTabs
        initialTab={tab === "calibration" ? "calibration" : "overview"}
        showLifecycle={canManageLifecycle}
      >
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
          {canRecordAcquisition && asset.receiptLineId === null ? (
            <StoreAssetAcquisitionSection>
              <p className="mb-4 text-sm text-muted-foreground">
                Record the original supplier and purchase price for this legacy Unit ID.
              </p>
              <form action={recordStoreAssetAcquisitionAction} className="grid gap-4">
                <input name="asset_code" type="hidden" value={asset.assetCode} />
                <Field>
                  <FieldLabel htmlFor="acquisition-supplier">Acquisition Supplier</FieldLabel>
                  <NativeSelect id="acquisition-supplier" name="supplier_id" required>
                    <NativeSelectOption value="">Select supplier</NativeSelectOption>
                    {calibrationSuppliers.map((supplier) => (
                      <NativeSelectOption key={supplier.id} value={supplier.id}>
                        {supplier.code} — {supplier.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <TextField
                  defaultValue={asset.unitPrice ?? undefined}
                  label="Purchase Price"
                  min="0"
                  name="unit_price"
                  required
                  step="0.01"
                  type="number"
                />
                <Button className="w-fit" disabled={!calibrationSuppliers.length} type="submit">
                  Record Acquisition
                </Button>
              </form>
            </StoreAssetAcquisitionSection>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Info
              label="Purchase Order"
              value={asset.orderNumber || "Legacy receipt"}
            />
            <Info
              label="Supplier"
              value={asset.supplierName || "Not recorded"}
            />
            <Info
              label="Purchase Price"
              value={asset.unitPrice ? `₹ ${asset.unitPrice}` : "Not recorded"}
            />
            <Info
              label="Acquired On"
              value={asset.acquiredOn || "Not recorded"}
            />
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

        {canManageLifecycle ? (
          <StoreAssetWorkspacePane tab="lifecycle">
 <SectionCard width="standard">
          <CardHeader>
            <CardTitle>Asset Lifecycle</CardTitle>
            <CardDescription>
                  A broken or scrapped physical asset keeps its history. A
                  purchased replacement receives a new Unit ID. Use Store Return
                  above to make an asset available again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={setStoreAssetLifecycleAction}
              className="grid gap-4 sm:grid-cols-2"
            >
                  <input
                    name="asset_code"
                    type="hidden"
                    value={asset.assetCode}
                  />
              <Field>
                <FieldLabel htmlFor="asset-status">New Status</FieldLabel>
                <NativeSelect id="asset-status" name="asset_status">
                  <NativeSelectOption value="UNDER_MAINTENANCE">
                    Under Maintenance
                  </NativeSelectOption>
                      <NativeSelectOption value="BROKEN">
                        Broken
                      </NativeSelectOption>
                  <NativeSelectOption value="SCRAPPED">
                    Scrapped
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <TextField label="Changed By" name="changed_by" readOnly value={performerDisplay} />
              <TextField label="Reason / Remark" name="status_remark" />
              <div className="flex items-end">
                <Button type="submit">Update Status</Button>
              </div>
            </form>
          </CardContent>
 </SectionCard>
          </StoreAssetWorkspacePane>
        ) : null}

        <StoreAssetWorkspacePane tab="repairs">
 <SectionCard>
        <CardHeader>
          <CardTitle>Repair Purchase Orders</CardTitle>
          <CardDescription>
            Complete each repair line in{" "}
            {canOpenPurchaseRegister ? (
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href="/store/orders"
              >
                Purchase Register
              </Link>
            ) : (
              "Purchase Register"
            )}{" "}
            when this Unit ID returns to Store. A Department request for the
            same Asset Code can use any available Unit ID through Requests &amp;
            Issues. To assign this returned unit directly, use{" "}
            {canMove ? (
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={`/store/movement?unitId=${encodeURIComponent(asset.assetCode)}`}
              >
                Store Movement
              </Link>
            ) : (
              "Store Movement"
            )}{" "}
            to assign it to a Department.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PDF</TableHead>
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
                      <AttachmentViewerLink
                        fileName={`${order.orderNumber}.pdf`}
                        href={`/store/orders/${order.id}/pdf`}
                        mediaType="application/pdf"
                      >
                        View PDF
                      </AttachmentViewerLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!repairOrders.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No Repair Purchase Orders for this Unit ID.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="maintenance">
          <StoreAssetMaintenanceSection
            maintenanceForm={maintenanceForm}
          >
 <OperationalTable>
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
              {maintenanceSchedules.map((schedule) => {
                const due = schedule.active && schedule.nextDueOn <= istDateValue()
                return (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">
                      {schedule.code}
                    </TableCell>
                    <TableCell>{schedule.name}</TableCell>
                    <TableCell>{schedule.frequencyDays} days</TableCell>
                    <TableCell>{schedule.lastCompletedOn || "—"}</TableCell>
                    <TableCell
                          className={
                            due ? "font-semibold text-destructive" : ""
                          }
                    >
                      {schedule.nextDueOn}
                    </TableCell>
                    <TableCell>
                      <Badge variant={due ? "destructive" : schedule.active ? "secondary" : "outline"}>
                        {schedule.active ? (due ? "Due" : "Scheduled") : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!maintenanceSchedules.length ? (
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
 </OperationalTable>
          </StoreAssetMaintenanceSection>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="calibration">
          <StoreAssetCalibrationScheduleSection canAssign={canMaintain} form={calibrationForm}>
            <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Last Completed</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calibrationSchedules.map((schedule) => {
                  const due = schedule.active && schedule.nextDueOn <= istDateValue()
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">{schedule.name}</TableCell>
                      <TableCell>{schedule.frequencyDays} days</TableCell>
                      <TableCell>{schedule.lastCompletedOn || "—"}</TableCell>
                      <TableCell className={due ? "font-semibold text-destructive" : ""}>
                        {schedule.nextDueOn}
                      </TableCell>
                      <TableCell>
                        <Badge variant={due ? "destructive" : schedule.active ? "secondary" : "outline"}>
                          {schedule.active ? (due ? "Due" : "Scheduled") : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!calibrationSchedules.length ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                      No calibration timetable assigned.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </OperationalTable>
          </StoreAssetCalibrationScheduleSection>
          <StoreAssetCalibration
            actions={{
              openVisit: openStoreCalibrationVisitAction,
              addOffer: addStoreCalibrationOfferAction,
              cancelVisit: cancelStoreCalibrationVisitAction,
              dispatchVisit: dispatchStoreCalibrationVisitAction,
              returnVisit: returnStoreCalibrationVisitAction,
              uploadCertificate: uploadStoreCalibrationCertificateAction,
              completeVisit: completeStoreCalibrationVisitAction,
            }}
            assetCode={asset.assetCode}
            canManage={canMaintain && canMove && canRepair}
            schedules={calibrationSchedules}
            suppliers={calibrationSuppliers}
            visits={calibrationVisits}
          />
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="movement">
 <SectionCard>
        <CardHeader>
          <CardTitle>Movement Record</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
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
                    <TableRow
                      key={`${movement.movedAt.toISOString()}-${index}`}
                    >
                      <TableCell>
                        {formatIstDateTime(movement.movedAt)}
                      </TableCell>
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
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="maintenance">
 <SectionCard>
        <CardHeader>
          <CardTitle>Maintenance & Calibration History</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
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
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="suppliers">
 <SectionCard>
        <CardHeader>
          <CardTitle>Future Goods Supplier Quotes</CardTitle>
          <CardDescription>
            Asset Code supplier prices. The purchase supplier and price above belong to this Unit ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
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
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreAssetWorkspacePane>

        <StoreAssetWorkspacePane tab="documents">
 <SectionCard>
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
              {document.available ? (
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
 </SectionCard>
        </StoreAssetWorkspacePane>
      </StoreAssetWorkspaceTabs>
    </div>
  )
}

type StoreItemWorkspaceData = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof createStoreRepository>["getItemTypeWorkspace"]>
  >
>

function StoreItemWorkspace({
  canUploadDrawing,
  canUploadQuote,
  workspace,
}: {
  canUploadDrawing: boolean
  canUploadQuote: boolean
  workspace: StoreItemWorkspaceData
}) {
  const { assets, drawing, item, supplierPrices } = workspace
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

      <StoreItemWorkspaceTabs>
        <StoreItemWorkspacePane tab="overview">
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

 <SectionCard>
        <CardHeader>
          <CardTitle>Physical Units</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
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
                            asset.status === "BROKEN"
                              ? "destructive"
                              : "outline"
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
                      <TableCell>
                        {asset.acquiredOn || "Not recorded"}
                      </TableCell>
                      <TableCell>
                        {asset.nextDueOn || "Not scheduled"}
                      </TableCell>
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
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreItemWorkspacePane>

        <StoreItemWorkspacePane tab="drawings">
 <SectionCard>
        <CardHeader>
              <CardTitle>Asset Drawing</CardTitle>
              <CardDescription>
                Drawing Number is {item.typeCode}. Keep the latest PDF, JPG, or
                PNG here.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {drawing ? (
                <Button asChild className="w-fit" variant="outline">
                  <a href={`/store/items/${item.id}/drawings/${drawing.id}`}>
                    Open {drawing.fileName}
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No drawing uploaded for this Asset Code.
                </p>
              )}
              {canUploadDrawing ? (
                <PendingRetainedUploadForm
                  action={uploadStoreItemDrawingAction}
                  uploads={[
                    {
                      field: "asset_drawing",
                      intent: { kind: "store-item-drawing", itemTypeId: item.id },
                    },
                  ]}
                  className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  encType="multipart/form-data"
                >
                  <input name="item_type_id" type="hidden" value={item.id} />
                  <Field>
                    <FieldLabel htmlFor="item-workspace-drawing">
                      {drawing ? "Replace Drawing" : "Upload Drawing"}
                    </FieldLabel>
                    <Input
                      accept="application/pdf,image/jpeg,image/png"
                      id="item-workspace-drawing"
                      name="asset_drawing"
                      required
                      type="file"
                    />
                  </Field>
                  <Button type="submit">
                    {drawing ? "Replace" : "Upload"}
                  </Button>
                </PendingRetainedUploadForm>
              ) : null}
            </CardContent>
 </SectionCard>
        </StoreItemWorkspacePane>

        <StoreItemWorkspacePane tab="supplier-quotes">
 <SectionCard>
            <CardHeader>
              <CardTitle>Supplier Quotes & Price History</CardTitle>
              <CardDescription>
                Quote PDFs stay attached to the exact supplier price and
                effective date.
              </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
 <OperationalTable>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Quote PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                  {supplierPrices.map((price) => (
                    <TableRow key={price.id}>
                  <TableCell>{price.validFrom}</TableCell>
                  <TableCell>
                        <span className="font-medium">
                          {price.supplierName}
                        </span>
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
                      <TableCell>{price.quoteReference || "—"}</TableCell>
                  <TableCell>
                        <div className="grid min-w-64 gap-2">
                          {price.quoteDocumentId ? (
                            <Button
                              asChild
                              className="w-fit"
                              size="sm"
                              variant="outline"
                            >
                              <a
                                href={`/store/supplier-prices/${price.id}/quotes/${price.quoteDocumentId}`}
                              >
                                {price.quoteFileName || "Open Quote PDF"}
                              </a>
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Not uploaded
                            </span>
                          )}
                          {canUploadQuote ? (
                            <PendingRetainedUploadForm
                              action={uploadStoreSupplierQuoteAction}
                              uploads={[
                                {
                                  field: "supplier_quote",
                                  intent: { kind: "store-supplier-quote", supplierPriceId: price.id },
                                },
                              ]}
                              className="flex gap-2"
                              encType="multipart/form-data"
                            >
                              <input
                                name="supplier_price_id"
                                type="hidden"
                                value={price.id}
                              />
                              <Input
                                accept="application/pdf"
                                aria-label={`Quote PDF for ${price.supplierCode}`}
                                name="supplier_quote"
                                required
                                type="file"
                              />
                              <Button size="sm" type="submit" variant="outline">
                                {price.quoteDocumentId ? "Replace" : "Upload"}
                              </Button>
                            </PendingRetainedUploadForm>
                          ) : null}
                        </div>
                  </TableCell>
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
 </OperationalTable>
        </CardContent>
 </SectionCard>
        </StoreItemWorkspacePane>
      </StoreItemWorkspaceTabs>
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
 <SectionCard>
      <CardContent className="pt-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-2 font-semibold">{value}</p>
      </CardContent>
 </SectionCard>
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
