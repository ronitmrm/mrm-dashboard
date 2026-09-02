import path from "node:path"

import type { PoolClient } from "pg"

import { drawingRevisionForReleasedDesign } from "./design-control-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type LegacyDrawingRegisterRow = {
  drawingNumber: unknown
  revision: unknown
  revisionDate: unknown
  uid: unknown
}

export type ReleasedDrawingBaselineProduct = {
  itemId: string
  organizationId: string
  uid: string
}

export type LegacyDrawingBaseline = {
  drawingNumber: string
  effectiveOn: string
  fileName: string
  itemId: string
  organizationId: string
  revisionLabel: string
  revisionNumber: number
  uid: string
}

export type LegacyDrawingBaselineApplyResult = {
  status:
    | "applied"
    | "already-applied"
    | "newer-live-revision"
    | "live-drawing-exists"
  uid: string
}

const defaultBaselineDate = "2026-09-02"
const baselineOverrides = new Map([
  ["m986", { effectiveOn: "2026-06-07", revisionNumber: 0 }],
])

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

function revisionNumber(value: unknown) {
  const candidate = typeof value === "number" ? value : Number(text(value))
  return Number.isInteger(candidate) && candidate >= 0 ? candidate : null
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10)
  }
  const candidate = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

function fileStem(fileName: string) {
  return path.parse(path.basename(fileName)).name.trim().toLowerCase()
}

export function buildLegacyDrawingBaselinePlan(input: {
  fileNames: readonly string[]
  registerRows: readonly LegacyDrawingRegisterRow[]
  releasedProducts: readonly ReleasedDrawingBaselineProduct[]
}) {
  const productsByUid = new Map(
    input.releasedProducts.map((product) => [
      product.uid.trim().toLowerCase(),
      product,
    ])
  )
  const registerByUid = new Map(
    input.registerRows.flatMap((row) => {
      const uid = text(row.uid).toLowerCase()
      return uid ? [[uid, row] as const] : []
    })
  )
  const filesByUid = new Map<string, string[]>()
  for (const fileName of input.fileNames) {
    const stem = fileStem(fileName)
    const matches = filesByUid.get(stem) ?? []
    matches.push(fileName)
    filesByUid.set(stem, matches)
  }

  const ready: LegacyDrawingBaseline[] = []
  const missingFileUids: string[] = []
  const ambiguousFileUids: string[] = []
  for (const product of input.releasedProducts) {
    const key = product.uid.trim().toLowerCase()
    const row = registerByUid.get(key)
    const override = baselineOverrides.get(key)
    const currentRevision =
      override?.revisionNumber ?? revisionNumber(row?.revision) ?? 0
    const effectiveOn =
      override?.effectiveOn ?? isoDate(row?.revisionDate) ?? defaultBaselineDate
    const files = filesByUid.get(key) ?? []
    if (files.length === 0) {
      missingFileUids.push(product.uid)
      continue
    }
    if (files.length > 1) {
      ambiguousFileUids.push(product.uid)
      continue
    }
    const revision = drawingRevisionForReleasedDesign(currentRevision)
    ready.push({
      drawingNumber: text(row?.drawingNumber) || product.uid,
      effectiveOn,
      fileName: files[0]!,
      itemId: product.itemId,
      organizationId: product.organizationId,
      revisionLabel: revision.revisionLabel,
      revisionNumber: revision.revisionNumber,
      uid: product.uid,
    })
  }

  return {
    ambiguousFileUids,
    ignoredRegisterUids: [...registerByUid.keys()]
      .filter((uid) => !productsByUid.has(uid))
      .map((uid) => text(registerByUid.get(uid)?.uid))
      .sort(),
    missingFileUids,
    ready,
    unmatchedFileNames: input.fileNames
      .filter((fileName) => !productsByUid.has(fileStem(fileName)))
      .sort(),
  }
}

async function currentItemEvidence(client: PoolClient, itemId: string) {
  const [item, bom] = await Promise.all([
    client.query<Record<string, unknown>>(
      "SELECT * FROM catalog.items WHERE id = $1",
      [itemId]
    ),
    client.query<{
      component_design_revision: string | null
      component_item_id: string
      component_uid: string
      notes: string | null
      quantity: string
      sequence: number
    }>(
      `SELECT line.component_item_id, component.uid AS component_uid,
         line.quantity::text, line.notes, line.sequence,
         component_design.revision_label AS component_design_revision
       FROM catalog.bom_lines line
       JOIN catalog.items component ON component.id = line.component_item_id
       LEFT JOIN catalog.product_design_revisions component_design
         ON component_design.item_id = component.id AND component_design.is_current
       WHERE line.parent_item_id = $1
       ORDER BY line.sequence, line.created_at, line.id`,
      [itemId]
    ),
  ])
  return {
    bom: bom.rows.map((line) => ({
      componentDesignRevision: line.component_design_revision,
      componentItemId: line.component_item_id,
      componentUid: line.component_uid,
      notes: line.notes,
      quantity: Number(line.quantity),
      sequence: line.sequence,
    })),
    item: item.rows[0] ?? {},
  }
}

export function createLegacyDrawingBaselineRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)
  return {
    close,

    async listReleasedProducts(organizationCode: string) {
      const result = await pool.query<ReleasedDrawingBaselineProduct>(
        `SELECT item.id AS "itemId", item.organization_id AS "organizationId",
           item.uid
         FROM catalog.items item
         JOIN core.organizations organization
           ON organization.id = item.organization_id
         JOIN catalog.product_design_revisions revision
           ON revision.item_id = item.id AND revision.is_current
         WHERE lower(organization.code) = lower($1)
           AND item.uid_kind = 'INTERNAL' AND item.lifecycle_status = 'P'
         ORDER BY item.uid`,
        [organizationCode.trim()]
      )
      return result.rows
    },

    async applyBaseline(input: {
      baseline: LegacyDrawingBaseline
      fileId: string
      organizationCode: string
    }): Promise<LegacyDrawingBaselineApplyResult> {
      return withTransaction(pool, async (client) => {
        const current = await client.query<{
          design_revision_id: string
          design_revision_number: number
          organization_id: string
          uid: string
        }>(
          `SELECT item.uid, item.organization_id,
             revision.id AS design_revision_id,
             revision.revision_number AS design_revision_number
           FROM catalog.items item
           JOIN core.organizations organization
             ON organization.id = item.organization_id
           JOIN catalog.product_design_revisions revision
             ON revision.item_id = item.id AND revision.is_current
           WHERE item.id = $1 AND lower(organization.code) = lower($2)
             AND item.uid_kind = 'INTERNAL' AND item.lifecycle_status = 'P'
           FOR UPDATE OF item, revision`,
          [input.baseline.itemId, input.organizationCode.trim()]
        )
        const row = current.rows[0]
        if (
          !row ||
          row.uid.toLowerCase() !== input.baseline.uid.toLowerCase()
        ) {
          throw new Error(
            `Released Product ${input.baseline.uid} was not found.`
          )
        }
        const sourceId = `${row.organization_id}:${row.uid}:${input.baseline.revisionLabel}`
        const existingDrawing = await client.query<{
          revision_number: number
          source_id: string
          source_system: string
        }>(
          `SELECT revision_number, source_system, source_id
           FROM catalog.drawing_revisions
           WHERE item_id = $1 AND is_current
           FOR UPDATE`,
          [input.baseline.itemId]
        )
        const drawing = existingDrawing.rows[0]
        if (drawing) {
          return {
            status:
              drawing.source_system === "legacy-drawing-baseline" &&
              drawing.source_id === sourceId &&
              drawing.revision_number === input.baseline.revisionNumber
                ? "already-applied"
                : "live-drawing-exists",
            uid: row.uid,
          }
        }
        if (row.design_revision_number > input.baseline.revisionNumber) {
          return { status: "newer-live-revision", uid: row.uid }
        }
        const file = await client.query<{ id: string }>(
          `SELECT id FROM core.files
           WHERE id = $1 AND organization_id = $2
             AND lifecycle_state = 'current'
           LIMIT 1`,
          [input.fileId, row.organization_id]
        )
        if (!file.rows[0]) {
          throw new Error(`Current drawing file was not found for ${row.uid}.`)
        }

        let designRevisionId = row.design_revision_id
        if (row.design_revision_number < input.baseline.revisionNumber) {
          await client.query(
            `UPDATE catalog.product_design_revisions
             SET status = 'Superseded', is_current = false WHERE id = $1`,
            [row.design_revision_id]
          )
          await client.query(
            `UPDATE catalog.items
             SET source_payload = jsonb_set(
               COALESCE(source_payload, '{}'::jsonb),
               '{currentDesignRevision}', to_jsonb($1::text), true
             ), updated_at = now(), row_version = row_version + 1
             WHERE id = $2`,
            [input.baseline.revisionLabel, input.baseline.itemId]
          )
          const evidence = await currentItemEvidence(
            client,
            input.baseline.itemId
          )
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO catalog.product_design_revisions (
               organization_id, item_id, revision_number, revision_label,
               status, is_current, effective_on, change_reason,
               design_snapshot, bom_snapshot, released_at,
               source_system, source_table, source_id, source_payload
             ) VALUES (
               $1, $2, $3, $4, 'Released', true, $5::date,
               'Legacy Drawing Register Baseline', $6, $7, $5::date,
               'legacy-drawing-baseline', 'drawing.xlsx', $8,
               jsonb_build_object('legacyBaseline', true)
             )
             RETURNING id`,
            [
              row.organization_id,
              input.baseline.itemId,
              input.baseline.revisionNumber,
              input.baseline.revisionLabel,
              input.baseline.effectiveOn,
              JSON.stringify(evidence.item),
              JSON.stringify(evidence.bom),
              `${sourceId}:design`,
            ]
          )
          designRevisionId = inserted.rows[0]!.id
        }
        await client.query(
          `INSERT INTO catalog.drawing_revisions (
             organization_id, item_id, product_design_revision_id, file_id,
             drawing_number, revision_number, revision_label,
             requirement_status, status, is_current, effective_on,
             change_reason, released_at, source_system, source_table,
             source_id, source_payload
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'Required', 'Released', true,
             $8::date, 'Legacy Drawing Register Import', $8::date,
             'legacy-drawing-baseline', 'drawing.xlsx', $9,
             jsonb_build_object('legacyBaseline', true, 'fileName', $10::text)
           )`,
          [
            row.organization_id,
            input.baseline.itemId,
            designRevisionId,
            input.fileId,
            input.baseline.drawingNumber,
            input.baseline.revisionNumber,
            input.baseline.revisionLabel,
            input.baseline.effectiveOn,
            sourceId,
            input.baseline.fileName,
          ]
        )
        return { status: "applied", uid: row.uid }
      })
    },
  }
}

export { defaultBaselineDate }
