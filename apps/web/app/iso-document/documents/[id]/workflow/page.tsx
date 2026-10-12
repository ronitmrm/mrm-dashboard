import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import {
  PageHeader,
  FormSection,
  RecordDetails,
} from "@/components/ui/golden-patterns"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import {
  WorkflowTextForm,
  NewIsoActionForm,
} from "@/components/iso-document/workflow-forms"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return withIsoWorkflows(async ({ repository, access }) => {
    const [documents, people, departments, history] = await Promise.all([
      repository.documents(access.organizationId),
      repository.staff(access.organizationId),
      repository.departments(access.organizationId),
      repository.history(access, "documents", id),
    ])
    const document = documents.find((row) => row.id === id)
    if (!document) notFound()
    const choices = {
      people,
      departments: access.canManage ? departments : access.departments,
      canManage: access.canManage,
    }
    return (
      <div className="grid min-w-0 gap-5">
        <PageHeader
          title={`${document.title} · Task Workflow`}
          description="Who does each task, what evidence is needed and how QA verifies closure."
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/iso-document/documents">Master Document List</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/iso-document/pending-actions?document=${id}`}>
                  Pending Actions
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/iso-document/documents/${id}/workflow.txt`}>
                  Download Text
                </a>
              </Button>
            </>
          }
        />
        <RecordDetails
          items={[
            {
              label: "Department",
              value: document.department || "Not assigned",
            },
            {
              label: "Responsible person",
              value: document.ownerName || "Not assigned",
            },
            { label: "Workflow version", value: document.version },
            { label: "Target date", value: document.dueOn || "Not set" },
            {
              label: "Format release",
              value: document.released ? "Released" : "Not released",
            },
          ]}
        />
        <Tabs defaultValue="workflow" className="min-w-0">
          <div className="min-w-0 overflow-x-auto">
            <TabsList>
              <TabsTrigger value="workflow">Task Workflow</TabsTrigger>
              {access.canManage ? (
                <TabsTrigger value="edit">Edit Workflow</TabsTrigger>
              ) : null}
              {access.canManage || access.canAssignDepartment ? (
                <TabsTrigger value="action">New Linked Action</TabsTrigger>
              ) : null}
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="workflow">
            <FormSection title="Task Workflow">
              <p className="break-words whitespace-pre-wrap">
                {document.text || "QA must enter the task workflow."}
              </p>
            </FormSection>
          </TabsContent>
          {access.canManage ? (
            <TabsContent value="edit">
              <WorkflowTextForm
                key={document.version}
                document={document}
                {...choices}
              />
            </TabsContent>
          ) : null}
          {access.canManage || access.canAssignDepartment ? (
            <TabsContent value="action">
              <NewIsoActionForm document={document} {...choices} />
            </TabsContent>
          ) : null}
          <TabsContent value="history">
            <IsoRecordHistoryTable
              history={history}
              filterStorageKey={`iso:workflow-history:${id}`}
            />
          </TabsContent>
        </Tabs>
      </div>
    )
  })
}
