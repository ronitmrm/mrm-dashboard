import {
  createCommercialMasterRepository,
  createCustomerRepository,
  type CommercialMasterSnapshot,
  type EditableCommercialMasterKind,
} from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { masterCapability, masterPermissionOptions } from "@/lib/auth/master-capabilities"
import { commercialMasterFormOptions } from "@/lib/auth/commercial-master-access"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"

import { importMastersWorkbookAction } from "./actions"
import { MasterMaintenanceForm } from "./master-maintenance-form"
import { DataDownloadButton } from "@/components/data-download-button"
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
import { MetricSummary } from "@/components/ui/golden-patterns"

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
  const feedback = await searchParams
  const selection = commercialMasterSelection(feedback.kind)
  const selectionKind = commercialMasterWorkspaceKind(selection)
  const session = await requireCapability(
    masterCapability(selectionKind, "read"),
    "/commercial/masters"
  )
  const grantedCapabilityList = await listGrantedCapabilities(session.user.id, masterPermissionOptions.map(({ key }) => key))
  const grantedCapabilities = new Set(grantedCapabilityList)
  const canUpdate = grantedCapabilities.has(masterCapability(selectionKind, "save"))
  const canImport = grantedCapabilities.has(masterCapability(selectionKind, "import"))
  const activeView =
    feedback.masterView === "masterTables" || (!canUpdate && !canImport) ? "masterTables" : "dataEntry"
  const canDelete = grantedCapabilities.has(masterCapability(selectionKind, "delete"))
  const canRename = selectionKind !== "materialRate" && grantedCapabilities.has(masterCapability(selectionKind, "rename"))
  const selectionLocked = true
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  let snapshot: CommercialMasterSnapshot | null = null
  let editableRows: Array<{
    id: string
    kind: EditableCommercialMasterKind
    label: string
  }> = []

  if ((showDataEntry && canUpdate) || showMasterTables) {
    const connectionString = readAuthEnvironment().connectionString
    const customers = createCustomerRepository({ connectionString })
    const repository = createCommercialMasterRepository({ connectionString })
    try {
      const organizationId = await customers.organizationIdForCode("MRMPL")
      if (showDataEntry && canUpdate) {
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
          canImport ? (
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
          <DataDownloadButton href="/commercial/masters/export.xlsx" />
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
          {canUpdate && snapshot ? (
 <SectionCard>
              <CardHeader>
                <CardTitle>Add A Master</CardTitle>
                <CardDescription>
                  Add a new entry. To change an existing entry, use Master Table.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MasterMaintenanceForm
                  initialKind={selection.entryKind}
                  initialTermType={
                    "termType" in selection ? selection.termType : undefined
                  }
                  key={selectionKind}
                  options={commercialMasterFormOptions(snapshot, selection.entryKind)}
                  selectionLocked={selectionLocked}
                />
              </CardContent>
 </SectionCard>
          ) : null}
        </>
      ) : null}

      {showMasterTables ? (
        <>
          <MetricSummary
            scope="Selected commercial master · before table filters"
            items={[
              {
                label: "Master Records",
                value: editableRows.length,
                tone: "information"
              }
            ]}
          />
 <SectionCard>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Commercial Master Tables</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CommercialMasterTable
              canWrite={canDelete || canRename}
              canDelete={canDelete}
              canRename={canRename}
              initialKind={selectionKind}
              key={selectionKind}
              rows={editableRows}
              selectionLocked={true}
            />
        </CardContent>
 </SectionCard>
        </>
      ) : null}
    </div>
  )
}
