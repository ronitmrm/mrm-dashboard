import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { beforeAll, afterAll, it, expect } from "vitest"
import { migrateDatabase } from "./migrate"
import { createSipocRepository, type SipocAccess } from "./sipoc"
import { parseSipoc, sipocTextFields } from "./sipoc-domain"
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString }),
  repo = createSipocRepository({ pool }),
  userId = randomUUID()
let access: SipocAccess
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const org = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations(code,name) VALUES($1,'SIPOC test') RETURNING id",
    [`SIPOC-${randomUUID()}`]
  )
  await pool.query(
    "INSERT INTO identity.users(id,name,email) VALUES($1,'Process reviewer',$2)",
    [userId, `${userId}@test.invalid`]
  )
  await pool.query(
    "INSERT INTO identity.user_roles(user_id,role_id) SELECT $1,id FROM identity.roles WHERE key='administrator'",
    [userId]
  )
  access = {
    organizationId: org.rows[0]!.id,
    userId,
    userName: "Process reviewer",
    canRead: true,
    canManage: true,
    canApprove: true,
  }
}, 30000)
afterAll(async () => {
  await repo.close()
  await pool.end()
})
it("retains approved maps while a new draft is revised and rejects stale or unauthorized decisions", async () => {
  const fields = parseSipoc({
    ...Object.fromEntries(
      sipocTextFields.map(({ key }) => [key, `Confirmed ${key}`])
    ),
    ownerUserId: userId,
    nextReviewOn: "2099-12-31",
    suppliers: ["Store"],
    inputs: ["Accepted material"],
    steps: ["Machine", "Inspect"],
    outputs: ["Accepted components"],
    customers: ["Packing"],
  })
  const id = await repo.save(access, { fields, reason: "" })
  let d = (await repo.dossier(access, id))!
  await repo.transition(access, {
    id,
    version: d.entry.version,
    action: "submit",
    notes: "Owner reviewed",
  })
  d = (await repo.dossier(access, id))!
  await expect(
    repo.transition(
      { ...access, canApprove: false },
      { id, version: d.entry.version, action: "approve", notes: "Reviewed" }
    )
  ).rejects.toThrow("QA approval permission")
  await repo.transition(access, {
    id,
    version: d.entry.version,
    action: "approve",
    notes: "Boundaries and measures confirmed",
  })
  d = (await repo.dossier(access, id))!
  await repo.save(access, {
    id,
    version: d.entry.version,
    fields: { ...fields, outputs: ["Updated output"] },
    reason: "Change output",
  })
  const revised = (await repo.dossier(access, id))!
  expect(revised.entry).toMatchObject({
    status: "Draft",
    revision: 2,
    approvedRevision: 1,
  })
  expect(revised.revisions[0]!.fields.outputs).toEqual(["Accepted components"])
  expect(revised.revisions[0]!.ownerName).toBe("Process reviewer")
  await expect(
    repo.save(access, {
      id,
      version: d.entry.version,
      fields,
      reason: "Stale change",
    })
  ).rejects.toThrow("Refresh")
  expect(revised.history).toHaveLength(4)
})
it("allows incomplete drafts but blocks submission until the map is ready", async () => {
  const id = await repo.save(access, {
    fields: { name: "Unassessed process" },
    reason: "",
  })
  const row = (await repo.dossier(access, id))!.entry
  await expect(
    repo.transition(access, {
      id,
      version: row.version,
      action: "submit",
      notes: "",
    })
  ).rejects.toThrow("Complete ownership")
})
