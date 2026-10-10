import type { Pool, PoolClient } from "pg"

// Current holdings determine defaults; an exhausted balance is not a location.
const storedItems = `
  WITH stored_items AS (
    SELECT asset.item_type_id, asset.current_location_id AS location_id,
      max(COALESCE(movement.moved_at, asset.created_at)) AS last_used
    FROM store.assets asset
    JOIN store.locations held ON held.id = asset.current_location_id
      AND held.accountable_store_id = asset.accountable_store_id
    LEFT JOIN store.stock_movements movement ON movement.asset_id = asset.id
      AND movement.location_id = asset.current_location_id
      AND movement.to_holder_type = 'STORE' AND movement.quantity >= 0
    WHERE asset.organization_id = $1 AND asset.current_holder_type = 'STORE'
      AND asset.status NOT IN ('SCRAPPED', 'LOST')
    GROUP BY asset.item_type_id, asset.current_location_id
    UNION ALL
    SELECT movement.item_type_id, movement.location_id,
      max(movement.moved_at) FILTER (WHERE movement.quantity > 0) AS last_used
    FROM store.stock_movements movement
    JOIN store.item_types item ON item.id = movement.item_type_id
      AND item.tracking_mode = 'CONSUMABLE'
    WHERE movement.organization_id = $1 AND movement.asset_id IS NULL
    GROUP BY movement.item_type_id, movement.location_id
    HAVING sum(movement.quantity) > 0
  )`

export async function listStoreStorageLocations(
  database: Pool | PoolClient,
  organizationId: string
) {
  const [locations, defaults] = await Promise.all([
    database.query<{
      code: string
      id: string
      isDefault: boolean
      name: string
      storeCode: string
    }>(
      `SELECT location.id, location.code, location.name,
         accountable.code AS "storeCode",
         location.id = accountable.default_location_id AS "isDefault"
       FROM store.locations location
       JOIN store.accountable_stores accountable
         ON accountable.id = location.accountable_store_id
         AND accountable.organization_id = location.organization_id
       WHERE location.organization_id = $1 AND location.active
         AND location.location_type = 'STORE' AND accountable.active
       ORDER BY accountable.code, location.name, location.id`,
      [organizationId]
    ),
    database.query<{
      itemTypeId: string
      locationId: string
      storeCode: string
    }>(
      `${storedItems}
       SELECT DISTINCT ON (accountable.id, stored.item_type_id)
         stored.item_type_id AS "itemTypeId", location.id AS "locationId",
         accountable.code AS "storeCode"
       FROM stored_items stored
       JOIN store.locations location ON location.id = stored.location_id
       JOIN store.accountable_stores accountable
         ON accountable.id = location.accountable_store_id
         AND accountable.organization_id = location.organization_id
       WHERE location.organization_id = $1 AND location.active
         AND location.location_type = 'STORE' AND accountable.active
       ORDER BY accountable.id, stored.item_type_id,
         stored.last_used DESC NULLS LAST, location.id`,
      [organizationId]
    ),
  ])
  return { defaults: defaults.rows, locations: locations.rows }
}

export async function resolveStoreStorageLocation(
  database: PoolClient,
  input: {
    itemTypeId: string
    locationId?: string | null
    organizationId: string
    storeId: string
  }
) {
  const result = await database.query<{
    code: string
    id: string
    name: string
  }>(
    input.locationId
      ? `
     SELECT location.id, location.code, location.name
     FROM store.locations location
     JOIN store.accountable_stores accountable
       ON accountable.id = location.accountable_store_id
       AND accountable.organization_id = location.organization_id
     WHERE location.organization_id = $1 AND accountable.id = $2
       AND location.active AND location.location_type = 'STORE'
       AND accountable.active AND location.id = $4
       AND $3::uuid IS NOT NULL`
      : `${storedItems}
     SELECT location.id, location.code, location.name
     FROM store.locations location
     JOIN store.accountable_stores accountable
       ON accountable.id = location.accountable_store_id
       AND accountable.organization_id = location.organization_id
     LEFT JOIN stored_items stored ON stored.location_id = location.id
       AND stored.item_type_id = $3
     WHERE location.organization_id = $1 AND accountable.id = $2
       AND location.active AND location.location_type = 'STORE'
       AND accountable.active AND ($4::uuid IS NULL OR location.id = $4)
     ORDER BY (stored.location_id IS NOT NULL) DESC,
       stored.last_used DESC NULLS LAST,
       (location.id = accountable.default_location_id) DESC, location.id
     LIMIT 1`,
    [
      input.organizationId,
      input.storeId,
      input.itemTypeId,
      input.locationId || null,
    ]
  )
  if (!result.rows[0]) {
    throw new Error(
      "Select an active storage location belonging to the receiving Store."
    )
  }
  return result.rows[0]
}
