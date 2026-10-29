import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type PartCodeRename = {
  itemId: string
  currentCode: string
  newCode: string
  description: string
}

type RenameRequest = {
  organizationCode: string
  actorUserId: string | null
  changes: Array<{ itemId?: string; currentCode: string; newCode: string }>
  preview?: boolean
}

export function createPartCodeRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)

  async function renameMany(input: RenameRequest): Promise<PartCodeRename[]> {
    if (!input.changes.length || input.changes.length > 5000)
      throw new Error("Choose between 1 and 5,000 part codes.")
    const currentCodes = new Set<string>(),
      newCodes = new Set<string>()
    const changes = input.changes.map((change) => {
      const currentCode = change.currentCode.trim()
      const newCode = change.newCode.trim().toUpperCase()
      if (!currentCode) throw new Error("Current Part Code is required.")
      if (
        !newCode ||
        newCode.length > 100 ||
        Array.from(newCode).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        )
      )
        throw new Error("Enter a new part code of 1–100 characters.")
      if (currentCodes.has(currentCode.toLowerCase()))
        throw new Error(`Current part code ${currentCode} is repeated.`)
      if (newCodes.has(newCode.toLowerCase()))
        throw new Error(
          `New part code ${newCode} is repeated. Each part needs its own code.`
        )
      currentCodes.add(currentCode.toLowerCase())
      newCodes.add(newCode.toLowerCase())
      return { ...change, currentCode, newCode }
    })
    try {
      return await withTransaction(pool, async (client) => {
        const result = await client.query<{
          id: string
          organization_id: string
          uid: string
          description: string
          uid_kind: string
          lifecycle_status: string
          snapshot: Record<string, unknown>
        }>(
          `SELECT item.id, item.organization_id, item.uid, item.description,
             item.uid_kind, item.lifecycle_status, to_jsonb(item) AS snapshot
           FROM catalog.items item JOIN core.organizations org ON org.id = item.organization_id
           WHERE lower(org.code) = lower($1)
             AND (item.id::text = ANY($2::text[]) OR lower(item.uid) = ANY($3::text[]))
           ORDER BY item.id FOR UPDATE OF item`,
          [
            input.organizationCode,
            changes.flatMap((change) => (change.itemId ? [change.itemId] : [])),
            [...currentCodes, ...newCodes],
          ]
        )
        const byId = new Map(result.rows.map((item) => [item.id, item]))
        const byCode = new Map(
          result.rows.map((item) => [item.uid.toLowerCase(), item])
        )
        const planned = changes.map((change) => {
          const item = change.itemId
            ? byId.get(change.itemId)
            : byCode.get(change.currentCode.toLowerCase())
          if (
            !item ||
            item.uid_kind !== "INTERNAL" ||
            item.lifecycle_status !== "P"
          )
            throw new Error(`Part ${change.currentCode} was not found.`)
          if (item.uid.toLowerCase() !== change.currentCode.toLowerCase())
            throw new Error(
              `Part ${change.currentCode} has changed. Refresh the page and preview again.`
            )
          if (change.newCode === item.uid)
            throw new Error(`Enter a different code for ${item.uid}.`)
          const duplicate = byCode.get(change.newCode.toLowerCase())
          if (duplicate && duplicate.id !== item.id)
            throw new Error(
              `Part code ${change.newCode} already exists. Choose an unused code.`
            )
          return { item, newCode: change.newCode }
        })
        const preview = planned.map(({ item, newCode }) => ({
          itemId: item.id,
          currentCode: item.uid,
          newCode,
          description: item.description,
        }))
        if (input.preview) return preview

        const organizationId = planned[0]!.item.organization_id
        const records = JSON.stringify(
          planned.map(({ item, newCode }) => ({
            id: item.id,
            old_code: item.uid,
            new_code: newCode,
            before_state: item.snapshot,
          }))
        )
        // One universal identity per part. Routes, cycles, types, work orders and
        // issued snapshots keep their permanent IDs and original settings.
        await client.query(
          `UPDATE catalog.items item SET uid = change.new_code, updated_at = now(),
             updated_by_user_id = $3, row_version = item.row_version + 1
           FROM jsonb_to_recordset($1::jsonb) change(id uuid, new_code text)
           WHERE item.id = change.id AND item.organization_id = $2`,
          [records, organizationId, input.actorUserId]
        )
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table, target_id,
             actor_user_id, reason, before_state, after_state, metadata,
             source_system, source_table, source_id
           ) SELECT $2, 'catalog.part_code.renamed', 'catalog', 'items', item.id,
             $3, 'Part code renamed', change.before_state, to_jsonb(item),
             jsonb_build_object('oldCode', change.old_code, 'newCode', change.new_code),
             'mrm-dashboard', 'part_code_rename', gen_random_uuid()::text
           FROM jsonb_to_recordset($1::jsonb) change(id uuid, old_code text, new_code text, before_state jsonb)
           JOIN catalog.items item ON item.id = change.id AND item.organization_id = $2`,
          [records, organizationId, input.actorUserId]
        )
        await queueDashboardRefresh(client, organizationId)
        return preview
      })
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      )
        throw new Error(
          "A new part code already exists. No codes were changed."
        )
      throw error
    }
  }

  return {
    close,
    renameMany,
    async rename(input: {
      organizationCode: string
      itemId: string
      currentCode: string
      newCode: string
      actorUserId: string | null
    }) {
      const [renamed] = await renameMany({ ...input, changes: [input] })
      return {
        id: renamed!.itemId,
        oldCode: renamed!.currentCode,
        newCode: renamed!.newCode,
      }
    },
  }
}
