import { createHash } from "node:crypto"
import type { PoolClient } from "pg"
import type { ProductionFloorCode } from "./production-floors"

type JsonRecord = Record<string, unknown>

// Bump when planning/output semantics or the segment input schema changes.
export const dashboardSegmentBuilderVersion = "floor-planning-1"
const plantDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
})

export function floorSourceFingerprint(input: unknown, builderVersion: string) {
  const serialized = JSON.stringify({ builderVersion, plantDate: plantDate.format(new Date()), input },
    (_key, value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) return value
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    })
  return createHash("sha256").update(serialized).digest("hex")
}

export type PublishedFloorSegment = {
  production_floor_code: ProductionFloorCode
  segment_id: string | null
  version: string
  source_fingerprint: string | null
}

export async function readPublishedFloorSegments(client: Pick<PoolClient, "query">, organizationId: string) {
  return (await client.query<PublishedFloorSegment>(`
    SELECT DISTINCT ON (production_floor_code)
      production_floor_code, segment_id, version::text, source_fingerprint
    FROM derived.dashboard_floor_read_models
    WHERE organization_id = $1
    ORDER BY production_floor_code, publication_version DESC
  `, [organizationId])).rows
}

export async function persistFloorSegments(client: Pick<PoolClient, "query">, organizationId: string,
  sourceAsOf: Date, floors: Array<{
    floorCode: ProductionFloorCode; version: number; fingerprint: string;
    payload: JsonRecord; sourceWatermark: JsonRecord
  }>) {
  if (!floors.length) return []
  return (await client.query<{ id: string; production_floor_code: ProductionFloorCode }>(`
    INSERT INTO derived.dashboard_floor_segments
      (organization_id, production_floor_code, version, source_fingerprint,
       source_as_of, payload, source_watermark)
    SELECT $1, floor.code, floor.version, floor.fingerprint, $2, floor.payload, floor.watermark
    FROM jsonb_to_recordset($3::jsonb)
      floor(code text, version bigint, fingerprint text, payload jsonb, watermark jsonb)
    RETURNING id, production_floor_code
  `, [organizationId, sourceAsOf, JSON.stringify(floors.map(floor => ({
    code: floor.floorCode, version: floor.version, fingerprint: floor.fingerprint,
    payload: floor.payload, watermark: floor.sourceWatermark,
  })))] )).rows
}
