import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

const masterTargets = {
  commercial_application: ["catalog", "website_applications", "id"],
  commercial_category: ["catalog", "item_categories", "id"],
  commercial_certification: ["catalog", "website_certifications", "id"],
  commercial_machine_type: ["catalog", "machine_types", "id"],
  commercial_material_grade: ["catalog", "material_grades", "id"],
  commercial_process: ["catalog", "design_processes", "id"],
  commercial_rod_type: ["catalog", "rod_types", "id"],
  commercial_subcategory: ["catalog", "item_subcategories", "id"],
  commercial_website_field: ["catalog", "website_field_options", "id"],
  commercial_commercial_term: ["sales", "commercial_terms", "id"],
  commercial_material_rate: ["sales", "material_rates", "id"],
  commercial_packaging: ["sales", "packaging_options", "id"],
  commercial_quote_term: ["sales", "quote_term_templates", "id"],
  commercial_shipping: ["sales", "shipping_terms", "id"],
  cycle: ["manufacturing", "operation_cycle_standards", "source_id"],
  hr_department: ["recruitment", "departments", "id"],
  hr_designation: ["recruitment", "designations", "id"],
  hr_job_template: ["recruitment", "requirement_templates", "id"],
  machine_master: ["catalog", "machines", "source_id"],
  maintenance_checklist_master: ["maintenance", "checklist_items", "source_id"],
  maintenance_master: ["maintenance", "definitions", "source_id"],
  planning_holiday: [
    "manufacturing",
    "planning_calendar_exceptions",
    "source_id",
  ],
  quality_parameter_master: ["quality", "parameter_definitions", "source_id"],
  rejection_reason_master: ["quality", "rejection_reasons", "source_id"],
  rejection_remark_master: ["quality", "rejection_remarks", "source_id"],
  rejection_type_master: ["quality", "rejection_types", "source_id"],
  route: ["manufacturing", "operation_setups", "source_id"],
  setup_checklist_master: [
    "quality",
    "setup_checklist_template_items",
    "source_id",
  ],
  store_asset_name: ["store", "asset_names", "id"],
  store_category: ["store", "asset_categories", "id"],
  store_item_type: ["store", "item_types", "id"],
  store_location: ["store", "locations", "id"],
  store_subcategory: ["store", "asset_subcategories", "id"],
  store_supplier: ["store", "suppliers", "id"],
  store_supplier_price: ["store", "supplier_prices", "id"],
  store_vendor: ["store", "vendors", "id"],
  tooling: ["manufacturing", "operation_tooling", "source_id"],
} as const satisfies Record<
  string,
  readonly [string, string, "id" | "source_id"]
>

const renamableMasterColumns: Partial<
  Record<keyof typeof masterTargets, string>
> = {
  commercial_application: "name",
  commercial_category: "name",
  commercial_certification: "name",
  commercial_commercial_term: "name",
  commercial_machine_type: "name",
  commercial_material_grade: "name",
  commercial_packaging: "name",
  commercial_process: "name",
  commercial_quote_term: "label",
  commercial_rod_type: "name",
  commercial_shipping: "name",
  commercial_subcategory: "name",
  commercial_website_field: "option_value",
}

export type MasterDataKind = keyof typeof masterTargets

export function isMasterDataKind(value: string): value is MasterDataKind {
  return value in masterTargets
}

type ReferenceColumn = {
  columnName: string
  schemaName: string
  tableName: string
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function qualifiedTable(schemaName: string, tableName: string) {
  return `${identifier(schemaName)}.${identifier(tableName)}`
}

async function referenceColumns(
  client: PoolClient,
  schemaName: string,
  tableName: string
) {
  const result = await client.query<ReferenceColumn>(
    `
      SELECT referencing_namespace.nspname AS "schemaName",
        referencing_table.relname AS "tableName",
        referencing_column.attname AS "columnName"
      FROM pg_constraint foreign_key
      JOIN pg_class referenced_table
        ON referenced_table.oid = foreign_key.confrelid
      JOIN pg_namespace referenced_namespace
        ON referenced_namespace.oid = referenced_table.relnamespace
      JOIN pg_class referencing_table
        ON referencing_table.oid = foreign_key.conrelid
      JOIN pg_namespace referencing_namespace
        ON referencing_namespace.oid = referencing_table.relnamespace
      JOIN pg_attribute referencing_column
        ON referencing_column.attrelid = foreign_key.conrelid
       AND referencing_column.attnum = foreign_key.conkey[1]
      JOIN pg_attribute referenced_column
        ON referenced_column.attrelid = foreign_key.confrelid
       AND referenced_column.attnum = foreign_key.confkey[1]
      WHERE foreign_key.contype = 'f'
        AND array_length(foreign_key.conkey, 1) = 1
        AND array_length(foreign_key.confkey, 1) = 1
        AND referenced_namespace.nspname = $1
        AND referenced_table.relname = $2
        AND referenced_column.attname = 'id'
      ORDER BY referencing_namespace.nspname, referencing_table.relname,
        referencing_column.attname
    `,
    [schemaName, tableName]
  )
  return result.rows
}

async function masterRow(
  client: PoolClient,
  target: (typeof masterTargets)[MasterDataKind],
  organizationId: string,
  recordId: string
) {
  const [schemaName, tableName, lookupColumn] = target
  const result = await client.query<{ id: string; snapshot: unknown }>(
    `SELECT target.id, to_jsonb(target) AS snapshot
     FROM ${qualifiedTable(schemaName, tableName)} target
     WHERE target.organization_id = $1
       AND target.${identifier(lookupColumn)}::text = $2
     FOR UPDATE`,
    [organizationId, recordId]
  )
  return result.rows[0]
}

async function syncReplacementDisplayValues(
  client: PoolClient,
  kind: MasterDataKind,
  organizationId: string,
  replacementId: string
) {
  if (kind === "store_category") {
    await client.query(
      `UPDATE store.item_types item
       SET asset_category = category.name, updated_at = now()
       FROM store.asset_categories category
       WHERE item.organization_id = $1 AND category.id = $2
         AND item.asset_category_id = category.id`,
      [organizationId, replacementId]
    )
  }
  if (kind === "store_subcategory") {
    await client.query(
      `UPDATE store.item_types item
       SET asset_subcategory = subcategory.name,
         asset_category_id = category.id, asset_category = category.name,
         updated_at = now()
       FROM store.asset_subcategories subcategory
       JOIN store.asset_categories category ON category.id = subcategory.category_id
       WHERE item.organization_id = $1 AND subcategory.id = $2
         AND item.asset_subcategory_id = subcategory.id`,
      [organizationId, replacementId]
    )
  }
  if (kind === "store_asset_name") {
    await client.query(
      `UPDATE store.item_types item
       SET asset_name = asset_name.name,
         asset_subcategory_id = subcategory.id,
         asset_subcategory = subcategory.name,
         asset_category_id = category.id, asset_category = category.name,
         updated_at = now()
       FROM store.asset_names asset_name
       JOIN store.asset_subcategories subcategory ON subcategory.id = asset_name.subcategory_id
       JOIN store.asset_categories category ON category.id = subcategory.category_id
       WHERE item.organization_id = $1 AND asset_name.id = $2
         AND item.asset_name_id = asset_name.id`,
      [organizationId, replacementId]
    )
  }
}

export function createMasterDataLifecycleRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async renameMaster(input: {
      actorUserId?: string | null
      kind: MasterDataKind
      name: string
      organizationId: string
      recordId: string
    }) {
      return withTransaction(pool, async (client) => {
        const target = masterTargets[input.kind]
        const nameColumn = renamableMasterColumns[input.kind]
        if (!nameColumn)
          throw new Error("This master name cannot be changed here.")
        const recordId = requiredText(input.recordId, "Master record")
        const name = requiredText(input.name, "Master name")
        const source = await masterRow(
          client,
          target,
          input.organizationId,
          recordId
        )
        if (!source) throw new Error("Master record was not found.")
        const [schemaName, tableName] = target
        await client.query(
          `UPDATE ${qualifiedTable(schemaName, tableName)}
           SET ${identifier(nameColumn)} = $1,
             ${input.kind === "commercial_website_field" ? "label = $1," : ""}
             updated_at = now()
           WHERE id = $2 AND organization_id = $3`,
          [name, source.id, input.organizationId]
        )
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table,
             target_id, actor_user_id, reason, before_state, after_state,
             metadata, source_system, source_table, source_id
           ) VALUES ($1, 'master_data.renamed', $2, $3, $4, $5,
             'Master name corrected', $6, $7, $8, 'mrm-dashboard',
             'master_data_lifecycle', $9)`,
          [
            input.organizationId,
            schemaName,
            tableName,
            source.id,
            input.actorUserId ?? null,
            source.snapshot,
            {
              ...((source.snapshot as Record<string, unknown>) ?? {}),
              [nameColumn]: name,
            },
            { kind: input.kind, nameColumn },
            randomUUID(),
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { id: source.id, renamed: true }
      })
    },

    async deleteMaster(input: {
      actorUserId?: string | null
      kind: MasterDataKind
      organizationId: string
      reason: string
      recordId: string
      replacementRecordId?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const target = masterTargets[input.kind]
        const recordId = requiredText(input.recordId, "Master record")
        const reason = requiredText(input.reason, "Deletion reason")
        const source = await masterRow(
          client,
          target,
          input.organizationId,
          recordId
        )
        if (!source) throw new Error("Master record was not found.")

        const replacementRecordId = input.replacementRecordId?.trim() || null
        if (replacementRecordId === recordId) {
          throw new Error("Select a different replacement master.")
        }
        const replacement = replacementRecordId
          ? await masterRow(
              client,
              target,
              input.organizationId,
              replacementRecordId
            )
          : null
        if (replacementRecordId && !replacement) {
          throw new Error("Replacement master was not found.")
        }

        const [schemaName, tableName] = target
        const references = await referenceColumns(client, schemaName, tableName)
        const usedReferences: Array<ReferenceColumn & { count: number }> = []
        for (const reference of references) {
          const count = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count
             FROM ${qualifiedTable(reference.schemaName, reference.tableName)}
             WHERE ${identifier(reference.columnName)} = $1`,
            [source.id]
          )
          const referenceCount = Number(count.rows[0]?.count ?? 0)
          if (referenceCount) {
            usedReferences.push({ ...reference, count: referenceCount })
          }
        }

        const usageCount = usedReferences.reduce(
          (total, reference) => total + reference.count,
          0
        )
        if (usageCount && !replacement) {
          throw new Error(
            `This master is used by ${usageCount} record${usageCount === 1 ? "" : "s"}. Select a replacement before deleting it.`
          )
        }

        if (replacement) {
          if (input.kind === "store_supplier") {
            await client.query(
              `UPDATE store.supplier_prices source_price
               SET active = false, superseded_at = now()
               WHERE source_price.supplier_id = $1 AND source_price.active
                 AND EXISTS (
                   SELECT 1 FROM store.supplier_prices replacement_price
                   WHERE replacement_price.organization_id = source_price.organization_id
                     AND replacement_price.item_type_id = source_price.item_type_id
                     AND replacement_price.supplier_id = $2
                     AND replacement_price.active
                 )`,
              [source.id, replacement.id]
            )
          }
          if (input.kind === "store_item_type") {
            await client.query(
              `UPDATE store.supplier_prices source_price
               SET active = false, superseded_at = now()
               WHERE source_price.item_type_id = $1 AND source_price.active
                 AND EXISTS (
                   SELECT 1 FROM store.supplier_prices replacement_price
                   WHERE replacement_price.organization_id = source_price.organization_id
                     AND replacement_price.item_type_id = $2
                     AND replacement_price.supplier_id = source_price.supplier_id
                     AND replacement_price.active
                 )`,
              [source.id, replacement.id]
            )
            await client.query(
              `UPDATE store.documents source_drawing
               SET document_type = 'OTHER'
               WHERE source_drawing.item_type_id = $1
                 AND source_drawing.document_type = 'ASSET_DRAWING'
                 AND EXISTS (
                   SELECT 1 FROM store.documents replacement_drawing
                   WHERE replacement_drawing.organization_id = source_drawing.organization_id
                     AND replacement_drawing.item_type_id = $2
                     AND replacement_drawing.document_type = 'ASSET_DRAWING'
                 )`,
              [source.id, replacement.id]
            )
          }
          for (const reference of usedReferences) {
            await client.query(
              `UPDATE ${qualifiedTable(reference.schemaName, reference.tableName)}
               SET ${identifier(reference.columnName)} = $1
               WHERE ${identifier(reference.columnName)} = $2`,
              [replacement.id, source.id]
            )
          }
          await syncReplacementDisplayValues(
            client,
            input.kind,
            input.organizationId,
            replacement.id
          )
        }

        const deleted = await client.query<{ deleted: boolean }>(
          `SELECT core.delete_master_record($1, $2, $3, $4) AS deleted`,
          [schemaName, tableName, input.organizationId, source.id]
        )
        if (!deleted.rows[0]?.deleted) {
          throw new Error("Master record could not be deleted.")
        }
        await client.query(
          `INSERT INTO audit.events (
             organization_id, event_type, target_schema, target_table,
             target_id, actor_user_id, reason, metadata, source_system,
             source_table, source_id
           ) VALUES ($1, 'master_data.deleted', $2, $3, $4, $5, $6, $7,
             'mrm-dashboard', 'master_data_lifecycle', $8)`,
          [
            input.organizationId,
            schemaName,
            tableName,
            source.id,
            input.actorUserId ?? null,
            reason,
            {
              kind: input.kind,
              previous: source.snapshot,
              references: usedReferences,
              replacementId: replacement?.id ?? null,
              usageCount,
            },
            randomUUID(),
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return {
          deleted: true,
          replacementId: replacement?.id ?? null,
          usageCount,
        }
      })
    },
  }
}
