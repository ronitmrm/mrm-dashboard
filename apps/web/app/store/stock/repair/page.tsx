import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Wrench } from "lucide-react"

import { RepairPoDetailsForm } from "@/components/store/repair-po-details-form"
import {
  FormGrid,
  FormSection,
  PageHeader,
  StandardState,
} from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { istDateValue } from "@/lib/date-time"

import { createStoreRepairPurchaseOrderAction } from "../../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreRepairPoPage({
  searchParams,
}: {
  searchParams: Promise<{
    asset_code?: string | string[]
    issuance_id?: string | string[]
  }>
}) {
  await requireCapability("store.stock.read", "/store/stock/repair")
  await requireStoreAction("store.asset_repair.write", "/store/stock/repair")
  const params = await searchParams
  const requestedCodes = Array.from(
    new Map(
      (Array.isArray(params.asset_code)
        ? params.asset_code
        : params.asset_code
          ? [params.asset_code]
          : []
      )
        .map((code) => code.trim())
        .filter(Boolean)
        .map((code) => [code.toLowerCase(), code] as const)
    ).values()
  )
  const issuanceId = firstValue(params.issuance_id)
  const validIssuanceId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
    issuanceId
  )
  const selectionParams = new URLSearchParams({ mode: "repair" })
  if (validIssuanceId) selectionParams.set("issuance_id", issuanceId)
  for (const code of requestedCodes) selectionParams.append("asset_code", code)
  const backHref = `/store/stock?${selectionParams}`

  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, physicalUnits, suppliers, departments] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listStockPhysicalUnits(organizationId),
      repository.listSuppliers(organizationId),
      repository.listMovementDepartments(organizationId),
    ])
    return { items, physicalUnits, suppliers, departments }
  })().finally(() => repository.close())
  const itemById = new Map(data.items.map((item) => [item.id, item]))
  const unitByCode = new Map(
    data.physicalUnits.map((unit) => [unit.assetCode.toLowerCase(), unit])
  )
  const invalidCodes: string[] = []
  const units = requestedCodes.flatMap((code) => {
    const unit = unitByCode.get(code.toLowerCase())
    const item = unit ? itemById.get(unit.itemTypeId) : undefined
    if (
      !unit ||
      !item ||
      item.trackingMode !== "SERIALIZED" ||
      unit.status === "SCRAPPED"
    ) {
      invalidCodes.push(code)
      return []
    }
    return [
      {
        assetCode: unit.assetCode,
        assetName: item.assetName,
        holder: unit.locationName ?? unit.holderName ?? unit.holderType,
        holderReference: unit.holderReference,
        holderType: unit.holderType,
        status: unit.status,
      },
    ]
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={backHref}>Back to Stock selection</Link>
          </Button>
        }
        badge={
          <StatusBadge
            tone="information"
            value={`${requestedCodes.length} selected Unit ID${requestedCodes.length === 1 ? "" : "s"}`}
          />
        }
        description="Apply shared repair details, then review each unit's Supplier, scope, price and optional reassignment request."
        icon={Wrench}
        title="Make Repair Purchase Order"
      />

      {!requestedCodes.length ? (
        <StandardState
          action={
            <Button asChild>
              <Link href={backHref}>Select Unit IDs in Stock</Link>
            </Button>
          }
          description="Select one or more physical Unit IDs in the Stock Register first."
          title="No Unit IDs selected"
        />
      ) : invalidCodes.length ? (
        <StandardState
          action={
            <Button asChild>
              <Link href={backHref}>Edit Stock selection</Link>
            </Button>
          }
          description={`These selected Unit IDs are unavailable for a Repair PO: ${invalidCodes.join(", ")}. Review the selection in Stock.`}
          title="Review selected Unit IDs"
          variant="error"
        />
      ) : !validIssuanceId ? (
        <StandardState
          action={
            <Button asChild>
              <Link href={backHref}>Return to Stock selection</Link>
            </Button>
          }
          description="Continue from Stock to prepare this Repair PO."
          title="Start from Stock"
          variant="error"
        />
      ) : !data.suppliers.length ? (
        <StandardState
          description="An active Store Supplier is needed before a Repair PO can be created."
          title="No Repair Suppliers available"
          variant="error"
        />
      ) : (
        <FormSection
          description={`Enter the repair details for all ${units.length} selected Unit ID${units.length === 1 ? "" : "s"}. Units assigned to different Suppliers will be placed on separate POs. A reassignment request names the exact Unit ID and waits until it returns to Store.`}
          title="Repair PO details"
          width="full"
        >
          <form
            action={createStoreRepairPurchaseOrderAction}
            className="grid gap-5"
          >
            <input name="issuance_id" type="hidden" value={issuanceId} />
            <RepairPoDetailsForm
              key={`${issuanceId}:${units.map((unit) => unit.assetCode).join(",")}`}
              departments={data.departments}
              suppliers={data.suppliers}
              units={units}
            />

            <FormGrid className="max-w-2xl xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="repair-order-date">PO Date</FieldLabel>
                <Input
                  defaultValue={istDateValue()}
                  id="repair-order-date"
                  name="order_date"
                  type="date"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="repair-remark">
                  Remark (optional)
                </FieldLabel>
                <Input id="repair-remark" name="remark" />
              </Field>
            </FormGrid>

            <div className="flex flex-wrap gap-3">
              <Button type="submit">Create Repair POs</Button>
              <Button asChild variant="outline">
                <Link href={backHref}>Change Unit IDs</Link>
              </Button>
            </div>
          </form>
        </FormSection>
      )}
    </div>
  )
}
