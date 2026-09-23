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

export default async function MasterDocumentListPage() {
  const documents = await withDocumentControl(
    "read",
    ({ repository, organizationId }) =>
      repository.listMasterDocuments(organizationId)
  )
  const inUse = documents.released.filter(
    ({ useStatus }) => useStatus === "in-use"
  ).length
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
          { label: "In use", value: inUse, tone: "positive" },
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
        <TabsList>
          <TabsTrigger value="master">Master Document List</TabsTrigger>
          <TabsTrigger value="pending">Pending Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="master">
          <MasterDocumentTable rows={documents.released} />
        </TabsContent>
        <TabsContent value="pending">
          <MasterDocumentTable pending rows={documents.pending} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
