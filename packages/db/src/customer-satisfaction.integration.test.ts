import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { beforeAll, afterAll, it, expect } from "vitest"
import { migrateDatabase } from "./migrate"
import {
  createCustomerSatisfactionRepository,
  authorizeSatisfactionUpload,
  type SatisfactionAccess,
} from "./customer-satisfaction"
import { createArtifactService } from "./artifacts"
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString }),
  repository = createCustomerSatisfactionRepository({ pool })
let qa: SatisfactionAccess, owner: SatisfactionAccess, id: string
const qaId = randomUUID(),
  ownerId = randomUUID()
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = (
    await pool.query<{ id: string }>(
      `INSERT INTO core.organizations(code,name) VALUES($1,'Satisfaction test') RETURNING id`,
      [`CS-${randomUUID()}`]
    )
  ).rows[0]!.id
  await pool.query(
    `INSERT INTO identity.users(id,name,email) VALUES($1,'QA',$2),($3,'Report owner',$4)`,
    [qaId, `${qaId}@test.invalid`, ownerId, `${ownerId}@test.invalid`]
  )
  await pool.query(
    `INSERT INTO identity.user_roles(user_id,role_id) SELECT $1,id FROM identity.roles WHERE key='administrator'`,
    [ownerId]
  )
  qa = {
    organizationId: organization,
    userId: qaId,
    userName: "QA",
    canReadAll: true,
    canManage: true,
    canVerify: true,
  }
  owner = {
    ...qa,
    userId: ownerId,
    userName: "Report owner",
    canReadAll: false,
    canManage: false,
    canVerify: false,
  }
}, 30000)
afterAll(async () => {
  await pool.end()
})
it("retains original report versions through owner submission, QA review and reopening", async () => {
  id = await repository.save(qa, {
    fields: {
      title: "Customer feedback review",
      customerScope: "All active customers",
      ownerUserId: ownerId,
      periodFrom: "2026-01-01",
      periodTo: "2026-06-30",
      method: "Survey and customer calls",
      coverage: "8 of 10 customers replied; two pending",
      findings: "Positive quality feedback",
      trend: "Improved delivery feedback",
      conclusion: "Maintain controls",
      nextReviewOn: "2026-12-01",
    },
    reason: "",
  })
  const provider = {
    identifier: "google-cloud-storage" as const,
    upload: async () => ({ key: randomUUID() }),
    delete: async () => {},
    read: async () => Buffer.from("%PDF-test"),
  }
  const artifacts = createArtifactService({ connectionString, provider })
  let first: string
  try {
    first = (
      await artifacts.store({
        actorUserId: ownerId,
        authorizeTarget: (client, { isRetry }) =>
          authorizeSatisfactionUpload(client, owner, id, 1, isRetry),
        bytes: Buffer.from("%PDF-test"),
        fileName: "feedback.pdf",
        mediaType: "application/pdf",
        organizationId: qa.organizationId,
        origin: "uploaded",
        purpose: "report",
        target: {
          schema: "document_control",
          table: "customer_satisfaction_reports",
          id,
        },
        idempotencyKey: randomUUID(),
      })
    ).id
    await artifacts.store({
      actorUserId: ownerId,
      authorizeTarget: (client, { isRetry }) =>
        authorizeSatisfactionUpload(client, owner, id, 1, isRetry),
      bytes: Buffer.from("%PDF-revised"),
      fileName: "feedback-reviewed.pdf",
      mediaType: "application/pdf",
      organizationId: qa.organizationId,
      origin: "uploaded",
      purpose: "report",
      target: {
        schema: "document_control",
        table: "customer_satisfaction_reports",
        id,
      },
      idempotencyKey: randomUUID(),
    })
  } finally {
    await artifacts.close()
  }
  await repository.decide(owner, {
    id,
    version: 1,
    operation: "submit",
    notes: "Original report and analysis complete",
  })
  await repository.decide(qa, {
    id,
    version: 2,
    operation: "approve",
    notes: "Checked coverage, evidence and conclusions",
  })
  const approved = (await repository.dossier(owner, id))!
  expect(approved.entry.status).toBe("Approved")
  expect(approved.files).toHaveLength(2)
  expect(await repository.file(owner, id, first!)).toMatchObject({
    fileName: "feedback.pdf",
  })
  await expect(
    repository.save(owner, {
      id,
      version: 3,
      fields: approved.entry.fields,
      reason: "Overwrite approved",
    })
  ).rejects.toThrow("reopen")
  await repository.decide(qa, {
    id,
    version: 3,
    operation: "reopen",
    notes: "Correct coverage analysis",
  })
  const reopened = (await repository.dossier(owner, id))!
  expect(reopened.entry.status).toBe("Draft")
  expect(
    reopened.history.some(
      (x) =>
        x.eventType === "customer_satisfaction.approve" &&
        x.after?.status === "Approved"
    )
  ).toBe(true)
})
it("blocks submission without original evidence and denies unassigned access and self approval", async () => {
  const draft = await repository.save(qa, {
    fields: { title: "Incomplete report", ownerUserId: ownerId },
    reason: "",
  })
  await expect(
    repository.decide(owner, {
      id: draft,
      version: 1,
      operation: "submit",
      notes: "Submit without file",
    })
  ).rejects.toThrow("upload the report")
  expect(await repository.dossier({ ...owner, userId: qaId }, id)).toBeNull()
  await expect(
    repository.decide(owner, {
      id,
      version: 4,
      operation: "approve",
      notes: "Self approve",
    })
  ).rejects.toThrow("QA review permission")
})
