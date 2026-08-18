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
import Link from "next/link"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { importMastersWorkbookAction } from "./actions"
import { MasterMaintenanceForm } from "./master-maintenance-form"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { CommercialMasterTable } from "./commercial-master-table"

export const dynamic = "force-dynamic"

type Editable = Awaited<
  ReturnType<
    ReturnType<typeof createCommercialMasterRepository>["listEditable"]
  >
>

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    masterView?: string
    success?: string
  }>
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
  const showDataEntry = feedback.masterView !== "masterTables"
  const showMasterTables = feedback.masterView !== "dataEntry"

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

      {showDataEntry ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Master Workbook</CardTitle>
              <CardDescription>
                Source-Compatible Xls/Xlsx Sheets, Aliases, Defaults, And Atomic
                Import.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <CompanyWideMasterScope />
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
                  <input name="master_view" type="hidden" value="dataEntry" />
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
        </>
      ) : null}

      {showMasterTables ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Commercial Master Tables</CardTitle>
                <CardDescription>
                  Edit names or safely replace and delete duplicate masters.
                </CardDescription>
              </div>
              <Badge variant="outline">{editable.allMasters.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CommercialMasterTable
              canWrite={canWrite}
              rows={editable.allMasters}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
