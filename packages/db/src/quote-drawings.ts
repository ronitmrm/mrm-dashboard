import type { Pool, PoolClient } from "pg"

export function selectQuoteDrawingIds(input: {
  selected: readonly string[]
  available: readonly string[]
  portfolio: boolean
  history: readonly {
    fileId: string | null
    revision: number
    approved: boolean
  }[]
}) {
  const available = new Set(input.available)
  // An explicit selection suppresses fallback even when its files are unavailable.
  if (input.selected.length)
    return [...new Set(input.selected)].filter((id) => available.has(id))
  if (!input.portfolio) return []
  const latest = input.history
    .filter((row) => row.approved)
    .sort((a, b) => b.revision - a.revision)[0]
  return latest?.fileId && available.has(latest.fileId) ? [latest.fileId] : []
}

export type QuoteDrawing = {
  enquiryItemId: string
  lineNumber: number
  fileId: string
  fileName: string
  mediaType: string | null
  storageKey: string
  publicUrl: string | null
}

type DrawingPart = {
  enquiryItemId: string
  lineNumber: number
  selected: string[]
  portfolio: boolean
  history: { fileId: string | null; revision: number; approved: boolean }[]
}

export async function availableQuoteDrawingFiles(
  db: Pool | PoolClient,
  fileIds: string[]
) {
  if (!fileIds.length) return []
  return (
    await db.query<Omit<QuoteDrawing, "enquiryItemId" | "lineNumber">>(
      `
    SELECT f.id AS "fileId", f.file_name AS "fileName", f.media_type AS "mediaType",
      f.storage_key AS "storageKey", o.public_url AS "publicUrl"
    FROM core.files f LEFT JOIN core.file_objects o ON o.id=f.physical_object_id
    WHERE f.id=ANY($1::uuid[]) AND f.lifecycle_state <> 'deleted'
      AND (f.physical_object_id IS NULL OR o.lifecycle_state='available')
      AND (NULLIF(o.public_url,'') IS NOT NULL OR NULLIF(f.storage_key,'') IS NOT NULL)
  `,
      [fileIds]
    )
  ).rows
}

export async function currentQuoteDrawings(
  db: Pool | PoolClient,
  enquiryId: string
) {
  const parts = (
    await db.query<DrawingPart>(
      `
    SELECT i.id AS "enquiryItemId", i.line_number AS "lineNumber",
      COALESCE(d.source_payload->'customerDrawingFileIds','[]'::jsonb) AS selected,
      (COALESCE(d.matched_product_id, CASE WHEN i.technical_review_status='Duplicate / Existing Product' THEN i.item_id END) IS NOT NULL) AS portfolio,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('fileId',r.file_id,
        'revision',r.revision_number,'approved',r.status IN ('Released','Superseded') AND r.approved_at IS NOT NULL))
        FROM catalog.drawing_revisions r WHERE r.organization_id=i.organization_id AND
        r.item_id=COALESCE(d.matched_product_id, CASE WHEN i.technical_review_status='Duplicate / Existing Product' THEN i.item_id END)), '[]'::jsonb) AS history
    FROM sales.enquiry_items i LEFT JOIN sales.design_tasks d ON d.enquiry_item_id=i.id
    WHERE i.enquiry_id=$1 AND i.linked_enquiry_item_id IS NULL AND i.technical_review_status <> 'NotFeasible'
    ORDER BY i.line_number
  `,
      [enquiryId]
    )
  ).rows
  const files = await availableQuoteDrawingFiles(db, [
    ...new Set(
      parts.flatMap((part) => [
        ...part.selected,
        ...part.history.flatMap((row) => (row.fileId ? [row.fileId] : [])),
      ])
    ),
  ])
  const byId = new Map(files.map((file) => [file.fileId, file]))
  return parts.flatMap((part) =>
    selectQuoteDrawingIds({ ...part, available: [...byId.keys()] }).map(
      (fileId) => ({
        ...byId.get(fileId)!,
        enquiryItemId: part.enquiryItemId,
        lineNumber: part.lineNumber,
      })
    )
  )
}
