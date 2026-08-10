import {
  createCommercialMasterRepository,
  createCustomerRepository,
  type CommercialMasterSnapshot,
} from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
import Link from "next/link"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { importMastersWorkbookAction, setMasterActiveAction } from "./actions"
import { MasterMaintenanceForm } from "./master-maintenance-form"

export const dynamic = "force-dynamic"

type Editable = Awaited<
  ReturnType<
    ReturnType<typeof createCommercialMasterRepository>["listEditable"]
  >
>

function groups(snapshot: CommercialMasterSnapshot) {
  return [
    ["Material grades", snapshot.materialGrades.map((row) => row.name)],
    ["Rod types", snapshot.rodTypes.map((row) => row.name)],
    ["Machine types", snapshot.machineTypes.map((row) => row.name)],
    ["Categories", snapshot.categories.map((row) => row.name)],
    [
      "Subcategories",
      snapshot.subcategories.map((row) => `${row.category} / ${row.name}`),
    ],
    ["Processes", snapshot.processes.map((row) => row.name)],
    ["Applications", snapshot.applications.map((row) => row.name)],
    ["Certifications", snapshot.certifications.map((row) => row.name)],
    [
      "Website fields",
      snapshot.websiteFields.map((row) => `${row.fieldType}: ${row.name}`),
    ],
    [
      "Material rates",
      snapshot.materialRates.map((row) => `${row.grade} / ${row.rodType}`),
    ],
    ["Shipping", snapshot.shippingTerms.map((row) => row.name)],
    ["Packaging", snapshot.packagingOptions.map((row) => row.name)],
    [
      "Commercial terms",
      snapshot.commercialTerms.map((row) => `${row.termType}: ${row.name}`),
    ],
    ["Quote PDF terms", snapshot.quoteTerms.map((row) => row.label)],
  ] as const
}

function activationOptions(editable: Editable) {
  return [
    ...editable.materialRates.map((row) => ({
      ...row,
      kind: "materialRate",
    })),
    ...editable.shippingTerms.map((row) => ({
      ...row,
      kind: "shippingTerm",
    })),
    ...editable.packagingOptions.map((row) => ({
      ...row,
      kind: "packagingOption",
    })),
    ...editable.commercialTerms.map((row) => ({
      ...row,
      kind: "commercialTerm",
    })),
    ...editable.quoteTerms.map((row) => ({
      ...row,
      kind: "quoteTerm",
    })),
  ]
}

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const session = await requireCapability(
    "pricing.masters.read",
    "/commercial/masters"
  )
  const canWrite = (
    await listGrantedCapabilities(session.user.id, ["pricing.masters.write"])
  ).includes("pricing.masters.write")
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialMasterRepository({ connectionString })
  let snapshot: CommercialMasterSnapshot
  let editable: Editable
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    snapshot = await repository.snapshot(organizationId)
    editable = await repository.listEditable(organizationId)
  } finally {
    await repository.close()
    await customers.close()
  }
  const feedback = await searchParams
  const activeOptions = activationOptions(editable)

  return (
    <div className="flex flex-col gap-6">
      {feedback.error ? (
        <Alert variant="destructive">
          <AlertDescription>{feedback.error}</AlertDescription>
        </Alert>
      ) : null}
      {feedback.success ? (
        <Alert>
          <AlertDescription>{feedback.success}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Master Workbook</CardTitle>
          <CardDescription>
            Source-Compatible Xls/Xlsx Sheets, Aliases, Defaults, And Atomic
            Import.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/commercial/masters/template.xlsx">
                Download Template
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/commercial/masters/export.xlsx">
                Export Current Masters
              </Link>
            </Button>
          </div>
          {canWrite ? (
            <form action={importMastersWorkbookAction}>
              <FieldGroup className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Field className="max-w-xl">
                  <FieldLabel htmlFor="masters-file">
                    Masters Workbook
                  </FieldLabel>
                  <Input
                    accept=".xlsx,.xls"
                    id="masters-file"
                    name="masters_file"
                    required
                    type="file"
                  />
                </Field>
                <Button type="submit">Import Atomically</Button>
              </FieldGroup>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Add Or Update A Master</CardTitle>
            <CardDescription>
              Natural Source Keys Make Repeated Submissions Idempotent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MasterMaintenanceForm snapshot={snapshot} />
          </CardContent>
        </Card>
      ) : null}

      {canWrite && activeOptions.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Activation</CardTitle>
            <CardDescription>
              Activate Or Retire Costing And Term Options Without Deleting
              History.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setMasterActiveAction}>
              <FieldGroup className="grid gap-4 md:grid-cols-[2fr_1fr_auto]">
                <Field>
                  <FieldLabel htmlFor="activation-target">Master</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="activation-target"
                    name="target"
                  >
                    {activeOptions.map((row) => (
                      <NativeSelectOption
                        key={`${row.kind}:${row.id}`}
                        value={`${row.kind}:${row.id}`}
                      >
                        {row.label} ({row.active ? "active" : "inactive"})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="activation-state">State</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="activation-state"
                    name="state"
                  >
                    <NativeSelectOption value="active">
                      Active
                    </NativeSelectOption>
                    <NativeSelectOption value="inactive">
                      Inactive
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Button className="md:self-end" type="submit">
                  Update State
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups(snapshot).map(([label, values]) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{label}</CardTitle>
                <Badge variant="outline">{values.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {values.length ? (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {values.map((value, index) => (
                    <li
                      className="rounded-xl border px-3 py-2"
                      key={`${value}:${index}`}
                    >
                      {value}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Values Loaded.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
