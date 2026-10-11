import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, it } from "vitest"
import { migrateDatabase } from "./migrate"
import {
  createIsoAnalysisRepository,
  type AnalysisAccess,
} from "./iso-analysis"

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test",
})
const repository = createIsoAnalysisRepository({ pool })
let qa: AnalysisAccess
let worker: AnalysisAccess
let itemId: string
const ownerId = randomUUID()
const qaId = randomUUID()

beforeAll(async () => {
  await migrateDatabase({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test",
  })
  const org = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code,name) VALUES ($1,'ISO analysis test') RETURNING id",
    [`ISO-${randomUUID()}`]
  )
  await pool.query(
    "INSERT INTO identity.users (id,name,email) VALUES ($1,'QA reviewer',$2),($3,'Action owner',$4)",
    [qaId, `${qaId}@test.invalid`, ownerId, `${ownerId}@test.invalid`]
  )
  await pool.query(
    "INSERT INTO identity.user_roles (user_id,role_id) SELECT $1,id FROM identity.roles WHERE key='administrator'",
    [ownerId]
  )
  qa = {
    organizationId: org.rows[0]!.id,
    userId: qaId,
    userName: "QA reviewer",
    canManage: true,
    canVerify: true,
    canReadAll: true,
  }
  worker = {
    ...qa,
    userId: ownerId,
    userName: "Action owner",
    canManage: false,
    canVerify: false,
    canReadAll: false,
  }
}, 30000)
afterAll(async () => {
  await pool.end()
})

it("tracks assigned work through QA closure, review and reopening with before/after history", async () => {
  itemId = (await repository.save(qa, {
    kind: "SWOT",
    analysisYear: 2026,
    category: "Weakness",
    description: "Gauge handling",
    actionPlan: "Train operators",
    department: "QA",
    ownerUserId: ownerId,
    dueOn: "2026-10-20",
    focus: "Risk",
    priority: "High",
    impact: "Gauge misuse can cause incorrect inspection results",
    expectedOutcome:
      "Operators handle gauges correctly during observed inspection",
  }))!
  await repository.update(worker, {
    id: itemId,
    version: 1,
    operation: "progress",
    notes: "Training started",
    evidenceLocation: "",
  })
  await repository.update(worker, {
    id: itemId,
    version: 2,
    operation: "complete",
    notes: "Operators trained",
    evidenceLocation: "Training register 1",
  })
  await repository.update(qa, {
    id: itemId,
    version: 3,
    operation: "verify",
    notes: "Verified handling on shop floor",
    effectivenessNotes: "Observed all trained operators using gauges correctly",
    evidenceLocation: "",
  })
  const closed = (await repository.dossier(qa, itemId))!
  expect(closed.entry).toMatchObject({
    status: "Closed",
    completionNotes: "Operators trained",
    evidenceLocation: "Training register 1",
    closedBy: "QA reviewer",
    effectivenessNotes: "Observed all trained operators using gauges correctly",
    version: 4,
  })
  expect(
    closed.history.find((event) => event.eventType === "iso_analysis.verify")
  ).toMatchObject({
    before: expect.objectContaining({ status: "Completed" }),
    after: expect.objectContaining({ status: "Closed" }),
  })
  await repository.update(qa, {
    id: itemId,
    version: 4,
    operation: "review",
    notes: "Monthly check satisfactory",
    evidenceLocation: "",
    reviewedOn: "2026-10-11",
    nextReviewOn: "2026-11-11",
  })
  await repository.update(qa, {
    id: itemId,
    version: 5,
    operation: "reopen",
    notes: "Refresher required",
    evidenceLocation: "",
  })
  const reopened = (await repository.dossier(worker, itemId))!
  expect(reopened.entry.status).toBe("In Progress")
  expect(reopened.history).toHaveLength(6)
  expect(reopened.entry.nextReviewOn).toBe("2026-11-11")
})

it("prevents unassigned access, unsupported QA closure and stale overwrites", async () => {
  const other = { ...worker, userId: qaId }
  expect(await repository.dossier(other, itemId)).toBeNull()
  await expect(
    repository.update(worker, {
      id: itemId,
      version: 6,
      operation: "verify",
      notes: "Self approve",
      evidenceLocation: "",
    })
  ).rejects.toThrow("QA verification permission")
  await expect(
    repository.update(worker, {
      id: itemId,
      version: 1,
      operation: "complete",
      notes: "Outdated form",
      evidenceLocation: "",
    })
  ).rejects.toThrow("This item changed")
  await repository.update(worker, {
    id: itemId,
    version: 6,
    operation: "complete",
    notes: "Refresher completed",
    evidenceLocation: "",
  })
  await expect(
    repository.update(qa, {
      id: itemId,
      version: 7,
      operation: "verify",
      notes: "Closed without findings",
      evidenceLocation: "",
    })
  ).rejects.toThrow("effectiveness findings")
})
