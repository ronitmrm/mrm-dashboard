import {
  createCommercialMasterRepository,
  createCustomerRepository,
  type CommercialMasterSnapshot,
  type EditableCommercialMasterKind,
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
import Link from "next/link"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { importMastersWorkbookAction } from "./actions"
import { MasterMaintenanceForm } from "./master-maintenance-form"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import {
  commercialMasterSelection,
  commercialMasterTemplateHref,
  commercialMasterViewHref,
  commercialMasterWorkspaceKind,
} from "@/lib/commercial-master-workspace"
import { CommercialMasterTable } from "./commercial-master-table"

export const dynamic = "force-dynamic"

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    kind?: string
    masterMain?: string
    masterSub?: string
    masterUnit?: string
    masterView?: string
    success?: string
  }>
}) {
  const session = await requireCapability(
    "pricing.masters.read",
    "/commercial/masters"
  )
  const [grantedCapabilities, feedback] = await Promise.all([
    listGrantedCapabilities(session.user.id, [
      commercialTaskCapabilities.deleteMaster,
      commercialTaskCapabilities.importMasters,
      commercialTaskCapabilities.renameMaster,
      commercialTaskCapabilities.updateMaster,
    ]),
    searchParams,
  ])
  const canWrite = grantedCapabilities.length > 0
  const activeView =
    feedback.masterView === "masterTables" ? "masterTables" : "dataEntry"
  const selection = commercialMasterSelection(feedback.kind)
  const selectionKind = commercialMasterWorkspaceKind(selection)
  const selectionLocked = Boolean(
    feedback.masterUnit && feedback.masterMain && feedback.masterSub
  )
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  let snapshot: CommercialMasterSnapshot | null = null
  let editableRows: Array<{
    id: string
    kind: EditableCommercialMasterKind
    label: string
  }> = []

  if ((showDataEntry && canWrite) || showMasterTables) {
    const connectionString = readAuthEnvironment().connectionString
    const customers = createCustomerRepository({ connectionString })
    const repository = createCommercialMasterRepository({ connectionString })
    try {
      const organizationId = await customers.organizationIdForCode("MRMPL")
      if (showDataEntry && canWrite) {
        snapshot = await repository.snapshot(organizationId)
      } else {
        editableRows = await repository.listEditableRows({
          kind: selection.tableKind,
          organizationId,
          termType: "termType" in selection ? selection.termType : undefined,
        })
      }
    } finally {
      await repository.close()
      await customers.close()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MasterDataViewTabs
        activeView={activeView}
        dataEntryHref={commercialMasterViewHref("dataEntry", selectionKind)}
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            href={commercialMasterTemplateHref(selectionKind)}
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton
              action={importMastersWorkbookAction}
              fields={{
                master_view: "dataEntry",
                workspace_kind: selectionKind,
              }}
              fileField="masters_file"
            />
          ) : null
        }
        exportAction={
          <Button asChild size="sm" variant="outline">
            <Link href="/commercial/masters/export.xlsx">Export</Link>
          </Button>
        }
        masterTablesHref={commercialMasterViewHref(
          "masterTables",
          selectionKind
        )}
      />
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
                Source-Compatible CSV/Xls/Xlsx, Aliases, Defaults, And Atomic
                Import.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <CompanyWideMasterScope />
            </CardContent>
          </Card>

          {canWrite && snapshot ? (
            <Card>
              <CardHeader>
                <CardTitle>Add Or Update A Master</CardTitle>
                <CardDescription>
                  Natural Source Keys Make Repeated Submissions Idempotent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MasterMaintenanceForm
                  initialKind={selection.entryKind}
                  initialTermType={
                    "termType" in selection ? selection.termType : undefined
                  }
                  key={selectionKind}
                  snapshot={snapshot}
                  selectionLocked={selectionLocked}
                />
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
              <Badge variant="outline">{editableRows.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CommercialMasterTable
              canWrite={canWrite}
              initialKind={selectionKind}
              key={selectionKind}
              rows={editableRows}
              selectionLocked={true}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
