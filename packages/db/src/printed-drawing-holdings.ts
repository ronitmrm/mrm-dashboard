import { productionFloors, type ProductionFloorCode } from "./production-floors"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type PrintedDrawingHolding = {
  drawingId: string
  productionFloorCode: ProductionFloorCode
  quantity: number
  location: string
  updatedAt: Date
  updatedBy: string | null
}

export class PrintedDrawingHoldingError extends Error {}

export function createPrintedDrawingHoldingsRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)
  return {
    close,
    async listForOrganization(
      organizationCode: string,
      options: { floor?: ProductionFloorCode; uid?: string } = {}
    ): Promise<PrintedDrawingHolding[]> {
      const result = await pool.query<{
        drawing_revision_id: string
        production_floor_code: ProductionFloorCode
        quantity: number
        location: string
        updated_at: Date
        updated_by: string | null
      }>(
        `
        SELECT holding.*, COALESCE(actor.name, actor.email) AS updated_by
        FROM catalog.printed_drawing_holdings holding
        JOIN catalog.drawing_revisions revision ON revision.id = holding.drawing_revision_id
        JOIN catalog.items item ON item.id = revision.item_id
        JOIN core.organizations organization ON organization.id = revision.organization_id
        LEFT JOIN identity.users actor ON actor.id = holding.updated_by_user_id
        WHERE lower(organization.code) = lower($1)
          AND ($2::text = '' OR holding.production_floor_code = $2)
          AND ($3::text = '' OR lower(item.uid) = lower($3))
        ORDER BY revision.revision_number DESC, holding.production_floor_code
      `,
        [
          organizationCode.trim(),
          options.floor ?? "",
          options.uid?.trim() ?? "",
        ]
      )
      return result.rows.map((row) => ({
        drawingId: row.drawing_revision_id,
        productionFloorCode: row.production_floor_code,
        quantity: row.quantity,
        location: row.location,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      }))
    },
    async saveForOrganization(input: {
      organizationCode: string
      drawingId: string
      productionFloorCode: ProductionFloorCode
      quantity: number
      location: string
      actorUserId: string
    }) {
      const location = input.location.trim()
      if (
        !productionFloors.some(
          (floor) => floor.code === input.productionFloorCode
        )
      ) {
        throw new PrintedDrawingHoldingError("Choose a valid production unit.")
      }
      if (
        !Number.isInteger(input.quantity) ||
        input.quantity < 0 ||
        input.quantity > 2147483647
      ) {
        throw new PrintedDrawingHoldingError(
          "Enter a whole number of copies, zero or more."
        )
      }
      if (location.length > 200 || (input.quantity > 0 && !location)) {
        throw new PrintedDrawingHoldingError(
          "Enter a storage location, up to 200 characters, when copies are available."
        )
      }
      const result = await pool.query(
        `
        INSERT INTO catalog.printed_drawing_holdings (
          drawing_revision_id, production_floor_code, quantity, location, updated_by_user_id
        )
        SELECT revision.id, $3, $4, $5, $6
        FROM catalog.drawing_revisions revision
        JOIN core.organizations organization ON organization.id = revision.organization_id
        WHERE revision.id = $2
          AND lower(organization.code) = lower($1)
          AND (revision.is_current OR (
            revision.source_system = 'legacy-drawing-baseline'
            AND revision.status = 'Draft' AND revision.file_id IS NULL
            AND revision.source_payload ->> 'filePending' = 'true'
          ))
        ON CONFLICT (drawing_revision_id, production_floor_code) DO UPDATE
        SET quantity = EXCLUDED.quantity, location = EXCLUDED.location,
          updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
        RETURNING drawing_revision_id
      `,
        [
          input.organizationCode.trim(),
          input.drawingId,
          input.productionFloorCode,
          input.quantity,
          location,
          input.actorUserId,
        ]
      )
      if (!result.rowCount) {
        throw new PrintedDrawingHoldingError(
          "This drawing is no longer in the current register. Refresh and choose its current revision."
        )
      }
    },
  }
}
