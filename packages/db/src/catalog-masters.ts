import { Pool } from "pg"

type CatalogMasterKind = "machineType" | "materialGrade" | "rodType"

type CatalogMasterSource = {
  id: string
  payload?: Record<string, unknown>
  system: string
  table: string
}

type CreateCatalogMaster = {
  name: string
  organizationId: string
  source: CatalogMasterSource
}

type CatalogMasterRepositoryOptions = {
  connectionString: string
  kind: CatalogMasterKind
}

type CatalogMasterRow = {
  created_at: Date
  id: string
  name: string
  organization_id: string
  source_id: string
  source_payload: Record<string, unknown> | null
  source_system: string
  source_table: string
  updated_at: Date
}

const tables: Record<CatalogMasterKind, string> = {
  machineType: "catalog.machine_types",
  materialGrade: "catalog.material_grades",
  rodType: "catalog.rod_types",
}

function mapMaster(row: CatalogMasterRow) {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
    sourceId: row.source_id,
    sourcePayload: row.source_payload,
    sourceSystem: row.source_system,
    sourceTable: row.source_table,
    updatedAt: row.updated_at,
  }
}

export function createCatalogMasterRepository({
  connectionString,
  kind,
}: CatalogMasterRepositoryOptions) {
  const pool = new Pool({ connectionString })
  const table = tables[kind]

  return {
    close: () => pool.end(),

    async create(input: CreateCatalogMaster) {
      const name = input.name.trim()
      if (!name) {
        throw new Error("Catalog master name is required.")
      }

      const inserted = await pool.query<CatalogMasterRow>(
        `INSERT INTO ${table} (
           organization_id,
           name,
           source_system,
           source_table,
           source_id,
           source_payload
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          input.organizationId,
          name,
          input.source.system,
          input.source.table,
          input.source.id,
          input.source.payload ?? null,
        ]
      )
      const created = inserted.rows[0]
      if (created) {
        return mapMaster(created)
      }

      const existing = await pool.query<CatalogMasterRow>(
        `SELECT *
         FROM ${table}
         WHERE organization_id = $1
           AND lower(name) = lower($2)`,
        [input.organizationId, name]
      )
      if (!existing.rows[0]) {
        throw new Error("Catalog master was not created.")
      }

      return mapMaster(existing.rows[0])
    },

    async list(organizationId: string) {
      const result = await pool.query<CatalogMasterRow>(
        `SELECT *
         FROM ${table}
         WHERE organization_id = $1
         ORDER BY lower(name)`,
        [organizationId]
      )

      return result.rows.map(mapMaster)
    },

    async listForOrganization(organizationCode: string) {
      const result = await pool.query<CatalogMasterRow>(
        `SELECT masters.*
         FROM ${table} AS masters
         JOIN core.organizations
           ON organizations.id = masters.organization_id
         WHERE lower(organizations.code) = lower($1)
         ORDER BY lower(masters.name)`,
        [organizationCode.trim()]
      )

      return result.rows.map(mapMaster)
    },
  }
}
