import { Pool, type PoolClient } from "pg"

type TransformPricingFoundationOptions = {
  connectionString: string
  migrationRunId: string
  organizationCode: string
  transformationVersion: string
}

export type PricingFoundationTransformationResult = {
  customers: number
  machineTypes: number
  materialGrades: number
  rodTypes: number
  sourceMappings: number
}

type CatalogMasterMapping = {
  sourceTable: "product_grades" | "product_machine_types" | "product_rod_types"
  stagingTable:
    | "sqlite_product_grades"
    | "sqlite_product_machine_types"
    | "sqlite_product_rod_types"
  targetTable: "machine_types" | "material_grades" | "rod_types"
}

const CATALOG_MASTER_MAPPINGS: CatalogMasterMapping[] = [
  {
    sourceTable: "product_grades",
    stagingTable: "sqlite_product_grades",
    targetTable: "material_grades",
  },
  {
    sourceTable: "product_machine_types",
    stagingTable: "sqlite_product_machine_types",
    targetTable: "machine_types",
  },
  {
    sourceTable: "product_rod_types",
    stagingTable: "sqlite_product_rod_types",
    targetTable: "rod_types",
  },
]

async function transformCustomers(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
    transformationVersion: string
  }
) {
  await client.query(
    `
      INSERT INTO sales.customers (
        organization_id,
        customer_uid,
        company_name,
        status,
        contact_name,
        email,
        phone,
        country,
        notes,
        created_at,
        source_system,
        source_table,
        source_id,
        source_payload
      )
      SELECT
        $2::uuid,
        btrim(staged.customer_uid),
        btrim(staged.company_name),
        staged.status,
        staged.contact_name,
        staged.email,
        staged.phone,
        staged.country,
        staged.notes,
        COALESCE(
          NULLIF(staged.created_at, '')::timestamp
            AT TIME ZONE 'Asia/Calcutta',
          now()
        ),
        'pricing_sqlite',
        'customers',
        staged.source_id,
        staged.source_row
      FROM migration.sqlite_customers AS staged
      WHERE staged.migration_run_id = $1
      ON CONFLICT (source_system, source_table, source_id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        customer_uid = EXCLUDED.customer_uid,
        company_name = EXCLUDED.company_name,
        status = EXCLUDED.status,
        contact_name = EXCLUDED.contact_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        notes = EXCLUDED.notes,
        source_payload = EXCLUDED.source_payload,
        updated_at = now(),
        row_version = sales.customers.row_version + 1
      WHERE sales.customers.organization_id
              IS DISTINCT FROM EXCLUDED.organization_id
         OR sales.customers.source_payload
              IS DISTINCT FROM EXCLUDED.source_payload
    `,
    [options.migrationRunId, options.organizationId]
  )

  const mappings = await client.query(
    `
      INSERT INTO migration.source_id_map (
        source_system,
        source_table,
        source_id,
        target_schema,
        target_table,
        target_id,
        migration_run_id,
        transformation_version
      )
      SELECT
        'pricing_sqlite',
        'customers',
        staged.source_id,
        'sales',
        'customers',
        target.id,
        $1::uuid,
        $3
      FROM migration.sqlite_customers AS staged
      JOIN sales.customers AS target
        ON target.source_system = 'pricing_sqlite'
       AND target.source_table = 'customers'
       AND target.source_id = staged.source_id
      WHERE staged.migration_run_id = $1
        AND target.organization_id = $2
      ON CONFLICT (source_system, source_table, source_id)
      DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        migration_run_id = EXCLUDED.migration_run_id,
        transformation_version = EXCLUDED.transformation_version,
        mapped_at = now()
    `,
    [
      options.migrationRunId,
      options.organizationId,
      options.transformationVersion,
    ]
  )

  return {
    mappings: mappings.rowCount ?? 0,
    rows: mappings.rowCount ?? 0,
  }
}

async function transformCatalogMaster(
  client: PoolClient,
  options: {
    mapping: CatalogMasterMapping
    migrationRunId: string
    organizationId: string
    transformationVersion: string
  }
) {
  await client.query(
    `
      INSERT INTO catalog.${options.mapping.targetTable} (
        organization_id,
        name,
        created_at,
        source_system,
        source_table,
        source_id,
        source_payload
      )
      SELECT
        $2::uuid,
        btrim(staged.name),
        COALESCE(
          NULLIF(staged.created_at, '')::timestamp
            AT TIME ZONE 'Asia/Calcutta',
          now()
        ),
        'pricing_sqlite',
        $3,
        staged.source_id,
        staged.source_row
      FROM migration.${options.mapping.stagingTable} AS staged
      WHERE staged.migration_run_id = $1
      ON CONFLICT (organization_id, lower(name))
      DO NOTHING
    `,
    [
      options.migrationRunId,
      options.organizationId,
      options.mapping.sourceTable,
    ]
  )

  const mappings = await client.query(
    `
      INSERT INTO migration.source_id_map (
        source_system,
        source_table,
        source_id,
        target_schema,
        target_table,
        target_id,
        migration_run_id,
        transformation_version
      )
      SELECT
        'pricing_sqlite',
        $3,
        staged.source_id,
        'catalog',
        $4,
        target.id,
        $1::uuid,
        $5
      FROM migration.${options.mapping.stagingTable} AS staged
      JOIN catalog.${options.mapping.targetTable} AS target
        ON target.organization_id = $2
       AND lower(target.name) = lower(btrim(staged.name))
      WHERE staged.migration_run_id = $1
      ON CONFLICT (source_system, source_table, source_id)
      DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        migration_run_id = EXCLUDED.migration_run_id,
        transformation_version = EXCLUDED.transformation_version,
        mapped_at = now()
    `,
    [
      options.migrationRunId,
      options.organizationId,
      options.mapping.sourceTable,
      options.mapping.targetTable,
      options.transformationVersion,
    ]
  )

  return mappings.rowCount ?? 0
}

export async function transformPricingFoundation(
  options: TransformPricingFoundationOptions
): Promise<PricingFoundationTransformationResult> {
  const pool = new Pool({ connectionString: options.connectionString })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const migrationRun = await client.query<{ id: string }>(
      "SELECT id FROM migration.runs WHERE id = $1 FOR UPDATE",
      [options.migrationRunId]
    )
    if (migrationRun.rowCount !== 1) {
      throw new Error(`Migration run not found: ${options.migrationRunId}`)
    }

    const organization = await client.query<{ id: string }>(
      "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
      [options.organizationCode.trim()]
    )
    const organizationId = organization.rows[0]?.id
    if (!organizationId) {
      throw new Error(
        `Organization not found: ${options.organizationCode.trim()}`
      )
    }

    const customers = await transformCustomers(client, {
      migrationRunId: options.migrationRunId,
      organizationId,
      transformationVersion: options.transformationVersion,
    })
    const masterCounts = new Map<string, number>()

    for (const mapping of CATALOG_MASTER_MAPPINGS) {
      masterCounts.set(
        mapping.targetTable,
        await transformCatalogMaster(client, {
          mapping,
          migrationRunId: options.migrationRunId,
          organizationId,
          transformationVersion: options.transformationVersion,
        })
      )
    }

    const result = {
      customers: customers.rows,
      machineTypes: masterCounts.get("machine_types") ?? 0,
      materialGrades: masterCounts.get("material_grades") ?? 0,
      rodTypes: masterCounts.get("rod_types") ?? 0,
      sourceMappings:
        customers.mappings +
        [...masterCounts.values()].reduce((total, count) => total + count, 0),
    }

    await client.query(
      "UPDATE migration.runs SET status = 'transforming' WHERE id = $1",
      [options.migrationRunId]
    )
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
