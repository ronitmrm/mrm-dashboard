import type { PoolClient } from "pg"

export async function nextInternalProductUid(
  client: PoolClient,
  organizationId: string
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `catalog.internal-uid:${organizationId}`,
  ])
  const result = await client.query<{ next_value: string }>(
    `
    SELECT (COALESCE(max(substring(uid FROM 2)::bigint), 0) + 1)::text AS next_value
    FROM catalog.items WHERE organization_id = $1 AND uid ~ '^M[0-9]+$'
  `,
    [organizationId]
  )
  return `M${result.rows[0]!.next_value}`
}
