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
import { formatIstDateTime } from "@/lib/date-time"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import {
  createStoreRequisitionAction,
  issueStoreRequisitionAction,
  requestMissingStoreCodeAction,
  resolveMissingStoreCodeAction,
} from "../actions"

export default async function StoreRequestsPage() {
  const session = await requireCapability("store.read", "/store/requests")
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "store.manage",
      "store.requests.write",
    ])
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, locations, requisitions, codeRequests, masters] =
      await Promise.all([
        repository.listItemTypes(organizationId),
        repository.listLocations(organizationId),
        repository.listRequisitions({ organizationId }),
        repository.listCodeRequests(organizationId),
        repository.listAssetClassificationMasters(organizationId),
      ])
    return {
      codeRequests,
      items,
      locations,
      masters,
      requisitions: requisitions.rows,
    }
  })().finally(() => repository.close())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Requests & Issues
        </h2>
        <p className="text-sm text-muted-foreground">
          Every department request receives a permanent automatic Request
          Number.
        </p>
      </div>

      {capabilities.has("store.requests.write") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>New Store Request</CardTitle>
              <CardDescription>
                Search the available item codes first. The request number is
                generated on submission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createStoreRequisitionAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Item Code"
                    name="item_type_id"
                    options={data.items.map((item) => ({
                      label: `${item.typeCode} — ${item.identificationName}`,
                      value: item.id,
                    }))}
                  />
                  <SelectField
                    label="Requested From Store"
                    name="location_id"
                    options={data.locations
                      .filter((row) => row.locationType === "STORE")
                      .map((row) => ({
                        label: `${row.code} — ${row.name}`,
                        value: row.id,
                      }))}
                  />
                  <TextField label="Department" name="department" required />
                  <TextField
                    label="Requested By"
                    name="requested_by"
                    required
                  />
                  <TextField
                    label="Quantity"
                    name="quantity"
                    required
                    step="0.001"
                    type="number"
                  />
                  <TextField
                    label="Required On"
                    name="required_on"
                    type="date"
                  />
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="request-purpose">Purpose</FieldLabel>
                    <Textarea id="request-purpose" name="purpose" />
                  </Field>
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={!data.items.length || !data.locations.length}
                  type="submit"
                >
                  Submit Request
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request Missing Code</CardTitle>
              <CardDescription>
                Store checks for an existing combination before creating a new
                Type Code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={requestMissingStoreCodeAction}>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <TextField label="Asset Type" name="asset_type" required />
                  <SelectField
                    label="Category"
                    name="asset_category_id"
                    options={data.masters.categories.map((row) => ({
                      label: row.name,
                      value: row.id,
                    }))}
                  />
                  <SelectField
                    label="Subcategory"
                    name="asset_subcategory_id"
                    options={data.masters.subcategories.map((row) => ({
                      label: `${row.categoryName} — ${row.name}`,
                      value: row.id,
                    }))}
                  />
                  <SelectField
                    label="Asset Name"
                    name="asset_name_id"
                    options={data.masters.assetNames.map((row) => ({
                      label: `${row.categoryName} — ${row.subcategoryName} — ${row.name}`,
                      value: row.id,
                    }))}
                  />
                  <TextField
                    label="Identification Name"
                    name="identification_name"
                    required
                  />
                  <TextField label="Department" name="department" required />
                  <TextField
                    label="Requested By"
                    name="requested_by"
                    required
                  />
                  <TextField label="Reason / Use" name="reason" />
                </FieldGroup>
                <Button
                  className="mt-5"
                  disabled={
                    !data.masters.categories.length ||
                    !data.masters.subcategories.length ||
                    !data.masters.assetNames.length
                  }
                  type="submit"
                >
                  Send To Store
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Department Request Register</CardTitle>
          <CardDescription>
            Current Stock is live—not a saved snapshot. Completing one issue
            updates every other request row.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request No.</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Status</TableHead>
                {capabilities.has("store.manage") ? (
                  <TableHead>Issue</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requisitions.map((request) => (
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
                        request.status === "Fulfilled" ? "secondary" : "outline"
                      }
                    >
                      {request.status}
                    </Badge>
                  </TableCell>
                  {capabilities.has("store.manage") ? (
                    <TableCell>
                      {["Pending", "Partially Issued"].includes(
                        request.status
                      ) ? (
                        <form
                          action={issueStoreRequisitionAction}
                          className="grid min-w-72 grid-cols-2 gap-2"
                        >
                          <input
                            name="requisition_id"
                            type="hidden"
                            value={request.id}
                          />
                          <Input
                            aria-label={`Issue quantity for ${request.requestNumber}`}
                            defaultValue={
                              request.trackingMode === "SERIALIZED"
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
                            aria-label={`Assign ${request.requestNumber} to`}
                            name="holder_type"
                          >
                            <NativeSelectOption value="DEPARTMENT">
                              Department
                            </NativeSelectOption>
                            <NativeSelectOption value="MACHINE">
                              Machine
                            </NativeSelectOption>
                            <NativeSelectOption value="UNIT">
                              Unit
                            </NativeSelectOption>
                            <NativeSelectOption value="PERSON">
                              Person
                            </NativeSelectOption>
                          </NativeSelect>
                          <Input
                            aria-label="Holder reference"
                            name="holder_reference"
                            placeholder="Machine no. / ID"
                          />
                          <Input
                            aria-label="Holder name"
                            name="holder_name"
                            placeholder="Machine / person name"
                          />
                          {request.assetCodeRequired ? (
                            <Input
                              className="col-span-2"
                              name="asset_code"
                              placeholder="Specific Asset Code"
                              required
                            />
                          ) : null}
                          <Input name="issued_by" placeholder="Issued by" />
                          <Button size="sm" type="submit">
                            Issue
                          </Button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!data.requisitions.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={capabilities.has("store.manage") ? 9 : 8}
                  >
                    No department requests yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Missing Code Requests</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Status</TableHead>
                {capabilities.has("store.manage") ? (
                  <TableHead>Resolve</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.codeRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {request.requestNumber}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatIstDateTime(request.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>{request.assetName}</TableCell>
                  <TableCell>{request.identificationName}</TableCell>
                  <TableCell>{request.department}</TableCell>
                  <TableCell>{request.requestedBy}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{request.status}</Badge>
                  </TableCell>
                  {capabilities.has("store.manage") ? (
                    <TableCell>
                      {request.status === "Pending" ? (
                        <form
                          action={resolveMissingStoreCodeAction}
                          className="grid min-w-64 gap-2"
                        >
                          <input
                            name="code_request_id"
                            type="hidden"
                            value={request.id}
                          />
                          <NativeSelect
                            aria-label={`Resolved code for ${request.requestNumber}`}
                            name="item_type_id"
                            required
                          >
                            {data.items.map((item) => (
                              <NativeSelectOption key={item.id} value={item.id}>
                                {item.typeCode} — {item.identificationName}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            aria-label="Resolution"
                            name="resolution"
                          >
                            <NativeSelectOption value="Existing Code Found">
                              Existing Code Found
                            </NativeSelectOption>
                            <NativeSelectOption value="Code Created">
                              Code Created
                            </NativeSelectOption>
                          </NativeSelect>
                          <Button
                            disabled={!data.items.length}
                            size="sm"
                            type="submit"
                          >
                            Resolve
                          </Button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!data.codeRequests.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={capabilities.has("store.manage") ? 7 : 6}
                  >
                    No missing code requests.
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

function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `request-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
    </Field>
  )
}
function SelectField({
  label,
  name,
  options,
}: {
  label: string
  name: string
  options: { label: string; value: string }[]
}) {
  const id = `request-${name}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required>
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
