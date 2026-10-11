import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, it } from "vitest"
import { migrateDatabase } from "./migrate"
import {
  createManagementReviewRepository,
  type ManagementReviewAccess,
} from "./management-review"
import {
  emptyReviewAgenda,
  reviewToday,
  type MeetingFields,
} from "./management-review-domain"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString }),
  repository = createManagementReviewRepository({ pool })
const qaId = randomUUID(),
  ownerId = randomUUID()
let qa: ManagementReviewAccess,
  worker: ManagementReviewAccess,
  pointId: string,
  secondMeetingId: string
function fields(): MeetingFields {
  const date = reviewToday()
  return {
    title: "Management review",
    heldOn: date,
    startTime: "10:00",
    endTime: "11:00",
    location: "Conference room",
    periodStart: date,
    periodEnd: date,
    nextReviewOn: null,
    chairUserId: qaId,
    attendees: [
      {
        userId: qaId,
        name: "QA chair",
        designation: "Management representative",
        department: "Management",
        attendance: "Present",
      },
    ],
    agenda: emptyReviewAgenda().map((topic) => ({
      ...topic,
      outcome: "Reviewed",
      discussion: "Reviewed current records and trends",
      decision: "Continue controls and follow up identified resource gaps",
      evidence: "Review input register",
    })),
    suitability: "System fits the business",
    adequacy: "Resource gap requires follow-up",
    effectiveness:
      "Current controls achieve expected results, with a resource action pending",
    improvementDecisions: "Improve instrument availability",
    qmsChanges:
      "No process change required; existing controls remain appropriate",
    resourceDecisions: "Approve gauge purchase",
  }
}
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const org = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code,name) VALUES ($1,'Management review test') RETURNING id",
    [`MRM-${randomUUID()}`]
  )
  await pool.query(
    "INSERT INTO identity.users (id,name,email) VALUES ($1,'QA chair',$2),($3,'Action owner',$4)",
    [qaId, `${qaId}@test.invalid`, ownerId, `${ownerId}@test.invalid`]
  )
  await pool.query(
    "INSERT INTO identity.user_roles (user_id,role_id) SELECT person.id,role.id FROM identity.roles role CROSS JOIN (VALUES ($1::uuid),($2::uuid)) person(id) WHERE role.key='administrator'",
    [qaId, ownerId]
  )
  qa = {
    organizationId: org.rows[0]!.id,
    userId: qaId,
    userName: "QA chair",
    canReadAll: true,
    canManage: true,
    canApprove: true,
    canVerify: true,
  }
  worker = {
    ...qa,
    userId: ownerId,
    userName: "Action owner",
    canReadAll: false,
    canManage: false,
    canApprove: false,
    canVerify: false,
  }
}, 30000)
afterAll(async () => {
  await repository.close()
  await pool.end()
})

it("preserves one pending point across approved meetings, then verifies closure with immutable meeting snapshots", async () => {
  const meetingId = await repository.saveMeeting(qa, fields())
  pointId = await repository.saveAction(
    qa,
    {
      topicKey: "resources",
      description: "Purchase and issue gauge",
      expectedOutcome: "Gauge available and inspection trial passes",
      department: "QA",
      ownerUserId: ownerId,
      dueOn: reviewToday(),
      priority: "High",
      evidenceReference: "Instrument register",
    },
    { meetingId, meetingVersion: 1 }
  )
  await repository.decideMinutes(qa, {
    id: meetingId,
    version: 2,
    operation: "submit",
    notes: "Inputs and decisions recorded",
  })
  await repository.decideMinutes(qa, {
    id: meetingId,
    version: 3,
    operation: "approve",
    notes: "QA approves the minutes; action remains pending",
  })
  expect((await repository.meetingDossier(qa, meetingId))?.entry.status).toBe(
    "Approved"
  )
  expect(
    (await repository.listActions(qa)).filter(
      (point) => point.status !== "Closed"
    )
  ).toHaveLength(1)
  secondMeetingId = await repository.saveMeeting(qa, {
    ...fields(),
    title: "Follow-up management review",
  })
  await repository.reviewAction(qa, {
    meetingId: secondMeetingId,
    meetingVersion: 1,
    actionId: pointId,
    notes: "Order placed; gauge delivery awaited",
  })
  await repository.decideMinutes(qa, {
    id: secondMeetingId,
    version: 2,
    operation: "submit",
    notes: "Reviewed previous pending point",
  })
  await repository.decideMinutes(qa, {
    id: secondMeetingId,
    version: 3,
    operation: "approve",
    notes: "Approved the follow-up discussion",
  })
  expect(await repository.listActions(qa)).toHaveLength(1)
  await repository.updateAction(worker, {
    id: pointId,
    version: 1,
    operation: "complete",
    notes: "Gauge received and issued",
    evidenceLocation: "Receipt 14 and inspection trial",
  })
  await repository.updateAction(qa, {
    id: pointId,
    version: 2,
    operation: "verify",
    notes: "Verified receipt and trial",
    evidenceLocation: "",
    effectivenessNotes:
      "Gauge issued to QC and inspection trial passed against approved master",
  })
  const final = (await repository.actionDossier(qa, pointId))!
  expect(final.entry.status).toBe("Closed")
  expect(final.entry.originMeetingId).toBe(meetingId)
  expect(final.actionReviews).toHaveLength(2)
  expect(
    final.actionReviews.every((review) => review.snapshot.status === "Open")
  ).toBe(true)
  expect(
    final.history.some(
      (event) => event.eventType === "management_review.verify"
    )
  ).toBe(true)
  expect(
    (await repository.listActions(qa)).filter(
      (point) => point.status !== "Closed"
    )
  ).toHaveLength(0)
})

it("rejects unsupported approval/closure, unauthorized access and stale edits", async () => {
  const incomplete = await repository.saveMeeting(qa, {
    ...fields(),
    chairUserId: null,
  })
  await expect(
    repository.decideMinutes(qa, {
      id: incomplete,
      version: 1,
      operation: "submit",
      notes: "Missing chair participation",
    })
  ).rejects.toThrow("top management chair")
  await expect(
    repository.decideMinutes(worker, {
      id: secondMeetingId,
      version: 4,
      operation: "reopen",
      notes: "Unauthorized correction",
    })
  ).rejects.toThrow("QA Approve Minutes")
  expect(
    await repository.actionDossier({ ...worker, userId: qaId }, pointId)
  ).toBeNull()
  await expect(
    repository.reviewAction(qa, {
      meetingId: secondMeetingId,
      meetingVersion: 4,
      actionId: pointId,
      notes: "Rewrite approved discussion",
    })
  ).rejects.toThrow("reopen the minutes")
  await expect(
    repository.updateAction(worker, {
      id: pointId,
      version: 3,
      operation: "reopen",
      notes: "Self approve",
      evidenceLocation: "",
    })
  ).rejects.toThrow("QA Verify Actions")
  await repository.updateAction(qa, {
    id: pointId,
    version: 3,
    operation: "reopen",
    notes: "Trial must be repeated",
    evidenceLocation: "",
  })
  await expect(
    repository.updateAction(worker, {
      id: pointId,
      version: 1,
      operation: "complete",
      notes: "Stale work entry",
      evidenceLocation: "",
    })
  ).rejects.toThrow("record changed")
  await repository.updateAction(worker, {
    id: pointId,
    version: 4,
    operation: "complete",
    notes: "Trial repeated",
    evidenceLocation: "",
  })
  await expect(
    repository.updateAction(qa, {
      id: pointId,
      version: 5,
      operation: "verify",
      notes: "Closure without findings",
      evidenceLocation: "",
    })
  ).rejects.toThrow("effectiveness findings")
})
