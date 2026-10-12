import { BookOpenCheck } from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { DataDownloadButton } from "@/components/data-download-button"
import { MasterDocumentTable } from "@/components/iso-document/master-document-table"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { withDocumentControl } from "@/lib/iso-document/server"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"
import { PendingActionsRegister } from "@/components/iso-document/pending-actions-register"

export default async function MasterDocumentListPage() {
  const documents = await withDocumentControl(
    "read",
    ({ repository, organizationId }) =>
      repository.listMasterDocuments(organizationId)
  )
  const inUse = documents.released.filter(
    ({ useStatus }) => useStatus === "in-use"
  ).length
  const pendingWork = await withIsoWorkflows(
    async ({ repository, access }) => ({
      rows: await repository.list(access),
      userId: access.userId,
    })
  )
  const pendingCounts = Object.fromEntries(
    documents.all.map((row) => [
      row.id,
      pendingWork.rows.filter((task) => task.documentId === row.id).length,
    ])
  )
  const revisionsInProgress = documents.pending.filter(
    ({ revision }) => revision !== null
  ).length
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title="Master Document List"
        icon={BookOpenCheck}
        description="Authoritative index for controlled documents across MRM and approved record locations."
        actions={
          <DataDownloadButton href="/iso-document/documents/export.xlsx" />
        }
      />
      <MetricSummary
        scope="All controlled documents · before table filters"
        items={[
          {
            label: "Released documents",
            value: documents.released.length,
            tone: "information",
          },
          { label: "Released in use", value: inUse, tone: "positive" },
          {
            label: "Pending documents",
            value: documents.pending.length,
            tone: "warning",
          },
          {
            label: "Revisions in progress",
            value: revisionsInProgress,
            tone: "accent",
          },
        ]}
      />
      <Tabs defaultValue="master" className="min-w-0">
        <div className="min-w-0 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="master">All Documents</TabsTrigger>
            <TabsTrigger value="released">Released Documents</TabsTrigger>
            <TabsTrigger value="pending">Pending Documents</TabsTrigger>
            <TabsTrigger value="actions">Pending Actions</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="master">
          <MasterDocumentTable
            rows={documents.all}
            pendingCounts={pendingCounts}
          />
        </TabsContent>
        <TabsContent value="released">
          <MasterDocumentTable
            rows={documents.released}
            pendingCounts={pendingCounts}
          />
        </TabsContent>
        <TabsContent value="pending">
          <MasterDocumentTable
            pending
            rows={documents.pending}
            pendingCounts={pendingCounts}
          />
        </TabsContent>
        <TabsContent value="actions">
          <PendingActionsRegister
            rows={pendingWork.rows}
            userId={pendingWork.userId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
