import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createAccessAdministrationRepository } from "./access-administration"
import { createAuthorizationRepository } from "./authorization"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const authorization = createAuthorizationRepository({ pool })
const access = createAccessAdministrationRepository({ pool })
const migrationUrl = new URL(
  "../migrations/0122_scoped_operational_entry_access.sql",
  import.meta.url
)

beforeAll(async () => {
  await migrateDatabase({
    connectionString,
    through: "0121_rod_size_master_lifecycle.sql",
  })
})

test("work-order and production writers receive only their own entry actions", async () => {
  const migration = await readFile(migrationUrl, "utf8")
  const suffix = randomUUID()
  const workOrderWriter = randomUUID()
  const productionWriter = randomUUID()
  const workOrderRole = randomUUID()
  const productionRole = randomUUID()

  await pool.query("BEGIN")
  try {
    await pool.query(
      "DELETE FROM identity.permissions WHERE key LIKE 'entries.%'"
    )
    await pool.query(
      "INSERT INTO identity.users (id, name, email) VALUES ($1, 'Work-order writer', $2), ($3, 'Production writer', $4)",
      [
        workOrderWriter,
        `work-order-${suffix}@example.test`,
        productionWriter,
        `production-${suffix}@example.test`,
      ]
    )
    await pool.query(
      "INSERT INTO identity.roles (id, key, name) VALUES ($1, $2, 'Work-order writer'), ($3, $4, 'Production writer')",
      [
        workOrderRole,
        `work-order-${suffix}`,
        productionRole,
        `production-${suffix}`,
      ]
    )
    await pool.query(
      "INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2), ($3, $4)",
      [workOrderWriter, workOrderRole, productionWriter, productionRole]
    )
    await pool.query(
      "INSERT INTO identity.role_permissions (role_id, permission_id) SELECT $1::uuid, id FROM identity.permissions WHERE key = 'operations.shop_floor.write' UNION ALL SELECT $2::uuid, id FROM identity.permissions WHERE key = 'operations.production.write'",
      [workOrderRole, productionRole]
    )

    await pool.query(migration)

    const workOrderKeys = (
      await authorization.listAllGrantedCapabilities(workOrderWriter)
    )
      .filter((key) => key.startsWith("entries."))
      .sort()
    const productionKeys = (
      await authorization.listAllGrantedCapabilities(productionWriter)
    )
      .filter((key) => key.startsWith("entries."))
      .sort()
    expect(workOrderKeys).toEqual([
      "entries.cnc.work_order.import",
      "entries.cnc.work_order.save",
      "entries.conventional-02.work_order.import",
      "entries.conventional-02.work_order.save",
      "entries.conventional.work_order.import",
      "entries.conventional.work_order.save",
      "entries.forging.work_order.import",
      "entries.forging.work_order.save",
    ])
    expect(productionKeys).toEqual([
      "entries.cnc.rm_inward.import",
      "entries.cnc.rm_inward.save",
      "entries.cnc.software_raw.import",
      "entries.cnc.software_raw.save",
      "entries.conventional-02.rm_inward.import",
      "entries.conventional-02.rm_inward.save",
      "entries.conventional-02.software_raw.import",
      "entries.conventional-02.software_raw.save",
      "entries.conventional.rm_inward.import",
      "entries.conventional.rm_inward.save",
      "entries.conventional.software_raw.import",
      "entries.conventional.software_raw.save",
      "entries.forging.rm_inward.import",
      "entries.forging.rm_inward.save",
      "entries.forging.software_raw.import",
      "entries.forging.software_raw.save",
    ])
  } finally {
    await pool.query("ROLLBACK")
  }
})
afterAll(async () => {
  await pool.end()
})

test("entry cutover preserves existing roles, allow/deny decisions and override expiry for every unit", async () => {
  const migration = await readFile(migrationUrl, "utf8")
  const suffix = randomUUID()
  const users = {
    role: randomUUID(),
    allow: randomUUID(),
    deny: randomUUID(),
    expiredDeny: randomUUID(),
    expiredAllow: randomUUID(),
  }
  const roleId = randomUUID()
  const sourceKeys = [
    "operations.operational_entry.read",
    "operations.shop_floor.write",
    "operations.production.write",
  ]
  const expectedKeys = ["conventional", "conventional-02", "cnc", "forging"]
    .flatMap((floor) =>
      ["work_order", "rm_inward", "software_raw"].flatMap((entry) =>
        ["read", "save", "import", "export"].map(
          (action) => `entries.${floor}.${entry}.${action}`
        )
      )
    )
    .sort()
  const readKeys = expectedKeys.filter((key) => /\.(read|export)$/.test(key))
  const writeKeys = expectedKeys.filter((key) => /\.(save|import)$/.test(key))

  // All fixtures and migration effects are rolled back, even on assertion failure.
  // A single-connection pool keeps repository observations in this transaction.
  await pool.query("BEGIN")
  try {
    await pool.query(
      "DELETE FROM identity.permissions WHERE key LIKE 'entries.%'"
    )
    await pool.query(
      "INSERT INTO identity.roles (id, key, name) VALUES ($1, $2, 'Entry migration fixture')",
      [roleId, `entry-migration-${suffix}`]
    )
    await pool.query(
      "INSERT INTO identity.role_permissions (role_id, permission_id) SELECT $1, id FROM identity.permissions WHERE key = ANY($2::text[])",
      [roleId, sourceKeys]
    )
    for (const [name, id] of Object.entries(users)) {
      await pool.query(
        "INSERT INTO identity.users (id, name, email) VALUES ($1, $2, $3)",
        [id, name, `entry-${name}-${suffix}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO identity.user_roles (user_id, role_id) SELECT id, $1 FROM unnest($2::uuid[]) AS id",
      [roleId, [users.role, users.deny, users.expiredDeny]]
    )
    for (const [userId, effect, key, expiresAt] of [
      [users.allow, "allow", sourceKeys[0], "2100-01-01T00:00:00.000Z"],
      [users.deny, "deny", sourceKeys[0], "2100-01-01T00:00:00.000Z"],
      [users.expiredDeny, "deny", sourceKeys[2], "2000-01-01T00:00:00.000Z"],
      [users.expiredAllow, "allow", sourceKeys[0], "2000-01-01T00:00:00.000Z"],
    ]) {
      await pool.query(
        "INSERT INTO identity.user_permission_overrides (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at) SELECT $1, id, $2, 'Entry cutover fixture', $3, '1999-01-01T00:00:00Z', $4 FROM identity.permissions WHERE key = $5",
        [userId, effect, users.role, expiresAt, key]
      )
    }
    const legacyBefore = await Promise.all(
      Object.values(users).map(async (id) =>
        authorization.listGrantedCapabilities(id, sourceKeys)
      )
    )

    await pool.query(migration)

    expect(
      await authorization.listGrantedCapabilities(users.role, expectedKeys)
    ).toEqual(expectedKeys)
    expect(
      await authorization.listGrantedCapabilities(users.allow, expectedKeys)
    ).toEqual(readKeys)
    expect(
      await authorization.listGrantedCapabilities(users.deny, expectedKeys)
    ).toEqual(writeKeys)
    expect(
      await authorization.listGrantedCapabilities(
        users.expiredDeny,
        expectedKeys
      )
    ).toEqual(expectedKeys)
    expect(
      await authorization.listGrantedCapabilities(
        users.expiredAllow,
        expectedKeys
      )
    ).toEqual([])
    expect(
      await Promise.all(
        Object.values(users).map(async (id) =>
          authorization.listGrantedCapabilities(id, sourceKeys)
        )
      )
    ).toEqual(legacyBefore)

    const snapshot = await access.getSnapshot()
    expect(
      snapshot.permissions
        .filter(({ key }) => key.startsWith("entries."))
        .map(({ key }) => key)
        .sort()
    ).toEqual(expectedKeys)
    expect(
      snapshot.roles.find(({ id }) => id === roleId)?.permissionKeys.sort()
    ).toEqual([...sourceKeys, ...expectedKeys].sort())
    expect(
      snapshot.users
        .find(({ id }) => id === users.deny)
        ?.overrides.find(
          ({ permissionKey }) => permissionKey === "entries.cnc.work_order.read"
        )
    ).toEqual({
      effect: "deny",
      expiresAt: new Date("2100-01-01T00:00:00.000Z"),
      permissionKey: "entries.cnc.work_order.read",
      reason: "Entry cutover fixture",
    })
    expect(
      snapshot.users
        .find(({ id }) => id === users.expiredDeny)
        ?.overrides.find(
          ({ permissionKey }) =>
            permissionKey === "entries.forging.software_raw.import"
        )?.expiresAt
    ).toEqual(new Date("2000-01-01T00:00:00.000Z"))
  } finally {
    await pool.query("ROLLBACK")
  }
})
