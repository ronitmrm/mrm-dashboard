import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
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
import { requireCapability } from "@/lib/auth/require-capability"

import { createStoreRequisitionBatchAction } from "../../actions"

export default async function NewStoreRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ itemTypeId?: string | string[] }>
}) {
  await requireCapability("store.requests.write", "/store/requests/new")
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
    const [items, locations] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listLocations(organizationId),
    ])
    const itemById = new Map(items.map((item) => [item.id, item]))
    return {
      items: selectedIds.flatMap((id) => {
        const item = itemById.get(id)
        return item ? [item] : []
      }),
      locations: locations.filter(
        (location) => location.locationType === "STORE"
      ),
    }
  })().finally(() => repository.close())

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
        <Card>
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
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
            <CardDescription>
              Enter the quantity for each line, then release the grouped request
              to Store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createStoreRequisitionBatchAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="request-department">
                    Department
                  </FieldLabel>
                  <Input id="request-department" name="department" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="request-requested-by">
                    Requested By / Individual
                  </FieldLabel>
                  <Input
                    id="request-requested-by"
                    name="requested_by"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="request-location">
                    Requested From Store
                  </FieldLabel>
                  <NativeSelect
                    id="request-location"
                    name="location_id"
                    required
                  >
                    {data.locations.map((location) => (
                      <NativeSelectOption key={location.id} value={location.id}>
                        {location.code} — {location.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
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

              <div className="mt-6 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Identification</TableHead>
                      <TableHead>Current Stock</TableHead>
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
                          <Input
                            aria-label={`Requested quantity for ${item.typeCode}`}
                            min="0.001"
                            name="quantity"
                            required
                            step="0.001"
                            type="number"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={!data.locations.length} type="submit">
                  Release Request to Store
                </Button>
                <Button asChild variant="outline">
                  <Link href="/store/stock">Back to Stock</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
