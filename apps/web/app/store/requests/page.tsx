import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { BulkAllocationButton } from "@/components/store/bulk-allocation-button"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { formatIstDateTime } from "@/lib/date-time"
import { createStoreIssueFormModel } from "@/lib/store-issue-form"
import { storePurchaseOrderHref } from "@/lib/unified-navigation"

import {
  cancelStoreRequisitionAction,
  fulfillStoreTransferRequestAction,
  issueRemainingStoreRequisitionBatchAction,
  issueStoreRequisitionAction,
} from "../actions"

const bulkAllocationFormId = "store-bulk-allocation-form"

export default async function StoreRequestsPage() {
  const session = await requireCapability(
    "store.requests.read",
    "/store/requests"
  )
  const canManage = (await listGrantedStoreActions(session.user.id)).has(
    "store.requests.issue"
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const requests = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return (await repository.listRequisitions({ organizationId })).rows
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Requests & Issues
        </h2>
        <p className="text-sm text-muted-foreground">
          Issue items for Department or personal use, or transfer stock and
          responsibility to a receiving Store. Each saved action updates the
          shared stock ledger.
        </p>
      </div>

      <MetricSummary
        scope="Loaded request lines · before table filters"
        items={[
          {
            label: "Requests",
            value: new Set(requests.map((row) => row.requestNumber)).size,
            tone: "information",
          },
          {
            label: "Pending Lines",
            value: requests.filter((row) => row.status === "Pending").length,
            tone: "warning",
          },
          {
            label: "Partly Issued Lines",
            value: requests.filter((row) => row.status === "Partially Issued")
              .length,
            tone: "brand",
          },
        ]}
      />

      <SectionCard>
        <CardHeader>
          <CardTitle>Request Allocation Queue</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          {canManage ? (
            <form
              action={issueRemainingStoreRequisitionBatchAction}
              id={bulkAllocationFormId}
            />
          ) : null}
          <OperationalTable
            filteredSelection={
              canManage
                ? {
                    checkboxName: "requisition_id",
                    exclusiveGroup: true,
                    label: "Select All Department Lines",
                  }
                : undefined
            }
            toolbarStart={
              canManage ? (
                <BulkAllocationButton formId={bulkAllocationFormId} />
              ) : null
            }
          >
            <TableHeader>
              <TableRow>
                {canManage ? <TableHead>Select</TableHead> : null}
                <TableHead>Request No.</TableHead>
                <TableHead>Department / Individual</TableHead>
                <TableHead>Request for</TableHead>
                <TableHead>Asset Code</TableHead>
                <TableHead>Asset Category</TableHead>
                <TableHead>Asset Subcategory</TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Issued / Transferred</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead>Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const isOpen = ["Pending", "Partially Issued"].includes(
                  request.status
                )
                const exactUnitAvailable =
                  !request.requestedUnitId ||
                  request.availableUnitIds.some(
                    (unitId) =>
                      unitId.toLowerCase() ===
                      request.requestedUnitCode?.toLowerCase()
                  )
                const canAllocateInFull =
                  request.fulfillmentKind === "DEPARTMENT_USE" &&
                  isOpen &&
                  Number(request.remainingQuantity) > 0 &&
                  Number(request.availableStock) >=
                    Number(request.remainingQuantity) &&
                  exactUnitAvailable
                const issueForm = createStoreIssueFormModel({
                  actorEmail: session.user.email,
                  availableUnitIds: request.availableUnitIds,
                  department: request.department,
                  trackingMode: request.trackingMode,
                })
                return (
                  <TableRow key={request.id}>
                    {canManage ? (
                      <TableCell>
                        {canAllocateInFull ? (
                          <input
                            aria-label={`Select ${request.typeCode} from ${request.requestNumber}`}
                            className="size-4 accent-primary"
                            data-allocation-item-label={`${request.typeCode} — ${request.identificationName}`}
                            data-allocation-item-type-id={request.itemTypeId}
                            data-allocation-remaining-quantity={
                              request.remainingQuantity
                            }
                            data-allocation-requested-unit-code={
                              request.requestedUnitCode ?? ""
                            }
                            data-allocation-tracking-mode={request.trackingMode}
                            data-allocation-unit-ids={JSON.stringify(
                              request.availableUnitIds
                            )}
                            data-selection-group={request.department}
                            data-selection-group-label={request.department}
                            form={bulkAllocationFormId}
                            name="requisition_id"
                            type="checkbox"
                            value={request.id}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium whitespace-nowrap">
                      {request.requestNumber}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatIstDateTime(request.requestedAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {request.department}
                      <span className="block text-xs text-muted-foreground">
                        {request.requestedBy}
                      </span>
                    </TableCell>
                    <TableCell>
                      {request.fulfillmentKind === "STORE_TRANSFER"
                        ? `Store stock / responsibility · ${request.receivingStoreName}`
                        : request.fulfillmentKind === "PERSON_USE"
                          ? `Personal use · ${request.recipientName}`
                          : "Department use"}
                    </TableCell>
                    <TableCell>
                      {request.typeCode}
                      <span className="block text-xs text-muted-foreground">
                        {request.identificationName}
                      </span>
                      {request.requestedUnitCode ? (
                        <span className="block text-xs text-muted-foreground">
                          Exact Unit ID: {request.requestedUnitCode}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{request.assetCategory}</TableCell>
                    <TableCell>{request.assetSubcategory}</TableCell>
                    <TableCell>{request.assetName}</TableCell>
                    <TableCell>
                      {request.requestedQuantity} {request.unit}
                    </TableCell>
                    <TableCell>{request.issuedQuantity}</TableCell>
                    <TableCell>{request.remainingQuantity}</TableCell>
                    <TableCell className="font-semibold">
                      {request.availableStock} {request.unit}
                      {request.requestedUnitCode ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {exactUnitAvailable
                            ? "Requested unit available"
                            : "Requested unit unavailable"}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          request.status === "Fulfilled"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {request.status}
                      </Badge>
                      {request.requestedUnitCode && isOpen && !exactUnitAvailable ? (
                        <span className="block text-xs text-muted-foreground">
                          Waiting for {request.requestedUnitCode}
                        </span>
                      ) : null}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {isOpen ? (
                          <div className="flex flex-wrap gap-2">
                            {request.fulfillmentKind === "STORE_TRANSFER" ? (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    Transfer to Store
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Transfer to {request.receivingStoreName}</DialogTitle>
                                    <DialogDescription>
                                      {request.typeCode} · {request.requestedUnitCode ?? `${request.remainingQuantity} ${request.unit}`} remaining
                                    </DialogDescription>
                                  </DialogHeader>
                                  <form action={fulfillStoreTransferRequestAction} className="grid gap-3">
                                    <input name="requisition_id" type="hidden" value={request.id} />
                                    <input name="destination_store_code" type="hidden" value={request.receivingStoreCode ?? ""} />
                                    {request.requestedUnitCode ? (
                                      <>
                                        <Input aria-label="Unit ID" readOnly value={request.requestedUnitCode} />
                                        <input name="asset_code" type="hidden" value={request.requestedUnitCode} />
                                      </>
                                    ) : (
                                      <>
                                        <input name="item_type_id" type="hidden" value={request.itemTypeId} />
                                        <Input
                                          aria-label="Transfer quantity"
                                          defaultValue={request.remainingQuantity}
                                          max={request.remainingQuantity}
                                          min="0.001"
                                          name="issue_quantity"
                                          required
                                          step="0.001"
                                          type="number"
                                        />
                                      </>
                                    )}
                                    <Input aria-label="Handover note" name="remark" placeholder="Handover note (optional)" />
                                    <Button disabled={!exactUnitAvailable || Number(request.availableStock) <= 0} type="submit">
                                      Record Transfer
                                    </Button>
                                  </form>
                                </DialogContent>
                              </Dialog>
                            ) : (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  {request.requestedUnitId
                                    ? "Allocate Unit"
                                    : "Allocate / Make Order"}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Allocate or order {request.typeCode}
                                  </DialogTitle>
                                  <DialogDescription>
                                    {request.assetName} for {request.department}{" "}
                                    · {request.remainingQuantity} {request.unit}{" "}
                                    remaining
                                  </DialogDescription>
                                </DialogHeader>
                                {request.requestedUnitId ? (
                                  <p className="text-sm text-muted-foreground">
                                    This request stays pending until the exact
                                    Unit ID is available in Store.
                                  </p>
                                ) : (
                                  <Button asChild size="sm" variant="outline">
                                    <Link
                                      href={storePurchaseOrderHref({
                                        itemTypeId: request.itemTypeId,
                                        quantity: request.remainingQuantity,
                                        requestNumber: request.requestNumber,
                                      })}
                                    >
                                      Make Order
                                    </Link>
                                  </Button>
                                )}
                                <form
                                  action={issueStoreRequisitionAction}
                                  className="grid gap-2"
                                >
                                  <input
                                    name="requisition_id"
                                    type="hidden"
                                    value={request.id}
                                  />
                                  <Input
                                    aria-label={`Allocate quantity for ${request.requestNumber} ${request.typeCode}`}
                                    defaultValue={
                                      issueForm.requiresUnitSelection
                                        ? "1"
                                        : request.remainingQuantity
                                    }
                                    max={request.remainingQuantity}
                                    min="0.001"
                                    name="issue_quantity"
                                    readOnly={issueForm.requiresUnitSelection}
                                    step="0.001"
                                    type="number"
                                  />
                                  <label className="grid gap-1 text-xs font-medium">
                                    {request.fulfillmentKind === "PERSON_USE" ? "Recipient" : "Department"}
                                    <Input
                                      readOnly
                                      value={request.fulfillmentKind === "PERSON_USE"
                                        ? request.recipientName ?? request.requestedBy
                                        : issueForm.department}
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-medium">
                                    Issued By
                                    <Input
                                      readOnly
                                      value={issueForm.issuedBy}
                                    />
                                  </label>
                                  {request.requestedUnitCode ? (
                                    <>
                                      <Input
                                        aria-label="Requested Unit ID / Serial ID"
                                        readOnly
                                        value={request.requestedUnitCode}
                                      />
                                      <input
                                        name="asset_code"
                                        type="hidden"
                                        value={request.requestedUnitCode}
                                      />
                                    </>
                                  ) : issueForm.requiresUnitSelection ? (
                                    <NativeSelect
                                      aria-label="Specific Unit ID / Serial ID"
                                      defaultValue={
                                        issueForm.availableUnitIds.length === 1
                                          ? issueForm.availableUnitIds[0]
                                          : ""
                                      }
                                      name="asset_code"
                                      required
                                    >
                                      <NativeSelectOption disabled value="">
                                        Select available Unit ID / Serial ID
                                      </NativeSelectOption>
                                      {issueForm.availableUnitIds.map(
                                        (unitId) => (
                                          <NativeSelectOption
                                            key={unitId}
                                            value={unitId}
                                          >
                                            {unitId}
                                          </NativeSelectOption>
                                        )
                                      )}
                                    </NativeSelect>
                                  ) : null}
                                  <Button
                                    disabled={
                                      !exactUnitAvailable ||
                                      (issueForm.requiresUnitSelection &&
                                        !issueForm.availableUnitIds.length)
                                    }
                                    size="sm"
                                    type="submit"
                                  >
                                    {!exactUnitAvailable
                                      ? "Exact Unit Pending"
                                      : issueForm.requiresUnitSelection &&
                                          !issueForm.availableUnitIds.length
                                        ? "No Unit Available"
                                      : "Save Allocation"}
                                  </Button>
                                </form>
                              </DialogContent>
                            </Dialog>
                            )}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="ghost">
                                  Cancel Request
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Cancel this request line?
                                  </DialogTitle>
                                  <DialogDescription>
                                    Store will not issue the remaining{" "}
                                    {request.remainingQuantity} {request.unit}{" "}
                                    of {request.typeCode}. Already issued
                                    quantity stays issued.
                                  </DialogDescription>
                                </DialogHeader>
                                <form action={cancelStoreRequisitionAction}>
                                  <input
                                    name="requisition_id"
                                    type="hidden"
                                    value={request.id}
                                  />
                                  <Button type="submit" variant="destructive">
                                    Cancel Remaining Request
                                  </Button>
                                </form>
                              </DialogContent>
                            </Dialog>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {!requests.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={canManage ? 14 : 12}
                  >
                    No coded item request lines available.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
