import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
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
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { storeRequestFormPolicy } from "@/lib/store-request-policy"

import { createStoreRequisitionBatchAction } from "../../actions"

export default async function NewStoreRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ itemTypeId?: string | string[] }>
}) {
  const session = await requireStoreAction(
    "store.requests.submit",
    "/store/requests/new"
  )
  const rawIds = (await searchParams).itemTypeId
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
    const [items, physicalUnits, requestContext] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listStockPhysicalUnits(organizationId),
      repository.requisitionRequestContext({
        organizationId,
        userId: session.user.id,
      }),
    ])
    const itemById = new Map(items.map((item) => [item.id, item]))
    return {
      items: selectedIds.flatMap((id) => {
        const item = itemById.get(id)
        return item ? [item] : []
      }),
      physicalUnits,
      requestContext,
    }
  })().finally(() => repository.close())
  const requestPolicy = storeRequestFormPolicy(data.requestContext)

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

      {!data.items.length ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>No items selected</CardTitle>
            <CardDescription>
              Search Current Stock and tick one or more coded items first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/store/stock">Go to Current Stock</Link>
            </Button>
          </CardContent>
 </SectionCard>
      ) : (
 <SectionCard>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
            <CardDescription>
              Request an Asset Code and let Store choose a unit, or name one
              exact Unit ID. An exact Unit ID request has quantity one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createStoreRequisitionBatchAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <StoreRequestIdentityFields policy={requestPolicy} />
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
                                    unit.status !== "SCRAPPED"
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
                <Button disabled={requestPolicy.submitDisabled} type="submit">
                  Release Request to Store
                </Button>
                <Button asChild variant="outline">
                  <Link href="/store/stock">Back to Stock</Link>
                </Button>
              </div>
            </form>
          </CardContent>
 </SectionCard>
      )}
    </div>
  )
}
