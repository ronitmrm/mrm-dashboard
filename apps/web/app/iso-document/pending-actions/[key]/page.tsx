import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  PageHeader,
  FormSection,
  RecordDetails,
} from "@/components/ui/golden-patterns"
import {
  IsoAssignmentForm,
  IsoActionWorkForm,
} from "@/components/iso-document/workflow-forms"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"
export default async function IsoTaskPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const { key: encodedKey } = await params
  let key: string
  try {
    key = decodeURIComponent(encodedKey)
  } catch {
    notFound()
  }
  return withIsoWorkflows(async ({ repository, access }) => {
    const task = await repository.task(access, key)
    if (!task) notFound()
    const [people, departments, action] = await Promise.all([
      repository.staff(access.organizationId),
      repository.departments(access.organizationId),
      task.controlId
        ? repository.actionDetails(access, task.controlId)
        : Promise.resolve(null),
    ])
    const sourceTable = {
      analysis: "analysis_records",
      "analysis-review": "analysis_records",
      "meeting-action": "management_review_actions",
      meeting: "management_reviews",
      "interested-party": "interested_party_requirements",
      sipoc: "sipoc_maps",
      satisfaction: "customer_satisfaction_reports",
      document: "documents",
      "document-review": "workflow_actions",
      "record-check": "workflow_actions",
      action: "workflow_actions",
      maintenance: "workflow_actions",
      "asset-maintenance": "workflow_actions",
      calibration: "workflow_actions",
    }[task.kind]
    const history = action
      ? await repository.history(access, "workflow_actions", action.id)
      : task.native
        ? await repository.history(access, sourceTable, task.sourceId)
        : []
    return (
      <div className="grid min-w-0 gap-5">
        <PageHeader
          title={task.reference}
          description={task.title}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/iso-document/pending-actions">
                  Pending Actions
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={task.href}>Open Source Record</Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={`/iso-document/documents/${task.documentId}/workflow`}
                >
                  Task Workflow
                </Link>
              </Button>
            </>
          }
        />
        <RecordDetails
          items={[
            {
              label: "Master document",
              value: (
                <Link
                  href={`/iso-document/documents/${task.documentId}/workflow`}
                >
                  {task.documentTitle}
                </Link>
              ),
            },
            { label: "Department", value: task.department || "Not assigned" },
            {
              label: "Responsible person",
              value: task.ownerName || "Not assigned",
            },
            { label: "Target date", value: task.dueOn || "Not set" },
            { label: "Status", value: task.status },
            { label: "Final verification", value: "QA" },
          ]}
        />
        {task.canAssign ? (
          <IsoAssignmentForm
            key={task.version}
            task={task}
            people={people}
            departments={access.canManage ? departments : access.departments}
            canManage={access.canManage}
          />
        ) : null}
        {task.native ? (
          <FormSection title="Work and verification">
            <p>
              Record work, evidence and QA decisions in the linked source
              record.
            </p>
            <Button asChild className="w-fit">
              <Link href={task.href}>Open Source Record</Link>
            </Button>
          </FormSection>
        ) : action ? (
          <>
            <RecordDetails
              items={[
                { label: "Expected result", value: action.expectedResult },
                {
                  label: "Work done",
                  value: action.workDone || "Not recorded",
                },
                { label: "Evidence", value: action.evidence || "Not recorded" },
                {
                  label: "QA findings",
                  value: action.qaFindings || "Not verified",
                },
              ]}
            />
            <FormSection
              title={`Workflow used · version ${action.workflowVersion}`}
            >
              <p className="break-words whitespace-pre-wrap">
                {action.workflowSnapshot}
              </p>
            </FormSection>
            <IsoActionWorkForm
              key={action.version}
              action={action}
              canWork={task.canWork}
              canVerify={access.canVerify}
            />
          </>
        ) : (
          <p>
            Assign a responsible person and target date to start this
            obligation.
          </p>
        )}
        <IsoRecordHistoryTable
          history={history}
          filterStorageKey={`iso:task-history:${key}`}
        />
      </div>
    )
  })
}
