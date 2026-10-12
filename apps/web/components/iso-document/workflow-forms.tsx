"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { IsoPendingTask, IsoWorkflowDocument } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import {
  assignIsoTask,
  createIsoAction,
  saveIsoWorkflow,
  updateIsoAction,
} from "@/app/iso-document/pending-actions/actions"

type Person = { id: string; name: string; departments: string[] }
type ChoiceProps = {
  people: Person[]
  departments: string[]
  canManage: boolean
}
function AssignmentFields({
  people,
  departments,
  canManage,
  initial,
  prefix,
  departmentEditable = false,
}: {
  initial: {
    department: string
    ownerUserId: string | null
    dueOn?: string | null
  }
  prefix: string
  departmentEditable?: boolean
} & ChoiceProps) {
  const [department, setDepartment] = useState(initial.department)
  const peopleHere = canManage
    ? people
    : people.filter(
        (person) =>
          person.id === initial.ownerUserId ||
          person.departments.some(
            (value) => value.toLowerCase() === department.toLowerCase()
          )
      )
  return (
    <FormGrid>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-department`}>Department</Label>
        <NativeSelect
          id={`${prefix}-department`}
          name="department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          disabled={!canManage && !departmentEditable}
        >
          <NativeSelectOption value="">Select Department</NativeSelectOption>
          {departments.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {!canManage && !departmentEditable ? (
          <input type="hidden" name="department" value={department} />
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-owner`}>Responsible person</Label>
        <NativeSelect
          key={department}
          id={`${prefix}-owner`}
          name="ownerUserId"
          defaultValue={initial.ownerUserId ?? ""}
        >
          <NativeSelectOption value="">Not assigned</NativeSelectOption>
          {peopleHere.map((person) => (
            <NativeSelectOption key={person.id} value={person.id}>
              {person.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {"dueOn" in initial ? (
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-due`}>Target date</Label>
          <Input
            id={`${prefix}-due`}
            type="date"
            name="dueOn"
            defaultValue={initial.dueOn ?? ""}
          />
        </div>
      ) : null}
    </FormGrid>
  )
}
function Feedback({ error }: { error: string }) {
  return error ? (
    <StandardState variant="error" title="Not saved" description={error} />
  ) : null
}
function formString(form: FormData, key: string) {
  return String(form.get(key) ?? "")
}

export function WorkflowTextForm({
  document,
  ...choices
}: { document: IsoWorkflowDocument } & ChoiceProps) {
  const [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    router = useRouter()
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError("")
        setSaved(false)
        start(async () => {
          const result = await saveIsoWorkflow({
            documentId: document.id,
            version: document.version,
            metadataVersion: document.metadataVersion,
            text: formString(form, "text"),
            dueOn: formString(form, "dueOn") || null,
            department: formString(form, "department"),
            ownerUserId: formString(form, "ownerUserId") || null,
            reason: formString(form, "reason"),
          })
          if (result.error) setError(result.error)
          else {
            setSaved(true)
            router.refresh()
          }
        })
      }}
    >
      <FormSection
        title="Edit Task Workflow"
        description="Keep each step short: who, task, evidence and QA decision."
      >
        <AssignmentFields {...choices} initial={document} prefix="workflow" />
        <div className="grid gap-2">
          <Label htmlFor="workflow-text">Task flow</Label>
          <Textarea
            id="workflow-text"
            name="text"
            defaultValue={document.text}
            rows={8}
            maxLength={6000}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workflow-reason">Change reason</Label>
          <Input id="workflow-reason" name="reason" maxLength={4000} required />
        </div>
      </FormSection>
      <Feedback error={error} />
      {saved ? (
        <p role="status">Workflow saved. Previous text remains in history.</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save Workflow"}
      </Button>
    </form>
  )
}
export function IsoAssignmentForm({
  task,
  ...choices
}: { task: IsoPendingTask } & ChoiceProps) {
  const [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    router = useRouter()
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError("")
        setSaved(false)
        start(async () => {
          const result = await assignIsoTask({
            key: task.key,
            version: task.version,
            department: formString(form, "department"),
            ownerUserId: formString(form, "ownerUserId") || null,
            dueOn: formString(form, "dueOn") || null,
            reason: formString(form, "reason"),
          })
          if (result.error) setError(result.error)
          else {
            setSaved(true)
            router.refresh()
          }
        })
      }}
    >
      <FormSection title="Assignment and target date">
        <AssignmentFields {...choices} initial={task} prefix="task" />
        <div className="grid gap-2">
          <Label htmlFor="assignment-reason">Change reason</Label>
          <Input
            id="assignment-reason"
            name="reason"
            maxLength={4000}
            required
          />
        </div>
      </FormSection>
      <Feedback error={error} />
      {saved ? <p role="status">Assignment saved.</p> : null}
      <Button className="w-fit" disabled={pending}>
        Save Assignment
      </Button>
    </form>
  )
}
export function NewIsoActionForm({
  document,
  ...choices
}: { document: IsoWorkflowDocument } & ChoiceProps) {
  const [pending, start] = useTransition(),
    [error, setError] = useState(""),
    router = useRouter()
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError("")
        start(async () => {
          const result = await createIsoAction({
            documentId: document.id,
            title: formString(form, "title"),
            expectedResult: formString(form, "expectedResult"),
            department: formString(form, "department"),
            ownerUserId: formString(form, "ownerUserId") || null,
            dueOn: formString(form, "dueOn") || null,
            sourceHref: formString(form, "sourceHref"),
            reason: formString(form, "reason"),
          })
          if (result.error) setError(result.error)
          else if (result.id)
            router.push(
              `/iso-document/pending-actions/${encodeURIComponent(`action:${result.id}`)}`
            )
        })
      }}
    >
      <FormSection title="New linked action">
        <FormGrid>
          <div className="grid gap-2">
            <Label htmlFor="action-title">Required task</Label>
            <Textarea
              id="action-title"
              name="title"
              maxLength={4000}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="action-result">Expected result / acceptance</Label>
            <Textarea
              id="action-result"
              name="expectedResult"
              maxLength={4000}
              required
            />
          </div>
        </FormGrid>
        <AssignmentFields
          {...choices}
          initial={{
            ...document,
            department: choices.canManage
              ? document.department
              : choices.departments.includes(document.department)
                ? document.department
                : (choices.departments[0] ?? ""),
            ownerUserId: choices.canManage ? document.ownerUserId : null,
            dueOn: null,
          }}
          prefix="new-action"
          departmentEditable
        />
        <FormGrid>
          <div className="grid gap-2">
            <Label htmlFor="action-source">
              Related record link (optional)
            </Label>
            <Input
              id="action-source"
              name="sourceHref"
              placeholder="/iso-document/…"
              maxLength={1000}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="action-reason">Reason</Label>
            <Input id="action-reason" name="reason" maxLength={4000} required />
          </div>
        </FormGrid>
      </FormSection>
      <Feedback error={error} />
      <Button className="w-fit" disabled={pending}>
        Create Action
      </Button>
    </form>
  )
}
export function IsoActionWorkForm({
  action,
  canWork,
  canVerify,
}: {
  action: {
    id: string
    version: number
    status: string
    workDone: string
    evidence: string
  }
  canWork: boolean
  canVerify: boolean
}) {
  const [pending, start] = useTransition(),
    [error, setError] = useState(""),
    router = useRouter()
  const operations =
    action.status === "Closed"
      ? canVerify
        ? (["reopen"] as const)
        : []
      : action.status === "Completed"
        ? canVerify
          ? (["verify", "return"] as const)
          : []
        : canWork
          ? (["progress", "complete"] as const)
          : []
  if (!operations.length) return null
  const labels = {
    progress: "Record progress",
    complete: "Completed — Submit to QA",
    verify: "QA Verify and Close",
    return: "Return for Further Work",
    reopen: "Reopen with Reason",
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget),
          operation = formString(
            form,
            "operation"
          ) as (typeof operations)[number]
        setError("")
        start(async () => {
          const result = await updateIsoAction({
            id: action.id,
            version: action.version,
            operation,
            remarks: formString(form, "remarks"),
            evidence: formString(form, "evidence"),
          })
          if (result.error) setError(result.error)
          else router.refresh()
        })
      }}
    >
      <FormSection
        title={
          action.status === "Completed" ? "QA verification" : "Record work"
        }
      >
        <div className="grid gap-2">
          <Label htmlFor="work-operation">Action</Label>
          <NativeSelect
            id="work-operation"
            name="operation"
            defaultValue={operations[0]}
          >
            {operations.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {labels[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="work-remarks">
            {action.status === "Completed"
              ? "Verification findings / effectiveness"
              : "Work done / reason"}
          </Label>
          <Textarea
            id="work-remarks"
            name="remarks"
            maxLength={4000}
            required
          />
        </div>
        {canWork &&
        action.status !== "Completed" &&
        action.status !== "Closed" ? (
          <div className="grid gap-2">
            <Label htmlFor="work-evidence">Evidence / record reference</Label>
            <Textarea
              id="work-evidence"
              name="evidence"
              defaultValue={action.evidence}
              maxLength={4000}
            />
          </div>
        ) : null}
      </FormSection>
      <Feedback error={error} />
      <Button className="w-fit" disabled={pending}>
        Save Decision
      </Button>
    </form>
  )
}
