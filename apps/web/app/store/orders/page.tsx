import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"
import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { redirect } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { BulkReceiveButton } from "@/components/store/bulk-receive-button"
import { DepartmentRepairCompletion } from "@/components/store/department-repair-completion"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { storeRequestFormPolicy } from "@/lib/store-request-policy"

import {
  receiveRemainingStoreStockBatchAction,
  receiveStoreStockAction,
} from "../actions"

const bulkReceiptFormId = "store-bulk-receipt-form"

export default async function StoreOrdersPage() {
  const session = await requireAuthenticatedSession("/store/orders")
  const [grantedReads, capabilities] = await Promise.all([
    listGrantedCapabilities(session.user.id, ["store.purchase_register.read"]),
    listGrantedStoreActions(session.user.id),
  ])
  const canReadRegister = grantedReads.includes("store.purchase_register.read")
  const canRepair = capabilities.has("store.asset_repair.write")
  if (!canReadRegister && !canRepair) redirect("/unauthorized")
  const canManage = canReadRegister && capabilities.has("store.receipts.receive")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const departments = createDepartmentStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const [allOrders, requestContext] = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const mainStore = await departments.getStoreByCode(organizationId, "MAIN")
    return Promise.all([
      repository.listPurchaseOrders(
        organizationId,
        canReadRegister ? undefined : { repairOnly: true, originStoreId: mainStore.id }
      ),
      canManage
        ? repository.requisitionRequestContext({
            organizationId,
            userId: session.user.id,
          })
        : Promise.resolve(null),
    ])
  })().finally(async () => {
    await departments.close()
    await repository.close()
  })
  const data = canReadRegister
    ? allOrders
    : allOrders.filter(
        (order) => order.orderType === "REPAIR" && !order.calibrationVisitId
      )
  const receivedBy = requestContext
    ? storeRequestFormPolicy(requestContext).requestedBy
    : ""

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Purchase Register
        </h2>
        <p className="text-sm text-muted-foreground">
          Purchase Orders are started from Stock. Receive goods or complete a
          returned repair Unit ID against its order line. Allocate a returned
          unit through Store Movement. A Department request for the same Asset
          Code can be issued with any available Unit ID through Requests &amp;
          Issues.
        </p>
      </div>

      <MetricSummary
        scope="Purchase register · before table filters"
        items={[
          {
            label: "Purchase Orders",
            value: new Set(data.map((row) => row.purchaseOrderId)).size,
            tone: "information",
          },
          { tone: "brand", label: "Order Lines", value: data.length },
          canReadRegister
            ? {
                label: "Awaiting Receipt",
                value: data.filter(
                  (row) =>
                    row.orderType === "GOODS" &&
                    row.status !== "Cancelled" &&
                    Number(row.remainingQuantity) > 0
                ).length,
                description: "Goods lines with quantity remaining",
                tone: "warning",
              }
            : {
                label: "Awaiting Return",
                value: data.filter((row) => row.status === "Open").length,
                description: "Repair Unit IDs awaiting Store return",
                tone: "warning",
              },
        ]}
      />

      <SectionCard>
        <CardHeader>
          <CardTitle>Purchase Orders, Receipts and Returns</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable
            filteredSelection={
              canManage
                ? {
                    checkboxName: "purchase_order_line_id",
                    exclusiveGroup: true,
                    label: "Select All PO Lines",
                  }
                : undefined
            }
            toolbarStart={
              canManage ? (
                <BulkReceiveButton
                  action={receiveRemainingStoreStockBatchAction}
                  formId={bulkReceiptFormId}
                  receivedBy={receivedBy}
                />
              ) : null
            }
          >
            <TableHeader>
              <TableRow>
                {canManage ? <TableHead>Select</TableHead> : null}
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Order Total</TableHead>
                <TableHead>Status</TableHead>
                {canReadRegister ? <TableHead>PO Document</TableHead> : null}
                {canManage || canRepair ? (
                  <TableHead>Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((order) => {
                const canReceive =
                  order.orderType === "GOODS" &&
                  order.status !== "Cancelled" &&
                  Number(order.remainingQuantity) > 0
                const emailHref = order.supplierEmail
                  ? `mailto:${order.supplierEmail}?${new URLSearchParams({
                      body: `Please find Purchase Order ${order.orderNumber}. Download the PDF from the MRM Store Purchase Register and attach it to this email.`,
                      subject: `Purchase Order ${order.orderNumber}`,
                    }).toString()}`
                  : null
                return (
                  <TableRow key={order.id}>
                    {canManage ? (
                      <TableCell>
                        {canReceive ? (
                          <input
                            aria-label={`Select ${order.typeCode} from ${order.orderNumber}`}
                            className="size-4 accent-primary"
                            data-selection-group={order.purchaseOrderId}
                            data-selection-group-label={order.orderNumber}
                            form={bulkReceiptFormId}
                            name="purchase_order_line_id"
                            type="checkbox"
                            value={order.id}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>{order.orderDate}</TableCell>
                    <TableCell>
                      {order.calibrationVisitId
                        ? "Calibration"
                        : order.orderType === "REPAIR" ? "Repair" : "Goods"}
                    </TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>
                      {order.typeCode} — {order.itemName}
                    </TableCell>
                    <TableCell>
                      {order.orderedQuantity} {order.unit}
                    </TableCell>
                    <TableCell>
                      {order.receivedQuantity} {order.unit}
                    </TableCell>
                    <TableCell>₹ {order.unitPrice}</TableCell>
                    <TableCell>₹ {order.orderTotal}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    {canReadRegister ? <TableCell>
                      <div className="grid min-w-32 gap-2">
                        <Button asChild size="sm" variant="outline">
                          <AttachmentViewerLink
                            fileName={`${order.orderNumber}.pdf`}
                            href={`/store/orders/${encodeURIComponent(order.purchaseOrderId)}/pdf`}
                            mediaType="application/pdf"
                          >
                            View PDF
                          </AttachmentViewerLink>
                        </Button>
                        {emailHref ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={emailHref}>Email Supplier</a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Add Supplier Email in Master
                          </span>
                        )}
                      </div>
                    </TableCell> : null}
                    {canManage || canRepair ? (
                      <TableCell>
                        {canManage && canReceive ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm">Receive Items</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  Receive {order.typeCode}
                                </DialogTitle>
                                <DialogDescription>
                                  {order.orderNumber} ·{" "}
                                  {order.remainingQuantity} {order.unit}{" "}
                                  remaining. Stock will be received into Main
                                  Store under your signed-in ID.
                                </DialogDescription>
                              </DialogHeader>
                              <PendingRetainedUploadForm
                                action={receiveStoreStockAction}
                                uploads={[
                                  {
                                    field: "guarantee_card",
                                    intent: {
                                      kind: "store-guarantee-card",
                                      purchaseOrderLineId: order.id,
                                    },
                                  },
                                ]}
                                className="grid gap-5"
                                encType="multipart/form-data"
                              >
                                <input
                                  name="purchase_order_line_id"
                                  type="hidden"
                                  value={order.id}
                                />
                                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                  <Field>
                                    <FieldLabel htmlFor={`receipt-received-by-${order.id}`}>
                                      Received By
                                    </FieldLabel>
                                    <Input
                                      id={`receipt-received-by-${order.id}`}
                                      readOnly
                                      value={receivedBy}
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-quantity-${order.id}`}
                                    >
                                      Quantity Received
                                    </FieldLabel>
                                    <Input
                                      defaultValue={order.remainingQuantity}
                                      id={`receipt-quantity-${order.id}`}
                                      max={order.remainingQuantity}
                                      min="0.001"
                                      name="quantity"
                                      required
                                      step="0.001"
                                      type="number"
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-bill-number-${order.id}`}
                                    >
                                      Supplier Bill Number (optional)
                                    </FieldLabel>
                                    <Input
                                      id={`receipt-bill-number-${order.id}`}
                                      name="bill_number"
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`receipt-bill-date-${order.id}`}
                                    >
                                      Supplier Bill Date (optional)
                                    </FieldLabel>
                                    <Input
                                      id={`receipt-bill-date-${order.id}`}
                                      name="bill_date"
                                      type="date"
                                    />
                                  </Field>
                                </FieldGroup>

                                <details className="rounded-lg border px-4 py-3">
                                  <summary className="cursor-pointer font-medium">
                                    Warranty &amp; document (optional)
                                  </summary>
                                  <div className="mt-4 grid gap-4">
                                    <Field>
                                      <FieldLabel
                                        htmlFor={`receipt-warranty-${order.id}`}
                                      >
                                        Warranty / Guarantee Until
                                      </FieldLabel>
                                      <Input
                                        id={`receipt-warranty-${order.id}`}
                                        name="warranty_until"
                                        type="date"
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel
                                        htmlFor={`receipt-card-${order.id}`}
                                      >
                                        Warranty / Guarantee Card
                                      </FieldLabel>
                                      <Input
                                        accept="application/pdf,image/jpeg,image/png"
                                        id={`receipt-card-${order.id}`}
                                        name="guarantee_card"
                                        type="file"
                                      />
                                    </Field>
                                  </div>
                                </details>

                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button type="button" variant="outline">
                                      Cancel
                                    </Button>
                                  </DialogClose>
                                  <Button type="submit">
                                    Receive Into Main Store
                                  </Button>
                                </DialogFooter>
                              </PendingRetainedUploadForm>
                            </DialogContent>
                          </Dialog>
                        ) : canRepair &&
                          order.orderType === "REPAIR" &&
                          !order.calibrationVisitId &&
                          order.originStoreCode === "MAIN" &&
                          order.status === "Open" ? (
                          <DepartmentRepairCompletion
                            assetCode={order.typeCode}
                            purchaseOrderId={order.purchaseOrderId}
                            storeCode="MAIN"
                          />
                        ) : order.orderType === "REPAIR" ? (
                          order.calibrationVisitId
                            ? "Use Calibration Visit"
                            : order.status === "Completed"
                              ? "Returned to Store"
                              : "Repair return pending"
                        ) : (
                          canReceive ? "Awaiting goods receipt" : "Fully received"
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {!data.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={10 + Number(canReadRegister) + Number(canManage) + Number(canManage || canRepair)}
                  >
                    No Purchase Orders yet. Select an item from Stock to create
                    one.
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
