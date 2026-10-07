import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
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
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { StoreRequestIdentityFields } from "@/components/store/store-request-identity-fields"
import { StoreRequestPurposeFields } from "@/components/store/store-request-purpose-fields"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { storeRequestFormPolicy } from "@/lib/store-request-policy"

import { createStoreRequisitionBatchAction } from "../../actions"

export default async function NewStoreRequestPage({
  searchParams,
}: {
  searchParams: Promise<{
    fulfillmentKind?: string
    itemTypeId?: string | string[]
    saved?: string
    storeCode?: string
  }>
}) {
  const session = await requireStoreAction(
    "store.requests.submit",
    "/store/requests/new"
  )
  const params = await searchParams
  const rawIds = params.itemTypeId
  const selectedIds = Array.from(
    new Set(
      (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []).filter(Boolean)
    )
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, physicalUnits, requestContext, stores, myRequests] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listStockPhysicalUnits(organizationId, "COMPANY"),
      repository.requisitionRequestContext({
        organizationId,
        userId: session.user.id,
      }),
      repository.listRequestableStores(organizationId),
      repository.listRequisitions({ organizationId, requesterUserId: session.user.id }),
    ])
    const itemById = new Map(items.map((item) => [item.id, item]))
    return {
      allItems: items,
      items: selectedIds.flatMap((id) => {
        const item = itemById.get(id)
        return item ? [item] : []
      }),
      physicalUnits,
      requestContext,
      stores,
      myRequests: myRequests.rows.slice(0, 30),
    }
  })().finally(() => repository.close())
  const requestPolicy = storeRequestFormPolicy(data.requestContext)
  const requestedCapabilities = [
    ...data.stores.map((store) => accountableStorePermission(store.code, "request")),
  ]
  const granted = new Set(await listGrantedCapabilities(session.user.id, requestedCapabilities))
  const requestableStores = data.stores.filter((store) =>
    granted.has(accountableStorePermission(store.code, "request"))
  )
  const initialStoreCode = requestableStores.some((store) => store.code === params.storeCode)
    ? params.storeCode! : ""
  const initialKind = params.fulfillmentKind === "STORE_TRANSFER" && requestableStores.length
    ? "STORE_TRANSFER" as const
    : !requestPolicy.departmentOptions.length && requestableStores.length
      ? "STORE_TRANSFER" as const
      : params.fulfillmentKind === "PERSON_USE"
      ? "PERSON_USE" as const : "DEPARTMENT_USE" as const

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          New Store Request
        </h2>
        <p className="text-sm text-muted-foreground">
          One automatic Request Number will contain all selected coded items.
        </p>
      </div>

      {params.saved ? (
        <SectionCard role="status">
          <CardContent className="py-4 text-sm">
            Request {params.saved} was sent to Main Store.
          </CardContent>
        </SectionCard>
      ) : null}

      {!data.items.length ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Choose an Asset Code</CardTitle>
            <CardDescription>
              Select an item to request from Main Store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex max-w-lg flex-wrap gap-3" method="get">
              <input name="fulfillmentKind" type="hidden" value={initialKind} />
              <input name="storeCode" type="hidden" value={initialStoreCode} />
              <NativeSelect aria-label="Asset Code" name="itemTypeId" required>
                <NativeSelectOption value="">Select Asset Code</NativeSelectOption>
                {data.allItems.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.typeCode} — {item.assetName} · {item.makeModel}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="submit">Continue</Button>
            </form>
          </CardContent>
 </SectionCard>
      ) : (
 <SectionCard>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
            <CardDescription>
              A responsibility request names one exact Unit ID, or a consumable
              Asset Code and quantity. For use, Main Store can choose a Unit ID.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createStoreRequisitionBatchAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <StoreRequestIdentityFields
                  allowStoreRequest={requestableStores.length > 0}
                  policy={requestPolicy}
                />
                <StoreRequestPurposeFields
                  canUse={requestPolicy.departmentOptions.length > 0}
                  initialKind={initialKind}
                  initialStoreCode={initialStoreCode}
                  stores={requestableStores}
                />
                <Field>
                  <FieldLabel htmlFor="request-location">
                    Requested From Store
                  </FieldLabel>
                  <Input
                    id="request-location"
                    readOnly
                    value={requestPolicy.storeLabel}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="request-required-on">
                    Required On
                  </FieldLabel>
                  <Input
                    id="request-required-on"
                    name="required_on"
                    type="date"
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="request-purpose">Purpose</FieldLabel>
                  <Textarea id="request-purpose" name="purpose" />
                </Field>
              </FieldGroup>

              <div className="mt-6 rounded-md border min-w-0">
 <OperationalTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Identification</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead className="min-w-52">Requested Unit ID</TableHead>
                      <TableHead className="w-48">Requested Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.typeCode}
                          <input
                            name="item_type_id"
                            type="hidden"
                            value={item.id}
                          />
                        </TableCell>
                        <TableCell>{item.identificationName}</TableCell>
                        <TableCell>
                          {item.availableStock} {item.unit}
                        </TableCell>
                        <TableCell>
                          {item.trackingMode === "SERIALIZED" ? (
                            <NativeSelect
                              aria-label={`Requested Unit ID for ${item.typeCode}`}
                              defaultValue=""
                              name="requested_unit_id"
                            >
                              <NativeSelectOption value="">
                                Any Unit ID / Store selects
                              </NativeSelectOption>
                              {data.physicalUnits
                                .filter(
                                  (unit) =>
                                    unit.itemTypeId === item.id &&
                                    unit.isMainAccountable && unit.status !== "SCRAPPED" && unit.status !== "LOST"
                                )
                                .map((unit) => (
                                  <NativeSelectOption key={unit.id} value={unit.id}>
                                    {unit.assetCode} · {unit.status}
                                  </NativeSelectOption>
                                ))}
                            </NativeSelect>
                          ) : (
                            <>
                              Not applicable
                              <input
                                name="requested_unit_id"
                                type="hidden"
                                value=""
                              />
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`Requested quantity for ${item.typeCode}`}
                            min={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
                            name="quantity"
                            required
                            step={item.trackingMode === "SERIALIZED" ? "1" : "0.001"}
                            type="number"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
 </OperationalTable>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={requestPolicy.submitDisabled && !requestableStores.length} type="submit">
                  Release Request to Store
                </Button>
                <Button asChild variant="outline">
                  <Link href="/store/requests/new">Choose another item</Link>
                </Button>
              </div>
            </form>
          </CardContent>
 </SectionCard>
      )}

      <SectionCard>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>Requests submitted from your account.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="store-my-requests">
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Asset Code / Unit ID</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Fulfilled</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.myRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{request.requestNumber}</TableCell>
                  <TableCell>{request.requestedUnitCode ?? request.typeCode}</TableCell>
                  <TableCell>
                    {request.fulfillmentKind === "STORE_TRANSFER"
                      ? request.receivingStoreName
                      : request.fulfillmentKind === "PERSON_USE"
                        ? request.recipientName : request.department}
                  </TableCell>
                  <TableCell>{request.requestedQuantity} {request.unit}</TableCell>
                  <TableCell>{request.issuedQuantity} {request.unit}</TableCell>
                  <TableCell><StatusBadge value={request.status} /></TableCell>
                </TableRow>
              ))}
              {!data.myRequests.length ? (
                <TableRow>
                  <TableCell colSpan={6}>No requests submitted yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </div>
  )
}
