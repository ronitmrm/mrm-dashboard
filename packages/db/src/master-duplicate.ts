import type { PoolClient } from "pg"

export class DuplicateMasterError extends Error {
  constructor() {
    super("This entry already exists. Please edit the existing record.")
    this.name = "DuplicateMasterError"
  }
}

/** Call inside the write transaction so a rejected upsert is rolled back. */
export function rejectDuplicateMaster(
  rejectDuplicates: boolean | undefined,
  exists: boolean
) {
  if (rejectDuplicates && exists) throw new DuplicateMasterError()
}

/** Table and predicate are repository-owned SQL, never request values. */
export async function assertMasterAvailable(
  client: PoolClient,
  input: { organizationId: string; rejectDuplicates?: boolean },
  table: string,
  predicate: string,
  values: readonly unknown[]
) {
  if (!input.rejectDuplicates) return
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `master-create:${table}:${input.organizationId}`,
  ])
  const existing = await client.query(
    `SELECT 1 FROM ${table} WHERE organization_id = $1 AND (${predicate}) LIMIT 1`,
    [input.organizationId, ...values]
  )
  rejectDuplicateMaster(true, existing.rows.length > 0)
}
