import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

export type AccessAuditChange = {
  actorUserId: string
  eventType: string
  metadata?: Record<string, unknown>
  reason?: string
  sourceTable?: string
  targetId: string
  targetSchema?: string
  targetTable: string
}

export async function appendAccessAuditChanges(
  client: Pick<PoolClient, "query">,
  changes: AccessAuditChange[]
) {
  if (changes.length === 0) return

  await client.query(
    `INSERT INTO audit.events (
       event_type, target_schema, target_table, target_id, actor_user_id,
       reason, metadata, source_system, source_table, source_id
     )
     SELECT
       change.event_type,
       change.target_schema,
       change.target_table,
       change.target_id::uuid,
       change.actor_user_id::uuid,
       change.reason,
       change.metadata,
       'mrm-dashboard',
       change.source_table,
       change.source_id
     FROM jsonb_to_recordset($1::jsonb) AS change(
       event_type text,
       target_schema text,
       target_table text,
       target_id text,
       actor_user_id text,
       reason text,
       metadata jsonb,
       source_table text,
       source_id text
     )`,
    [
      JSON.stringify(changes.map((change) => ({
        actor_user_id: change.actorUserId,
        event_type: change.eventType,
        metadata: change.metadata ?? {},
        reason: change.reason ?? null,
        source_id: randomUUID(),
        source_table: change.sourceTable ?? "access_administration",
        target_id: change.targetId,
        target_schema: change.targetSchema ?? "identity",
        target_table: change.targetTable,
      }))),
    ]
  )
}
