import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionCard,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { FormGrid, PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  accountableStoreHref,
  accountableStorePermission,
} from "@/lib/auth/department-store-capabilities"
import { listGrantedCapabilities, requireAuthenticatedSession, requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { istDateValue } from "@/lib/date-time"
import { addCalibrationOfferAction, issueCalibrationServiceOrderAction } from "./actions"

export default async function AccountableStoreCalibrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string }>
  searchParams: Promise<{ store?: string }>
}) {
  const { unitId } = await params
  const { store: requestedStore } = await searchParams
  const storeCode = requestedStore?.trim()
  if (!storeCode) notFound()
  const path = `/department-store/calibration/${encodeURIComponent(unitId)}?store=${encodeURIComponent(storeCode)}`
  const session = storeCode === "MAIN"
    ? await requireAuthenticatedSession(path)
    : await requireCapability(accountableStorePermission(storeCode, "read"), path)
  const mainRepair = storeCode === "MAIN" &&
    (await listGrantedStoreActions(session.user.id)).has("store.asset_repair.write")
  if (storeCode === "MAIN" && !mainRepair &&
    !(await listGrantedCapabilities(session.user.id, ["store.stock.read"])).length) {
    redirect("/unauthorized")
  }
  const canWrite = storeCode === "MAIN"
    ? mainRepair
    : (await listGrantedCapabilities(session.user.id, [accountableStorePermission(storeCode, "write")])).length > 0
  const connectionString = readAuthEnvironment().connectionString
  const repository = createStoreRepository({ connectionString })
  const departments = createDepartmentStoreRepository({ connectionString })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const accountability = await departments.getAssetAccountability(organizationId, unitId)
    if (!accountability || accountability.accountableStoreCode !== storeCode) notFound()
    const workspace = await repository.getAssetWorkspace({ assetCode: unitId, organizationId })
    if (!workspace) notFound()
    return { accountability, workspace }
  })().finally(async () => {
    await departments.close()
    await repository.close()
  })
  const { calibrationVisits, calibrationSuppliers } = data.workspace
  const active = calibrationVisits.find((visit) =>
    visit.method === "SUPPLIER" && ["OPEN", "DISPATCHED", "RETURNED"].includes(visit.status)
  )
  const issuableOffers = active?.purchaseOrderId
    ? active.offers.filter((offer) => offer.id === active.selectedOfferId)
    : active?.offers ?? []
  const recent = calibrationVisits.filter((visit) => visit.method === "SUPPLIER")

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        title={`Supplier Calibration · ${unitId}`}
        description={`${data.accountability.accountableStoreName} handles supplier offers and the service PO. Quality Control records dispatch, return, certificate and result.`}
        actions={<Button asChild variant="outline"><Link href={accountableStoreHref(storeCode)}>Back to Store</Link></Button>}
      />
      {active ? (
        <SectionCard>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{active.scheduleName}</CardTitle>
                <CardDescription>Due {active.dueOn} · {active.scope}</CardDescription>
              </div>
              <StatusBadge
                tone={active.status === "OPEN" ? "warning" : "information"}
                value={active.status}
              />
            </div>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-5">
            <OperationalTable filterStorageKey={`calibration-service-offers-${active.id}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Quoted on</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell>{offer.supplierName}</TableCell>
                    <TableCell>{offer.quotedOn}</TableCell>
                    <TableCell>₹ {offer.quotedPrice}</TableCell>
                    <TableCell>{offer.quoteReference || "—"}</TableCell>
                  </TableRow>
                ))}
                {!active.offers.length ? (
                  <TableRow><TableCell colSpan={4}>No supplier offers recorded.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </OperationalTable>
            {active.purchaseOrderId ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Service PO: {active.purchaseOrderNumber || "Pending issue"} · {active.purchaseOrderIssuanceState}</span>
                {active.purchaseOrderIssuanceState === "issued" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/store/orders/${encodeURIComponent(active.purchaseOrderId)}/pdf`}>View PO</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            {active.status === "OPEN" && active.purchaseOrderIssuanceState !== "issued" && canWrite ? (
              <div className="grid items-start gap-6 xl:grid-cols-2">
                {!active.purchaseOrderId ? <form action={addCalibrationOfferAction} className="grid w-full max-w-xl gap-3">
                  <h3 className="font-semibold">Record supplier offer</h3>
                  <input name="store_code" type="hidden" value={storeCode} />
                  <input name="unit_id" type="hidden" value={unitId} />
                  <input name="visit_id" type="hidden" value={active.id} />
                  <Field>
                    <FieldLabel htmlFor="calibration-supplier">Supplier</FieldLabel>
                    <NativeSelect defaultValue="" id="calibration-supplier" name="supplier_id" required>
                      <NativeSelectOption value="">Select supplier</NativeSelectOption>
                      {calibrationSuppliers.map((supplier) => (
                        <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <FormGrid className="sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="calibration-price">Quoted price (₹)</FieldLabel>
                      <Input id="calibration-price" min="0" name="quoted_price" required step="0.01" type="number" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="calibration-quoted-on">Quoted on</FieldLabel>
                      <Input defaultValue={istDateValue()} id="calibration-quoted-on" name="quoted_on" required type="date" />
                    </Field>
                  </FormGrid>
                  <Field>
                    <FieldLabel htmlFor="calibration-reference">Quote reference</FieldLabel>
                    <Input id="calibration-reference" name="quote_reference" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="calibration-offer-notes">Notes</FieldLabel>
                    <Textarea id="calibration-offer-notes" name="notes" />
                  </Field>
                  <Button className="w-fit" disabled={!calibrationSuppliers.length} type="submit">Save offer</Button>
                </form> : null}
                <form action={issueCalibrationServiceOrderAction} className="grid w-full max-w-xl gap-3">
                  <h3 className="font-semibold">Issue service PO</h3>
                  <input name="store_code" type="hidden" value={storeCode} />
                  <input name="unit_id" type="hidden" value={unitId} />
                  <input name="visit_id" type="hidden" value={active.id} />
                  <Field>
                    <FieldLabel htmlFor="calibration-offer">Selected offer</FieldLabel>
                    <NativeSelect defaultValue={active.selectedOfferId || ""} id="calibration-offer" name="offer_id" required>
                      <NativeSelectOption value="">Select offer</NativeSelectOption>
                      {issuableOffers.map((offer) => (
                        <NativeSelectOption key={offer.id} value={offer.id}>{offer.supplierName} · ₹ {offer.quotedPrice}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="calibration-order-date">PO date</FieldLabel>
                    <Input defaultValue={istDateValue()} id="calibration-order-date" name="order_date" required type="date" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="calibration-order-remark">PO remark</FieldLabel>
                    <Textarea id="calibration-order-remark" name="remark" />
                  </Field>
                  <Button className="w-fit" disabled={!issuableOffers.length} type="submit">{active.purchaseOrderId ? "Retry PO issue" : "Issue calibration PO"}</Button>
                </form>
              </div>
            ) : active.status === "OPEN" && active.purchaseOrderId ? (
              <p className="text-sm text-muted-foreground">PO issued. Quality Control will record physical dispatch and return.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Quality Control owns the remaining visit steps.</p>
            )}
          </CardContent>
        </SectionCard>
      ) : (
        <StandardState title="No active supplier calibration" description="Quality Control starts a supplier visit from its Calibration work list. Offers and the service PO then appear here." />
      )}
      {recent.length ? (
        <SectionCard>
          <CardHeader><CardTitle>Supplier calibration history</CardTitle></CardHeader>
          <CardContent className="min-w-0">
            <OperationalTable filterStorageKey={`supplier-calibration-history-${unitId}`}>
              <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>Calibration</TableHead><TableHead>Status</TableHead><TableHead>Service PO</TableHead><TableHead>Completed</TableHead></TableRow></TableHeader>
              <TableBody>
                {recent.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell>{visit.dueOn}</TableCell>
                    <TableCell>{visit.scheduleName}</TableCell>
                    <TableCell><StatusBadge tone={visit.status === "PASSED" ? "positive" : visit.status === "FAILED" ? "danger" : "warning"} value={visit.status} /></TableCell>
                    <TableCell>{visit.purchaseOrderNumber || "—"}</TableCell>
                    <TableCell>{visit.completedOn || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
