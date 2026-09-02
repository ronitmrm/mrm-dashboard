import { createStoreRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
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

import { StoreRequestIdentityFields } from "@/components/store/store-request-identity-fields"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"
import { formatIstDateTime } from "@/lib/date-time"
import { storeRequestFormPolicy } from "@/lib/store-request-policy"

import {
  requestMissingStoreCodeAction,
  resolveMissingStoreCodeAction,
} from "../actions"

export default async function NewItemRequestsPage() {
  const session = await requireCapability(
    "store.new_item_requests.read",
    "/store/new-item-requests"
  )
  const actions = await listGrantedStoreActions(session.user.id)
  const canResolveRequests = actions.has("store.new_item_requests.resolve")
  const canSubmitRequests = actions.has("store.new_item_requests.submit")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [items, requests, masters, requestContext] = await Promise.all([
      repository.listItemTypes(organizationId),
      repository.listCodeRequests(organizationId),
      repository.listAssetClassificationMasters(organizationId),
      repository.requisitionRequestContext({
        organizationId,
        userId: session.user.id,
      }),
    ])
    return { items, masters, requestContext, requests }
  })().finally(() => repository.close())
  const requestPolicy = storeRequestFormPolicy(data.requestContext)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          New Item Requests
        </h2>
        <p className="text-sm text-muted-foreground">
          Use this only when the required item cannot be found in Current Stock
          and has no Asset Code.
        </p>
      </div>

      <MetricSummary
        scope="New item request register · before table filters"
        items={[
          {
            label: "Requests",
            value: data.requests.length,
            tone: "information"
          },
          {
            label: "Pending",
            value: data.requests.filter((row) => row.status === "Pending")
              .length,
            tone: "warning"
          }
        ]}
      />

      {canSubmitRequests ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Request a New Item</CardTitle>
            <CardDescription>
              This stays separate from coded Store Requests until Store finds or
              creates an Asset Code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestMissingStoreCodeAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SelectField
                  label="Asset Type"
                  name="asset_type"
                  options={[
                    { label: "Non Consumable", value: "NON_CONSUMABLE" },
                    { label: "Consumable", value: "CONSUMABLE" },
                  ]}
                />
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
                <StoreRequestIdentityFields policy={requestPolicy} />
                <TextField label="Reason / Use" name="reason" />
              </FieldGroup>
              <Button
                className="mt-5"
                disabled={
                  !data.masters.categories.length ||
                  !data.masters.subcategories.length ||
                  !data.masters.assetNames.length ||
                  requestPolicy.submitDisabled
                }
                type="submit"
              >
                Send New Item Request
              </Button>
            </form>
          </CardContent>
 </SectionCard>
      ) : null}

 <SectionCard>
        <CardHeader>
          <CardTitle>New Item Request Register</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
 <OperationalTable>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Status</TableHead>
                {canResolveRequests ? <TableHead>Resolve</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requests.map((request) => (
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
                  {canResolveRequests ? (
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
              {!data.requests.length ? (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={canResolveRequests ? 7 : 6}
                  >
                    No New Item Requests.
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

function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `new-item-${name}`
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
  const id = `new-item-${name}`
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
