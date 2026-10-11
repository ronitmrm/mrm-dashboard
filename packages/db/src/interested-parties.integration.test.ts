import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { beforeAll, afterAll, it, expect } from "vitest"
import { migrateDatabase } from "./migrate"
import {
  createInterestedPartiesRepository,
  type InterestedPartiesAccess,
} from "./interested-parties"
import {
  monitoringToday,
  requirementAttention,
  type RequirementFields,
} from "./interested-parties-domain"
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString }),
  repo = createInterestedPartiesRepository({ pool }),
  qaId = randomUUID(),
  ownerId = randomUUID()
let qa: InterestedPartiesAccess, owner: InterestedPartiesAccess
const future = "2099-12-31"
function plan(): RequirementFields {
  return {
    partyGroup: "Customer",
    partyType: "External",
    scope: "Contract A delivery",
    requirement: "Deliver complete orders on the agreed date",
    basis: "Customer requirement",
    sourceReference: "Contract A",
    relevance: "Relevant",
    relevanceReason: "Delivery affects customer satisfaction",
    department: "Dispatch",
    ownerUserId: ownerId,
    acceptanceCriteria: "All agreed units delivered by the promised date",
    monitoringMethod: "Compare order and dispatch records",
    frequency: "Each dispatch; periodic trend review",
    nextReviewOn: monitoringToday(),
    identifiedOn: monitoringToday(),
    climateNotes: "",
    relatedReference: "",
    lifecycle: "Active",
    inactiveReason: "",
  }
}
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const org = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code,name) VALUES ($1,'Interested parties test') RETURNING id",
    [`IPR-${randomUUID()}`]
  )
  await pool.query(
    "INSERT INTO identity.users (id,name,email) VALUES ($1,'QA reviewer',$2),($3,'Monitoring owner',$4)",
    [qaId, `${qaId}@test.invalid`, ownerId, `${ownerId}@test.invalid`]
  )
  await pool.query(
    "INSERT INTO identity.user_roles (user_id,role_id) SELECT person.id,role.id FROM identity.roles role CROSS JOIN (VALUES ($1::uuid),($2::uuid)) person(id) WHERE role.key='administrator'",
    [qaId, ownerId]
  )
  qa = {
    organizationId: org.rows[0]!.id,
    userId: qaId,
    userName: "QA reviewer",
    canReadAll: true,
    canManage: true,
    canVerify: true,
  }
  owner = {
    ...qa,
    userId: ownerId,
    userName: "Monitoring owner",
    canReadAll: false,
    canManage: false,
    canVerify: false,
  }
}, 30000)
afterAll(async () => {
  await repo.close()
  await pool.end()
})
it("retains plan snapshots and QA-verified monitoring while requirements stay active", async () => {
  const id = await repo.save(qa, plan())
  const entry = (await repo.dossier(owner, id))!.entry
  const reviewId = await repo.submitMonitoring(owner, {
    id,
    version: entry.version,
    fields: {
      observedOn: monitoringToday(),
      observations: "One order was late",
      evidence: "Dispatch register row 12",
      outcome: "Not met",
      followUp: "Correct dispatch scheduling and recheck",
      followUpDueOn: future,
      relatedReference: "MRM action reference",
    },
  })
  let dossier = (await repo.dossier(qa, id))!
  expect(requirementAttention(dossier.entry)).toBe("Awaiting QA")
  await repo.decideMonitoring(qa, {
    id,
    version: dossier.entry.version,
    reviewId,
    decision: "verify",
    notes: "Evidence confirms the missed date; follow-up assigned",
    nextReviewOn: future,
  })
  dossier = (await repo.dossier(qa, id))!
  expect(requirementAttention(dossier.entry)).toBe("Follow-up required")
  const revised = {
    ...plan(),
    acceptanceCriteria:
      "Complete delivery by agreed date, including packing approval",
    nextReviewOn: future,
  }
  await repo.save(qa, revised, {
    id,
    version: dossier.entry.version,
    reason: "Include packing approval in the check",
  })
  dossier = (await repo.dossier(owner, id))!
  expect(dossier.reviews[0]!.planSnapshot.acceptanceCriteria).toBe(
    plan().acceptanceCriteria
  )
  expect(requirementAttention(dossier.entry)).toBe("Follow-up required")
  const metId = await repo.submitMonitoring(owner, {
    id,
    version: dossier.entry.version,
    fields: {
      observedOn: monitoringToday(),
      observations: "All units dispatched on time with packing approval",
      evidence: "Dispatch register and packing approval 13",
      outcome: "Met",
      followUp: "",
      followUpDueOn: null,
      relatedReference: "",
    },
  })
  dossier = (await repo.dossier(qa, id))!
  await repo.decideMonitoring(qa, {
    id,
    version: dossier.entry.version,
    reviewId: metId,
    decision: "verify",
    notes: "Checked dispatch and approval against the revised criteria",
    nextReviewOn: future,
  })
  dossier = (await repo.dossier(qa, id))!
  expect(dossier.entry.lifecycle).toBe("Active")
  expect(requirementAttention(dossier.entry)).toBe("Monitoring current")
  expect(dossier.reviews).toHaveLength(2)
  expect(
    dossier.history.some(
      (event) => event.eventType === "interested_parties.plan_changed"
    )
  ).toBe(true)
})
it("keeps submitted results unverified and prevents owner QA decisions or plan edits while pending", async () => {
  const id = await repo.save(qa, plan()),
    entry = (await repo.dossier(owner, id))!.entry
  const reviewId = await repo.submitMonitoring(owner, {
    id,
    version: entry.version,
    fields: {
      observedOn: monitoringToday(),
      observations: "Checked dispatches",
      evidence: "Dispatch 14",
      outcome: "Met",
      followUp: "",
      followUpDueOn: null,
      relatedReference: "",
    },
  })
  const pending = (await repo.dossier(owner, id))!
  expect(pending.entry.verifiedOutcome).toBeNull()
  expect(await repo.dossier({ ...owner, userId: randomUUID() }, id)).toBeNull()
  await expect(
    repo.decideMonitoring(owner, {
      id,
      version: pending.entry.version,
      reviewId,
      decision: "verify",
      notes: "Claim met",
      nextReviewOn: future,
    })
  ).rejects.toThrow("QA verification")
  await expect(
    repo.save(qa, plan(), {
      id,
      version: pending.entry.version,
      reason: "Change before verification",
    })
  ).rejects.toThrow("submitted monitoring")
  await repo.decideMonitoring(qa, {
    id,
    version: pending.entry.version,
    reviewId,
    decision: "return",
    notes: "Provide evidence of full quantity",
  })
  const returned = (await repo.dossier(owner, id))!
  expect(requirementAttention(returned.entry)).toBe("Monitoring returned")
  expect(returned.reviews[0]!.observations).toBe("Checked dispatches")
})
