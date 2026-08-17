import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { formatIstDateTime } from "@/lib/date-time"
import { storePurchaseOrderHref } from "@/lib/unified-navigation"

import { issueStoreRequisitionAction } from "../actions"

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default async function StoreRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    department?: string | string[]
    item?: string | string[]
  }>
}) {
  const session = await requireCapability("store.read", "/store/requests")
  const canManage = (
    await listGrantedCapabilities(session.user.id, ["store.manage"])
  ).includes("store.manage")
  const params = await searchParams
  const departmentFilter = firstValue(params.department)
  const itemFilter = firstValue(params.item)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const allRequests = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return (await repository.listRequisitions({ organizationId })).rows
  })().finally(() => repository.close())
  const departments = Array.from(
    new Set(allRequests.map((request) => request.department))
  ).sort((left, right) => left.localeCompare(right))
  const items = Array.from(
    new Map(
      allRequests.map((request) => [
        request.itemTypeId,
        {
          id: request.itemTypeId,
          label: `${request.typeCode} — ${request.identificationName}`,
        },
      ])
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label))
  const requests = allRequests.filter(
    (request) =>
      (!departmentFilter || request.department === departmentFilter) &&
      (!itemFilter || request.itemTypeId === itemFilter)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Requests & Issues
        </h2>
        <p className="text-sm text-muted-foreground">
          Allocate coded item request lines. Saving a line immediately updates
          Current Stock.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Allocation Queue</CardTitle>
          <CardDescription>
            Filter by Department or item, then allocate each line independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 overflow-x-auto">
          <form className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1fr)_auto_auto]">
            <NativeSelect
              aria-label="Filter by Department"
              defaultValue={departmentFilter}
              name="department"
            >
              <NativeSelectOption value="">All Departments</NativeSelectOption>
              {departments.map((department) => (
                <NativeSelectOption key={department} value={department}>
                  {department}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by item"
              defaultValue={itemFilter}
              name="item"
            >
              <NativeSelectOption value="">All Items</NativeSelectOption>
              {items.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit">Apply Filters</Button>
            <Button asChild variant="outline">
              <Link href="/store/requests">Clear</Link>
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request No.</TableHead>
                <TableHead>Department / Individual</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead>Allocate Line</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const isOpen = ["Pending", "Partially Issued"].includes(
                  request.status
                )
                return (
                  <TableRow key={request.id}>
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
                      {request.typeCode}
                      <span className="block text-xs text-muted-foreground">
                        {request.identificationName}
                      </span>
                    </TableCell>
                    <TableCell>
                      {request.requestedQuantity} {request.unit}
                    </TableCell>
                    <TableCell>{request.issuedQuantity}</TableCell>
                    <TableCell>{request.remainingQuantity}</TableCell>
                    <TableCell className="font-semibold">
                      {request.availableStock} {request.unit}
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
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {isOpen ? (
                          <div className="grid min-w-72 gap-3">
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
                            <form
                              action={issueStoreRequisitionAction}
                              className="grid grid-cols-2 gap-2"
                            >
                              <input
                                name="requisition_id"
                                type="hidden"
                                value={request.id}
                              />
                              <Input
                                aria-label={`Allocate quantity for ${request.requestNumber} ${request.typeCode}`}
                                defaultValue={
                                  request.assetCodeRequired
                                    ? "1"
                                    : request.remainingQuantity
                                }
                                max={request.remainingQuantity}
                                min="0.001"
                                name="issue_quantity"
                                step="0.001"
                                type="number"
                              />
                              <NativeSelect
                                aria-label="Assign to"
                                name="holder_type"
                              >
                                <NativeSelectOption value="DEPARTMENT">
                                  Department
                                </NativeSelectOption>
                                <NativeSelectOption value="PERSON">
                                  Individual
                                </NativeSelectOption>
                              </NativeSelect>
                              <Input
                                defaultValue={request.department}
                                name="holder_name"
                                placeholder="Department or individual"
                              />
                              <Input name="issued_by" placeholder="Issued by" />
                              {request.assetCodeRequired ? (
                                <Input
                                  className="col-span-2"
                                  name="asset_code"
                                  placeholder="Specific Asset Code"
                                  required
                                />
                              ) : null}
                              <Button
                                className="col-span-2"
                                size="sm"
                                type="submit"
                              >
                                Save Allocation
                              </Button>
                            </form>
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
                    colSpan={canManage ? 9 : 8}
                  >
                    No coded item request lines match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
