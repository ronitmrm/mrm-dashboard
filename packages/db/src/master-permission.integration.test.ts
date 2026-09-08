import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { createAccessAdministrationRepository } from "./access-administration"
import { createAuthorizationRepository } from "./authorization"
import { migrateDatabase } from "./migrate"
import { createCommercialMasterRepository } from "./commercial-masters"
import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const access = createAccessAdministrationRepository({ pool })
const authorization = createAuthorizationRepository({ pool })

beforeAll(async () => { await migrateDatabase({ connectionString }) })
afterAll(async () => { await pool.end() })

test("master grants survive role edits and do not authorize another unit or master", async () => {
  const suffix = randomUUID()
  const roleKey = `master-check-${suffix}`
  const keys = ["masters.cnc.tooling.read", "masters.cnc.tooling.save", "masters.forging.tooling.read", "masters.universal.department.read"]
  const inserted = await pool.query<{ id: string }>(
    "INSERT INTO identity.permissions (key, module, name, description) SELECT key, 'masters', key, 'Isolated master permission fixture' FROM unnest($1::text[]) AS key ON CONFLICT (key) DO NOTHING RETURNING id", [keys]
  )
  const user = await pool.query<{ id: string }>("INSERT INTO identity.users (name, email) VALUES ('Master permission test', $1) RETURNING id", [`master-${suffix}@example.test`])
  const actorUserId = user.rows[0]!.id
  try {
    await access.createRole({ actorUserId, key: roleKey, name: "Master permission test", permissionKeys: [keys[0]!] })
    await access.assignRole({ actorUserId, roleKey, userId: actorUserId })
    await access.updateRolePermissions({ actorUserId, roleKey, permissionKeys: [keys[0]!, keys[1]!] })
    const saved = (await access.getSnapshot()).roles.find((role) => role.key === roleKey)!
    expect(saved.permissionKeys).toEqual([keys[0], keys[1]])
    expect((await authorization.listAllGrantedCapabilities(actorUserId)).sort()).toEqual([keys[0], keys[1]])
    expect(await authorization.hasCapability(actorUserId, keys[2]!)).toBe(false)
    expect(await authorization.hasCapability(actorUserId, keys[3]!)).toBe(false)
    expect(await authorization.hasCapability(actorUserId, "operations.dashboard.read")).toBe(false)
    await access.updateRolePermissions({ actorUserId, roleKey, permissionKeys: [] })
    expect(await authorization.listAllGrantedCapabilities(actorUserId)).toEqual([])
  } finally {
    await pool.query("DELETE FROM identity.roles WHERE key = $1", [roleKey])
    await pool.query("DELETE FROM identity.users WHERE id = $1", [actorUserId])
    await pool.query("DELETE FROM identity.permissions WHERE id = ANY($1::uuid[])", [inserted.rows.map(({ id }) => id)])
  }
})

test("lifecycle authorization receives the stored commercial subtype and denial rolls back the edit", async () => {
  const organizations = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ($1, 'Master permission test') RETURNING id",
    [`master-permission-${randomUUID()}`]
  )
  const organizationId = organizations.rows[0]!.id
  const masters = createCommercialMasterRepository({ pool })
  const lifecycle = createMasterDataLifecycleRepository({ pool })
  const name = `Permission test ${randomUUID()}`
  const created = await masters.upsertCommercialTerm({ organizationId, termType: "payment_terms", name, active: true })
  try {
    await expect(lifecycle.renameMaster({ organizationId, kind: "commercial_commercial_term", recordId: created.id, name: "Forbidden rename", authorize: async (record) => {
      expect(record).toEqual({ kind: "commercial_commercial_term", productionFloorCode: null, termType: "payment_terms" })
      throw new Error("Permission denied")
    } })).rejects.toThrow("Permission denied")
    const rows = await masters.listEditableRows({ organizationId, kind: "commercial_commercial_term", termType: "payment_terms" })
    expect(rows.find(({ id }) => id === created.id)?.label).toBe(name)
  } finally {
    await lifecycle.deleteMaster({ organizationId, kind: "commercial_commercial_term", recordId: created.id, reason: "Remove isolated permission test fixture" })
  }
})
