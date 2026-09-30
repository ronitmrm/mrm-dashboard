import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"
import { FormGrid } from "@/components/ui/golden-patterns"
import { istDateValue } from "@/lib/date-time"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardState } from "@workspace/ui/components/standard-state"

type CalibrationFormAction = (formData: FormData) => void | Promise<void>
type CalibrationUploadAction = (formData: FormData) => void | Promise<unknown>

export type StoreCalibrationSchedule = {
  id: string
  name: string
  nextDueOn: string
  active: boolean
}

export type StoreCalibrationSupplier = {
  id: string
  code: string
  name: string
}

export type StoreCalibrationOffer = {
  id: string
  supplierId: string
  supplierCode: string
  supplierName: string
  quotedPrice: string
  quotedOn: string
  quoteReference: string | null
  quoteHref?: string | null
}

export type StoreCalibrationVisit = {
  id: string
  scheduleId: string
  scheduleName: string
  dueOn: string
  scope: string
  status: "OPEN" | "DISPATCHED" | "RETURNED" | "PASSED" | "FAILED" | "CANCELLED"
  method: "SUPPLIER" | "IN_HOUSE"
  selectedOfferId: string | null
  agreedPrice: string | null
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  dispatchedOn: string | null
  returnedOn: string | null
  completedOn: string | null
  result: string | null
  certificateNumber: string | null
  certificateFileName: string | null
  certificateHref: string | null
  offers: StoreCalibrationOffer[]
}

export type StoreCalibrationActions = {
  openVisit: CalibrationFormAction
  addOffer: CalibrationFormAction
  cancelVisit: CalibrationFormAction
  dispatchVisit: CalibrationFormAction
  returnVisit: CalibrationFormAction
  uploadCertificate: CalibrationUploadAction
  completeVisit: CalibrationFormAction
  completeInHouseVisit: CalibrationFormAction
  cancelInHouseVisit: CalibrationFormAction
}

const priceFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

function price(value: string | null) {
  if (value === null) return "—"
  const amount = Number(value)
  return Number.isFinite(amount) ? priceFormat.format(amount) : "—"
}

function visitStatus(status: StoreCalibrationVisit["status"]) {
  switch (status) {
    case "OPEN":
      return { label: "Get supplier offers", tone: "warning" as const }
    case "DISPATCHED":
      return { label: "At supplier", tone: "information" as const }
    case "RETURNED":
      return { label: "Record result", tone: "warning" as const }
    case "PASSED":
      return { label: "Passed", tone: "positive" as const }
    case "FAILED":
      return { label: "Failed", tone: "danger" as const }
    case "CANCELLED":
      return { label: "Cancelled", tone: "inactive" as const }
  }
}

function PdfLink({
  fileName,
  href,
  label,
}: {
  fileName: string
  href: string
  label: string
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <AttachmentViewerLink
        fileName={fileName}
        href={href}
        mediaType="application/pdf"
      >
        {label}
      </AttachmentViewerLink>
    </Button>
  )
}

function VisitIdentity({ visit }: { visit: StoreCalibrationVisit }) {
  const status = visit.method === "IN_HOUSE" && visit.status === "OPEN"
    ? { label: "In-house calibration", tone: "warning" as const }
    : visitStatus(visit.status)
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="font-semibold">{visit.scheduleName}</h4>
        <p className="text-sm text-muted-foreground">
          Due {visit.dueOn} · {visit.scope}
        </p>
      </div>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </div>
  )
}

function OfferComparison({ visit }: { visit: StoreCalibrationVisit }) {
  return (
    <OperationalTable filterStorageKey={`store-calibration-offers-${visit.id}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Quoted on</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Quote</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visit.offers.map((offer) => (
          <TableRow key={offer.id}>
            <TableCell>
              <span className="font-medium">{offer.supplierName}</span>
              <span className="block text-xs text-muted-foreground">
                {offer.supplierCode}
              </span>
            </TableCell>
            <TableCell>{offer.quotedOn}</TableCell>
            <TableCell>{price(offer.quotedPrice)}</TableCell>
            <TableCell>{offer.quoteReference || "—"}</TableCell>
            <TableCell>
              {offer.quoteHref ? (
                <PdfLink
                  fileName={`${offer.supplierCode}-calibration-quote.pdf`}
                  href={offer.quoteHref}
                  label="View quote"
                />
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
        {!visit.offers.length ? (
          <TableRow>
            <TableCell
              className="h-20 text-center text-muted-foreground"
              colSpan={5}
            >
              No calibration offers recorded for this visit.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </OperationalTable>
  )
}

function OpenVisit({
  actions,
  assetCode,
  canManage,
  suppliers,
  visit,
}: {
  actions: StoreCalibrationActions
  assetCode: string
  canManage: boolean
  suppliers: StoreCalibrationSupplier[]
  visit: StoreCalibrationVisit
}) {
  return (
    <div className="grid gap-5">
      <OfferComparison visit={visit} />
      {canManage ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <form action={actions.addOffer} className="grid max-w-xl gap-3">
            <h5 className="font-semibold">Add supplier offer</h5>
            <input name="asset_code" type="hidden" value={assetCode} />
            <input name="visit_id" type="hidden" value={visit.id} />
            <Field>
              <FieldLabel htmlFor={`calibration-supplier-${visit.id}`}>
                Store Supplier
              </FieldLabel>
              <NativeSelect
                defaultValue=""
                id={`calibration-supplier-${visit.id}`}
                name="supplier_id"
                required
              >
                <NativeSelectOption value="">
                  Select Supplier
                </NativeSelectOption>
                {suppliers.map((supplier) => (
                  <NativeSelectOption key={supplier.id} value={supplier.id}>
                    {supplier.code} — {supplier.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <FormGrid className="sm:grid-cols-2 xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`calibration-price-${visit.id}`}>
                  Quoted Price (₹)
                </FieldLabel>
                <Input
                  id={`calibration-price-${visit.id}`}
                  min="0"
                  name="quoted_price"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`calibration-quoted-on-${visit.id}`}>
                  Quoted On
                </FieldLabel>
                <Input
                  defaultValue={istDateValue()}
                  id={`calibration-quoted-on-${visit.id}`}
                  name="quoted_on"
                  required
                  type="date"
                />
              </Field>
            </FormGrid>
            <Field>
              <FieldLabel htmlFor={`calibration-reference-${visit.id}`}>
                Quote Reference
              </FieldLabel>
              <Input
                id={`calibration-reference-${visit.id}`}
                name="quote_reference"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`calibration-notes-${visit.id}`}>
                Notes
              </FieldLabel>
              <Textarea id={`calibration-notes-${visit.id}`} name="notes" />
            </Field>
            <Button
              className="w-fit"
              disabled={!suppliers.length}
              type="submit"
            >
              Save Offer
            </Button>
            {!suppliers.length ? (
              <p className="text-sm text-muted-foreground">
                Add a Supplier in Store Master Data before recording offers.
              </p>
            ) : null}
          </form>
          {visit.offers.length ? (
            <form
              action={actions.dispatchVisit}
              className="grid max-w-xl gap-3"
            >
              <h5 className="font-semibold">Choose offer and dispatch</h5>
              <p className="text-sm text-muted-foreground">
                The chosen price is fixed on the calibration service order.
                Dispatch records this Unit ID moving to the Supplier.
              </p>
              <input name="asset_code" type="hidden" value={assetCode} />
              <input name="visit_id" type="hidden" value={visit.id} />
              <Field>
                <FieldLabel htmlFor={`calibration-offer-${visit.id}`}>
                  Accepted Offer
                </FieldLabel>
                <NativeSelect
                  defaultValue=""
                  id={`calibration-offer-${visit.id}`}
                  name="offer_id"
                  required
                >
                  <NativeSelectOption value="">Select offer</NativeSelectOption>
                  {visit.offers.map((offer) => (
                    <NativeSelectOption key={offer.id} value={offer.id}>
                      {offer.supplierCode} — {offer.supplierName} —{" "}
                      {price(offer.quotedPrice)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`calibration-order-date-${visit.id}`}>
                  PO Date
                </FieldLabel>
                <Input
                  defaultValue={istDateValue()}
                  id={`calibration-order-date-${visit.id}`}
                  name="order_date"
                  required
                  type="date"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`calibration-dispatch-remark-${visit.id}`}>
                  Dispatch Remark
                </FieldLabel>
                <Input
                  id={`calibration-dispatch-remark-${visit.id}`}
                  name="remark"
                />
              </Field>
              <Button className="w-fit" type="submit">
                Issue PO & Dispatch
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {canManage ? (
        <form action={actions.cancelVisit}>
          <input name="asset_code" type="hidden" value={assetCode} />
          <input name="visit_id" type="hidden" value={visit.id} />
          <Button type="submit" variant="outline">Cancel Visit</Button>
        </form>
      ) : null}
    </div>
  )
}

function VisitOrder({ visit }: { visit: StoreCalibrationVisit }) {
  const accepted = visit.offers.find(
    (offer) => offer.id === visit.selectedOfferId
  )
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span>
        Supplier: <strong>{accepted?.supplierName || "—"}</strong>
      </span>
      <span>
        Agreed Price: <strong>{price(visit.agreedPrice)}</strong>
      </span>
      {visit.purchaseOrderId ? (
        <PdfLink
          fileName={`${visit.purchaseOrderNumber || "calibration-service-order"}.pdf`}
          href={`/store/orders/${visit.purchaseOrderId}/pdf`}
          label={`PO ${visit.purchaseOrderNumber || "PDF"}`}
        />
      ) : null}
    </div>
  )
}

function DispatchedVisit({
  actions,
  assetCode,
  canManage,
  visit,
}: {
  actions: StoreCalibrationActions
  assetCode: string
  canManage: boolean
  visit: StoreCalibrationVisit
}) {
  return (
    <div className="grid gap-4">
      <VisitOrder visit={visit} />
      <p className="text-sm text-muted-foreground">
        Dispatched {visit.dispatchedOn || "—"}. Record the physical return
        before the result.
      </p>
      {canManage ? (
        <form action={actions.returnVisit} className="grid max-w-xl gap-3">
          <input name="asset_code" type="hidden" value={assetCode} />
          <input name="visit_id" type="hidden" value={visit.id} />
          <FormGrid className="sm:grid-cols-2 xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`calibration-returned-on-${visit.id}`}>
                Returned On
              </FieldLabel>
              <Input
                defaultValue={istDateValue()}
                id={`calibration-returned-on-${visit.id}`}
                name="returned_on"
                required
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`calibration-return-remark-${visit.id}`}>
                Return Remark
              </FieldLabel>
              <Input
                id={`calibration-return-remark-${visit.id}`}
                name="remark"
              />
            </Field>
          </FormGrid>
          <Button className="w-fit" type="submit">
            Record Return to Store
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function ReturnedVisit({
  actions,
  assetCode,
  canManage,
  visit,
}: {
  actions: StoreCalibrationActions
  assetCode: string
  canManage: boolean
  visit: StoreCalibrationVisit
}) {
  return (
    <div className="grid gap-4">
      {visit.method === "SUPPLIER" ? <VisitOrder visit={visit} /> : null}
      <p className="text-sm text-muted-foreground">
        {visit.method === "IN_HOUSE"
          ? "Record the in-house result and upload its certificate."
          : `Returned to Store ${visit.returnedOn || "—"}.`}
      </p>
      {visit.certificateHref ? (
        <PdfLink
          fileName={visit.certificateFileName || "calibration-certificate.pdf"}
          href={visit.certificateHref}
          label="View Certificate"
        />
      ) : null}
      {canManage && !visit.certificateHref ? (
        <PendingRetainedUploadForm
          action={actions.uploadCertificate}
          className="grid max-w-xl gap-3"
          encType="multipart/form-data"
          uploads={[
            {
              field: "calibration_certificate",
              intent: {
                kind: "store-calibration-certificate",
                visitId: visit.id,
              },
            },
          ]}
        >
          <input name="asset_code" type="hidden" value={assetCode} />
          <input name="visit_id" type="hidden" value={visit.id} />
          <Field>
            <FieldLabel htmlFor={`calibration-certificate-${visit.id}`}>
              Calibration Certificate PDF
            </FieldLabel>
            <Input
              accept="application/pdf"
              id={`calibration-certificate-${visit.id}`}
              name="calibration_certificate"
              required
              type="file"
            />
          </Field>
          <Button className="w-fit" type="submit">
            Save Certificate
          </Button>
        </PendingRetainedUploadForm>
      ) : null}
      {canManage && visit.certificateHref ? (
        <form action={visit.method === "IN_HOUSE" ? actions.completeInHouseVisit : actions.completeVisit} className="grid max-w-xl gap-3">
          <h5 className="font-semibold">Record calibration result</h5>
          <input name="asset_code" type="hidden" value={assetCode} />
          <input name="visit_id" type="hidden" value={visit.id} />
          <FormGrid className="sm:grid-cols-2 xl:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`calibration-completed-on-${visit.id}`}>
                Completed On
              </FieldLabel>
              <Input
                defaultValue={istDateValue()}
                id={`calibration-completed-on-${visit.id}`}
                name="completed_on"
                required
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`calibration-result-${visit.id}`}>
                Result
              </FieldLabel>
              <NativeSelect
                defaultValue=""
                id={`calibration-result-${visit.id}`}
                name="result"
                required
              >
                <NativeSelectOption value="">Select result</NativeSelectOption>
                <NativeSelectOption value="PASSED">Passed</NativeSelectOption>
                <NativeSelectOption value="FAILED">Failed</NativeSelectOption>
              </NativeSelect>
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel htmlFor={`calibration-certificate-number-${visit.id}`}>
              Certificate Number
            </FieldLabel>
            <Input
              id={`calibration-certificate-number-${visit.id}`}
              name="certificate_number"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`calibration-work-done-${visit.id}`}>
              Result Notes
            </FieldLabel>
            <Textarea
              id={`calibration-work-done-${visit.id}`}
              name="work_done"
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Passing calculates the next due date. A failed result keeps this
            timetable due.
          </p>
          <Button className="w-fit" type="submit">
            Save Result
          </Button>
        </form>
      ) : null}
      {canManage && visit.method === "IN_HOUSE" ? (
        <form action={actions.cancelInHouseVisit}>
          <input name="asset_code" type="hidden" value={assetCode} />
          <input name="visit_id" type="hidden" value={visit.id} />
          <Button type="submit" variant="outline">Cancel In-House Visit</Button>
        </form>
      ) : null}
    </div>
  )
}

export function StoreAssetCalibration({
  actions,
  assetCode,
  canManage,
  canDispatch,
  inHouseScheduleId,
  schedules,
  suppliers,
  visits,
}: {
  actions: StoreCalibrationActions
  assetCode: string
  canManage: boolean
  canDispatch: boolean
  inHouseScheduleId?: string
  schedules: StoreCalibrationSchedule[]
  suppliers: StoreCalibrationSupplier[]
  visits: StoreCalibrationVisit[]
}) {
  const currentVisits = visits.filter(
    (visit) =>
      visit.status === "OPEN" ||
      visit.status === "DISPATCHED" ||
      visit.status === "RETURNED"
  )
  const previousVisits = visits.filter(
    (visit) =>
      visit.status === "PASSED" ||
      visit.status === "FAILED" ||
      visit.status === "CANCELLED"
  )
  const availableSchedules = schedules.filter(
    (schedule) =>
      schedule.active &&
      !currentVisits.some((visit) => visit.scheduleId === schedule.id)
  )

  return (
    <div className="grid gap-4">
      <SectionCard width="standard">
        <CardHeader>
          <CardTitle>Start Calibration</CardTitle>
          <CardDescription>
            Select a timetable and perform calibration in house or through a
            Supplier. Every visit keeps its own certificate and result.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage && availableSchedules.length ? (
            <form action={actions.openVisit} className="grid gap-3">
              <input name="asset_code" type="hidden" value={assetCode} />
              <Field>
                <FieldLabel htmlFor={`calibration-schedule-${assetCode}`}>
                  Calibration Schedule
                </FieldLabel>
                <NativeSelect
                  defaultValue={availableSchedules.some((schedule) => schedule.id === inHouseScheduleId)
                    ? inHouseScheduleId : ""}
                  id={`calibration-schedule-${assetCode}`}
                  name="schedule_id"
                  required
                >
                  <NativeSelectOption value="">
                    Select schedule
                  </NativeSelectOption>
                  {availableSchedules.map((schedule) => (
                    <NativeSelectOption key={schedule.id} value={schedule.id}>
                      {schedule.name} — due {schedule.nextDueOn}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`calibration-method-${assetCode}`}>Method</FieldLabel>
                <NativeSelect
                  defaultValue={inHouseScheduleId ? "IN_HOUSE" : canDispatch ? "SUPPLIER" : "IN_HOUSE"}
                  id={`calibration-method-${assetCode}`}
                  name="method"
                  required
                >
                  {canDispatch ? <NativeSelectOption value="SUPPLIER">Supplier</NativeSelectOption> : null}
                  <NativeSelectOption value="IN_HOUSE">In House</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`calibration-scope-${assetCode}`}>
                  Test Scope
                </FieldLabel>
                <Textarea
                  id={`calibration-scope-${assetCode}`}
                  name="scope"
                  required
                />
              </Field>
              <Button className="w-fit" type="submit">
                Start Calibration Visit
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {!schedules.length
                ? "Assign a calibration schedule to this Unit ID first."
                : !availableSchedules.length
                  ? "No active schedule is available. Finish the current visit or assign a schedule."
                  : "Calibration records are read only for your account."}
            </p>
          )}
        </CardContent>
      </SectionCard>

      <SectionCard>
        <CardHeader>
          <CardTitle>Calibration in Progress</CardTitle>
          <CardDescription>
            Supplier visits retain their order and movements. In-house visits
            require a certificate before recording the result.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5">
          {currentVisits.map((visit) => (
            <section
              className="grid min-w-0 gap-4 border-b pb-5 last:border-b-0 last:pb-0"
              key={visit.id}
            >
              <VisitIdentity visit={visit} />
              {visit.status === "OPEN" && visit.method === "SUPPLIER" ? (
                <OpenVisit
                  actions={actions}
                  assetCode={assetCode}
                  canManage={canDispatch}
                  suppliers={suppliers}
                  visit={visit}
                />
              ) : visit.status === "DISPATCHED" ? (
                <DispatchedVisit
                  actions={actions}
                  assetCode={assetCode}
                  canManage={canDispatch}
                  visit={visit}
                />
              ) : (
                <ReturnedVisit
                  actions={actions}
                  assetCode={assetCode}
                  canManage={visit.method === "IN_HOUSE" ? canManage : canDispatch}
                  visit={visit}
                />
              )}
            </section>
          ))}
          {!currentVisits.length ? (
            <StandardState
              description="Start a visit from an assigned calibration schedule when the Unit ID is ready."
              title="No calibration visit in progress"
            />
          ) : null}
        </CardContent>
      </SectionCard>

      <SectionCard>
        <CardHeader>
          <CardTitle>Calibration History</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable
            filterStorageKey={`store-calibration-history-${assetCode}`}
          >
            <TableHeader>
              <TableRow>
                <TableHead>Schedule</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Certificate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previousVisits.map((visit) => {
                const selected = visit.offers.find(
                  (offer) => offer.id === visit.selectedOfferId
                )
                const status = visitStatus(visit.status)
                return (
                  <TableRow key={visit.id}>
                    <TableCell>
                      <span className="font-medium">{visit.scheduleName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {visit.scope}
                      </span>
                    </TableCell>
                    <TableCell>{visit.dueOn}</TableCell>
                    <TableCell>{visit.method === "IN_HOUSE" ? "In House" : "Supplier"}</TableCell>
                    <TableCell>{selected?.supplierName || "—"}</TableCell>
                    <TableCell>{price(visit.agreedPrice)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{visit.completedOn || "—"}</TableCell>
                    <TableCell>
                      {visit.certificateHref ? (
                        <PdfLink
                          fileName={
                            visit.certificateFileName ||
                            "calibration-certificate.pdf"
                          }
                          href={visit.certificateHref}
                          label={visit.certificateNumber || "View Certificate"}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!previousVisits.length ? (
                <TableRow>
                  <TableCell
                    className="h-20 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    No completed calibration visits for this Unit ID.
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
