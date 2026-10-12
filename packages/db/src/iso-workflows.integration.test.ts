import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { beforeAll, afterAll, it, expect } from "vitest"
import { migrateDatabase } from "./migrate"
import {
  createIsoWorkflowRepository,
  type IsoWorkflowAccess,
} from "./iso-workflows"
import { createIsoAnalysisRepository } from "./iso-analysis"
import { createManagementReviewRepository } from "./management-review"
import { emptyReviewAgenda } from "./management-review-domain"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString }),
  repo = createIsoWorkflowRepository({ pool }),
  analyses = createIsoAnalysisRepository({ pool })
let qa: IsoWorkflowAccess,
  hod: IsoWorkflowAccess,
  worker: IsoWorkflowAccess,
  documentId: string,
  foreignDocumentId: string,
  itemId: string
const qaId = randomUUID(),
  hodId = randomUUID(),
  workerId = randomUUID(),
  department = "Workflow Test A",
  foreignDepartment = "Workflow Test B"
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organizationId = (
    await pool.query<{ id: string }>(
      "INSERT INTO core.organizations(code,name) VALUES($1,'ISO Workflow Test') RETURNING id",
      [`WF-${randomUUID()}`]
    )
  ).rows[0]!.id
  for (const [id, name] of [
    [qaId, "QA"],
    [hodId, "HOD"],
    [workerId, "Responsible person"],
  ]) {
    await pool.query(
      "INSERT INTO identity.users(id,name,email) VALUES($1,$2,$3)",
      [id, name, `${id}@test.invalid`]
    )
    await pool.query(
      "INSERT INTO identity.user_roles(user_id,role_id) SELECT $1,id FROM identity.roles WHERE key=$2",
      [id, id === workerId ? "department-manager" : "administrator"]
    )
    await pool.query(
      `INSERT INTO workforce.employees(organization_id,employee_code,name,department,user_id,source_system,source_table,source_id) VALUES($1,$2,$3,$4,$5,'test','iso-workflow',$2)`,
      [organizationId, id, name, department, id]
    )
  }
  await pool.query(
    "INSERT INTO recruitment.departments(organization_id,code,name,source_system,source_table,source_id) VALUES($1::uuid,'WF-A',$2,'test','iso-workflow',$1::text||'-A'),($1::uuid,'WF-B',$3,'test','iso-workflow',$1::text||'-B')",
    [organizationId, department, foreignDepartment]
  )
  const docs = (
    await pool.query<{ id: string }>(
      `INSERT INTO branding.documents(organization_id,type,document_type,iso_module,workflow_title,workflow_department,workflow_text) VALUES($1,'controlled-document','register-list','pest','PEST tasks',$2,'Responsible person records work. QA verifies evidence.'),($1,'controlled-document','register-list','swot','Foreign tasks',$3,'QA controls the workflow.') RETURNING id`,
      [organizationId, department, foreignDepartment]
    )
  ).rows
  documentId = docs[0]!.id
  foreignDocumentId = docs[1]!.id
  qa = {
    organizationId,
    userId: qaId,
    userName: "QA",
    canManage: true,
    canVerify: true,
    canAssignDepartment: true,
    departments: [],
  }
  hod = {
    ...qa,
    userId: hodId,
    userName: "HOD",
    canManage: false,
    canVerify: false,
    departments: [department],
  }
  worker = {
    ...hod,
    userId: workerId,
    userName: "Responsible person",
    canAssignDepartment: false,
    departments: [],
  }
  itemId = (await analyses.save(
    { ...qa, canReadAll: true },
    {
      kind: "PEST",
      analysisYear: 2026,
      category: "Political",
      description: "Workflow test requirement",
      actionPlan: "Complete the documented action",
      department,
      focus: "Risk",
      priority: "Medium",
      impact: "Delivery disruption",
      expectedOutcome: "Documented checks pass",
      ownerUserId: null,
      dueOn: null,
    }
  ))!
}, 30000)
afterAll(async () => {
  await pool.end()
})

it("links one source action to its master workflow, permits department assignment and retains QA closure evidence", async () => {
  const task = (await repo.list(hod)).find((row) => row.sourceId === itemId)!
  expect(task.documentId).toBe(documentId)
  await repo.assign(hod, {
    key: task.key,
    version: task.version,
    department,
    ownerUserId: workerId,
    dueOn: "2026-11-15",
    reason: "HOD allocated responsibility",
  })
  const source = await analyses.dossier({ ...qa, canReadAll: true }, itemId)
  expect(source?.entry.ownerUserId).toBe(workerId)
  expect(source?.entry.dueOn).toBe("2026-11-15")
  expect(
    (await repo.list(worker)).filter((row) => row.sourceId === itemId)
  ).toHaveLength(1)
  const doc = (await repo.documents(qa.organizationId)).find(
    (row) => row.id === documentId
  )!
  await repo.saveWorkflow(qa, {
    documentId,
    version: doc.version,
    metadataVersion: doc.metadataVersion,
    text: "1. HOD assigns.\n2. Responsible person records evidence.\n3. QA verifies and closes.",
    department,
    ownerUserId: hodId,
    dueOn: "2026-11-15",
    reason: "Define concise task flow",
  })
  const id = await repo.createAction(hod, {
    documentId,
    title: "Verify training completion",
    expectedResult: "The assigned employee demonstrates the task correctly",
    department,
    ownerUserId: workerId,
    dueOn: "2026-11-15",
    reason: "Required follow-up",
  })
  expect(
    (await repo.documents(qa.organizationId)).find(
      (row) => row.id === documentId
    )?.dueOn
  ).toBe("2026-11-15")
  const before = await repo.actionDetails(worker, id)
  await repo.updateAction(worker, {
    id,
    version: before!.version,
    operation: "complete",
    remarks: "Demonstration completed",
    evidence: "Training record TR-1",
  })
  expect(
    (await repo.list(qa)).find((row) => row.controlId === id)?.status
  ).toBe("Awaiting QA")
  const completed = await repo.actionDetails(qa, id)
  await repo.updateAction(qa, {
    id,
    version: completed!.version,
    operation: "verify",
    remarks: "Evidence checked; demonstration meets the expected result",
  })
  expect((await repo.list(qa)).some((row) => row.controlId === id)).toBe(false)
  const closed = await repo.actionDetails(qa, id)
  expect(closed?.status).toBe("Closed")
  expect(closed?.workflowSnapshot).toContain("QA verifies and closes")
  const history = await repo.history(qa, "workflow_actions", id)
  expect(history.map((row) => row.eventType)).toContain("iso_workflow.verify")
  await repo.updateAction(qa, {
    id,
    version: closed!.version,
    operation: "reopen",
    remarks: "Repeat check after process change",
  })
  expect(
    (await repo.list(worker)).find((row) => row.controlId === id)?.status
  ).toBe("In Progress")
  // The original recurring cycle disappears once confirmed; QA can still reopen its retained action.
  const reviewKey = `document-review:${documentId}:previous-cycle`
  await pool.query(
    "UPDATE document_control.workflow_actions SET source_key=$1,status='Closed',completed_at=now(),completed_by_user_id=$2,verified_at=now(),verified_by_user_id=$2 WHERE id=$3",
    [reviewKey, qaId, id]
  )
  const review = (await repo.actionDetails(qa, id))!
  await repo.updateAction(qa, {
    id,
    version: review.version,
    operation: "reopen",
    remarks: "Recheck the previous review",
  })
  const reopenedReview = (await repo.list(worker)).find(
    (row) => row.key === reviewKey
  )!
  expect(reopenedReview.canWork).toBe(true)
  await repo.updateAction(worker, {
    id,
    version: reopenedReview.version,
    operation: "complete",
    remarks: "Review repeated",
    evidence: "Review record RV-2",
  })
  await repo.updateAction(qa, {
    id,
    version: reopenedReview.version + 1,
    operation: "verify",
    remarks: "Repeated review meets the expected result",
  })
  const confirmations = await pool.query(
    "SELECT period_label FROM document_control.monitoring_confirmations WHERE document_id=$1",
    [documentId]
  )
  expect(confirmations.rows[0]?.period_label).toContain(
    `${reviewKey}:verification:`
  )
  await pool.query(
    "INSERT INTO branding.documents(organization_id,type,document_type,iso_module,workflow_title,workflow_department) VALUES($1,'controlled-document','register-list','management-review','Meeting tasks',$2)",
    [qa.organizationId, department]
  )
  const meetings = createManagementReviewRepository({ pool })
  const minutesFields = {
    title: "Assigned meeting preparation",
    heldOn: "2026-10-12",
    location: "Meeting room",
    attendees: [],
    agenda: emptyReviewAgenda(),
  }
  const meetingAccess = { ...qa, canReadAll: true, canApprove: true }
  const meetingId = await meetings.saveMeeting(meetingAccess, minutesFields)
  const meetingTask = (await repo.list(qa)).find(
    (row) => row.kind === "meeting" && row.sourceId === meetingId
  )!
  await repo.assign(qa, {
    key: meetingTask.key,
    version: meetingTask.version,
    department,
    ownerUserId: workerId,
    dueOn: "2026-11-15",
    reason: "Assign meeting coordinator",
  })
  const coordinator = { ...worker, canReadAll: false, canApprove: false }
  const minutes = (await meetings.meetingDossier(coordinator, meetingId))!.entry
  await meetings.saveMeeting(
    coordinator,
    { ...minutesFields, title: "Coordinator prepared minutes" },
    { id: meetingId, version: minutes.version, reason: "Record review inputs" }
  )
  expect(
    (await meetings.meetingDossier(coordinator, meetingId))?.entry.title
  ).toBe("Coordinator prepared minutes")
  await expect(
    meetings.decideMinutes(coordinator, {
      id: meetingId,
      version: minutes.version + 1,
      operation: "approve",
      notes: "Self approval",
    })
  ).rejects.toThrow("QA Approve")
})

it("rejects cross-department edits, stale assignments, workflow edits by HOD and closure without QA", async () => {
  const task = (await repo.list(hod)).find((row) => row.sourceId === itemId)!
  await expect(
    repo.assign(hod, {
      key: task.key,
      version: task.version - 1,
      department,
      ownerUserId: workerId,
      dueOn: "2026-11-30",
      reason: "Stale target edit",
    })
  ).rejects.toThrow("changed")
  await expect(
    repo.assign(hod, {
      key: task.key,
      version: task.version,
      department: foreignDepartment,
      ownerUserId: workerId,
      dueOn: "2026-11-30",
      reason: "Move outside department",
    })
  ).rejects.toThrow("Only QA")
  expect(
    (await repo.list(hod)).some((row) => row.documentId === foreignDocumentId)
  ).toBe(false)
  await expect(
    repo.saveWorkflow(hod, {
      documentId,
      version: 2,
      metadataVersion: 2,
      text: "HOD changes QA flow",
      department,
      ownerUserId: workerId,
      reason: "Unauthorized",
      dueOn: "2026-11-15",
    })
  ).rejects.toThrow("QA controls")
  const own = (await repo.list(worker, true)).find(
    (row) => row.kind === "action"
  )!
  await expect(
    repo.updateAction(worker, {
      id: own.sourceId,
      version: own.version,
      operation: "verify",
      remarks: "Self-close",
    })
  ).rejects.toThrow("QA verification")
})
