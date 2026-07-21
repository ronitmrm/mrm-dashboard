import type { PoolClient } from "pg"

type DirectMapping = {
  entryTypes?: string[]
  sourceTable: string
  targetJsonColumn?: string
  targetSchema: string
  targetTable: string
  targetRunScoped?: boolean
}

const DIRECT_MAPPINGS: DirectMapping[] = [
  {
    entryTypes: ["employee"],
    sourceTable: "dataEntries",
    targetSchema: "workforce",
    targetTable: "employees",
  },
  {
    entryTypes: ["machine_master"],
    sourceTable: "dataEntries",
    targetSchema: "catalog",
    targetTable: "machines",
  },
  {
    entryTypes: ["route"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "operation_setups",
  },
  {
    entryTypes: ["cycle"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "operation_cycle_standards",
  },
  {
    entryTypes: ["tooling"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "operation_tooling",
  },
  {
    entryTypes: ["work_order"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "work_orders",
  },
  {
    entryTypes: ["rm_inward"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "raw_material_receipts",
  },
  {
    entryTypes: ["first_piece_inspection_master", "quality_parameter_master"],
    sourceTable: "dataEntries",
    targetSchema: "quality",
    targetTable: "parameter_definitions",
  },
  {
    entryTypes: ["first_piece_inspection_report"],
    sourceTable: "dataEntries",
    targetSchema: "quality",
    targetTable: "first_piece_inspections",
  },
  {
    entryTypes: ["hourly_quality_check"],
    sourceTable: "dataEntries",
    targetSchema: "quality",
    targetTable: "hourly_checks",
  },
  {
    entryTypes: ["setup_checklist_master"],
    sourceTable: "dataEntries",
    targetSchema: "quality",
    targetTable: "setup_checklist_template_items",
  },
  {
    entryTypes: ["setup_checklist", "setup_checklist_session"],
    sourceTable: "dataEntries",
    targetSchema: "quality",
    targetTable: "setup_checklist_sessions",
  },
  {
    entryTypes: ["shop_floor_status"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "shop_floor_stage_events",
  },
  {
    entryTypes: ["production_card"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "production_cards",
  },
  {
    entryTypes: ["maintenance_checklist_master"],
    sourceTable: "dataEntries",
    targetSchema: "maintenance",
    targetTable: "checklist_items",
  },
  {
    entryTypes: [
      "rejection_classification",
      "machine_planning",
      "raw_material_plan",
      "quality_inspection",
      "meeting_action",
    ],
    sourceTable: "dataEntries",
    targetJsonColumn: "evidence",
    targetRunScoped: true,
    targetSchema: "migration",
    targetTable: "type_conflicts",
  },
  {
    entryTypes: ["software_raw"],
    sourceTable: "dataEntries",
    targetSchema: "manufacturing",
    targetTable: "production_entries",
  },
  {
    sourceTable: "productionEntries",
    targetSchema: "manufacturing",
    targetTable: "production_entries",
  },
  {
    sourceTable: "routeSelections",
    targetSchema: "manufacturing",
    targetTable: "route_selections",
  },
  {
    sourceTable: "plannerPriorities",
    targetSchema: "manufacturing",
    targetTable: "planner_priority_events",
  },
  {
    sourceTable: "machineConstraints",
    targetSchema: "manufacturing",
    targetTable: "machine_constraint_events",
  },
  {
    sourceTable: "planOverrides",
    targetSchema: "manufacturing",
    targetTable: "plan_override_events",
  },
]

async function mapAndHashDirectRows(
  client: PoolClient,
  mapping: DirectMapping,
  options: {
    migrationRunId: string
    transformationVersion: string
  }
) {
  const mapEntryFilter = mapping.entryTypes
    ? "AND source.document->>'entryType' = ANY($6::text[])"
    : ""
  const hashEntryFilter = mapping.entryTypes
    ? "AND source.document->>'entryType' = ANY($4::text[])"
    : ""
  const runFilter = mapping.targetRunScoped
    ? "AND target.migration_run_id = $1"
    : ""
  const targetJsonColumn = mapping.targetJsonColumn ?? "source_payload"
  const parameters = [
    options.migrationRunId,
    options.transformationVersion,
    mapping.sourceTable,
    mapping.targetSchema,
    mapping.targetTable,
    mapping.entryTypes ?? [],
  ]

  await client.query(
    `
      INSERT INTO migration.source_id_map (
        source_system, source_table, source_id, target_schema, target_table,
        target_id, migration_run_id, transformation_version
      )
      SELECT 'convex', $3, source.source_id, $4, $5, target.id, $1, $2
      FROM migration.convex_documents source
      JOIN ${mapping.targetSchema}.${mapping.targetTable} target
        ON target.source_system = 'convex'
       AND target.source_table = $3
       AND target.source_id = source.source_id
       ${runFilter}
      WHERE source.migration_run_id = $1
        AND source.source_table = $3
        ${mapEntryFilter}
      ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        migration_run_id = EXCLUDED.migration_run_id,
        transformation_version = EXCLUDED.transformation_version,
        mapped_at = now()
    `,
    mapping.entryTypes ? parameters : parameters.slice(0, 5)
  )
  await client.query(
    `
      INSERT INTO migration.source_hashes (
        migration_run_id, source_system, source_table, source_id,
        source_hash, target_hash, transformation_version
      )
      SELECT $1, 'convex', $3, source.source_id,
        encode(digest(source.document::text, 'sha256'), 'hex'),
        encode(digest(target.${targetJsonColumn}::text, 'sha256'), 'hex'),
        $2
      FROM migration.convex_documents source
      JOIN ${mapping.targetSchema}.${mapping.targetTable} target
        ON target.source_system = 'convex'
       AND target.source_table = $3
       AND target.source_id = source.source_id
       ${runFilter}
      WHERE source.migration_run_id = $1
        AND source.source_table = $3
        ${hashEntryFilter}
      ON CONFLICT (migration_run_id, source_system, source_table, source_id)
      DO UPDATE SET
        source_hash = EXCLUDED.source_hash,
        target_hash = EXCLUDED.target_hash,
        transformation_version = EXCLUDED.transformation_version,
        exception_reason = NULL
    `,
    mapping.entryTypes
      ? [
          options.migrationRunId,
          options.transformationVersion,
          mapping.sourceTable,
          mapping.entryTypes,
        ]
      : [
          options.migrationRunId,
          options.transformationVersion,
          mapping.sourceTable,
        ]
  )
}

async function transformCorrections(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
    transformationVersion: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.legacy_convex_corrections (
        organization_id, source_id, target_source_table, target_source_id,
        target_schema, target_table, target_id, correction_type, reason,
        legacy_actor, original_timestamp, resolved, source_payload
      )
      SELECT $2, correction.source_id,
        correction.document->>'targetTable',
        correction.document->>'targetId',
        target.target_schema, target.target_table, target.target_id,
        COALESCE(correction.document->>'action', 'reverse'),
        correction.document->>'reason',
        correction.document->>'correctedBy',
        COALESCE(
          migration.try_timestamptz(correction.document->>'createdAt'),
          to_timestamp(correction.source_creation_time / 1000.0)
        ),
        target.target_id IS NOT NULL,
        correction.document
      FROM migration.convex_documents correction
      LEFT JOIN migration.source_id_map target
        ON target.source_system = 'convex'
       AND target.source_table = correction.document->>'targetTable'
       AND target.source_id = correction.document->>'targetId'
       AND target.migration_run_id = $1
      WHERE correction.migration_run_id = $1
        AND correction.source_table = 'corrections'
      ON CONFLICT (source_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        target_source_table = EXCLUDED.target_source_table,
        target_source_id = EXCLUDED.target_source_id,
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        correction_type = EXCLUDED.correction_type,
        reason = EXCLUDED.reason,
        legacy_actor = EXCLUDED.legacy_actor,
        original_timestamp = EXCLUDED.original_timestamp,
        resolved = EXCLUDED.resolved,
        source_payload = EXCLUDED.source_payload
    `,
    [options.migrationRunId, options.organizationId]
  )
  await client.query(
    `
      INSERT INTO audit.record_reversals (
        organization_id, target_schema, target_table, target_id,
        legacy_actor, reason, reversed_at, source_correction_system,
        source_correction_id, evidence
      )
      SELECT $2, target_schema, target_table, target_id, legacy_actor,
        COALESCE(NULLIF(reason, ''), 'Legacy Convex correction'),
        COALESCE(original_timestamp, now()), 'convex', source_id,
        source_payload
      FROM audit.legacy_convex_corrections
      WHERE source_id IN (
        SELECT source_id FROM migration.convex_documents
        WHERE migration_run_id = $1 AND source_table = 'corrections'
      )
        AND resolved
      ON CONFLICT (source_correction_system, source_correction_id)
      DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        legacy_actor = EXCLUDED.legacy_actor,
        reason = EXCLUDED.reason,
        reversed_at = EXCLUDED.reversed_at,
        evidence = EXCLUDED.evidence
    `,
    [options.migrationRunId, options.organizationId]
  )
  await client.query(
    `
      INSERT INTO migration.orphan_corrections (
        migration_run_id, source_system, source_table, source_id, evidence
      )
      SELECT $1, 'convex', 'corrections', correction.source_id,
        correction.document
      FROM migration.convex_documents correction
      JOIN audit.legacy_convex_corrections imported
        ON imported.source_id = correction.source_id
      WHERE correction.migration_run_id = $1
        AND correction.source_table = 'corrections'
        AND NOT imported.resolved
        AND NOT EXISTS (
          SELECT 1 FROM migration.orphan_corrections existing
          WHERE existing.migration_run_id = $1
            AND existing.source_system = 'convex'
            AND existing.source_id = correction.source_id
        )
    `,
    [options.migrationRunId]
  )
  await client.query(
    `
      INSERT INTO migration.source_id_map (
        source_system, source_table, source_id, target_schema, target_table,
        target_id, migration_run_id, transformation_version
      )
      SELECT 'convex', 'corrections', correction.source_id, 'audit',
        'legacy_convex_corrections', target.id, $1, $2
      FROM migration.convex_documents correction
      JOIN audit.legacy_convex_corrections target
        ON target.source_id = correction.source_id
      WHERE correction.migration_run_id = $1
        AND correction.source_table = 'corrections'
      ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        migration_run_id = EXCLUDED.migration_run_id,
        transformation_version = EXCLUDED.transformation_version,
        mapped_at = now()
    `,
    [options.migrationRunId, options.transformationVersion]
  )
  await client.query(
    `
      INSERT INTO migration.source_hashes (
        migration_run_id, source_system, source_table, source_id,
        source_hash, target_hash, transformation_version
      )
      SELECT $1, 'convex', 'corrections', correction.source_id,
        encode(digest(correction.document::text, 'sha256'), 'hex'),
        encode(digest(target.source_payload::text, 'sha256'), 'hex'),
        $2
      FROM migration.convex_documents correction
      JOIN audit.legacy_convex_corrections target
        ON target.source_id = correction.source_id
      WHERE correction.migration_run_id = $1
        AND correction.source_table = 'corrections'
      ON CONFLICT (migration_run_id, source_system, source_table, source_id)
      DO UPDATE SET
        source_hash = EXCLUDED.source_hash,
        target_hash = EXCLUDED.target_hash,
        transformation_version = EXCLUDED.transformation_version,
        exception_reason = NULL
    `,
    [options.migrationRunId, options.transformationVersion]
  )
}

async function writeValidationResults(
  client: PoolClient,
  migrationRunId: string
) {
  await client.query(
    `
      WITH expected AS (
        SELECT document->>'entryType' AS scope, count(*)::bigint expected_rows
        FROM migration.convex_documents
        WHERE migration_run_id = $1
          AND source_table = 'dataEntries'
          AND document->>'entryType' <> '_summary'
        GROUP BY document->>'entryType'
      ),
      actual AS (
        SELECT document->>'entryType' AS scope, count(*)::bigint actual_rows
        FROM migration.convex_documents source
        JOIN migration.source_id_map mapping
          ON mapping.source_system = 'convex'
         AND mapping.source_table = 'dataEntries'
         AND mapping.source_id = source.source_id
         AND mapping.migration_run_id = $1
        WHERE source.migration_run_id = $1
          AND source.source_table = 'dataEntries'
          AND source.document->>'entryType' <> '_summary'
        GROUP BY document->>'entryType'
      )
      INSERT INTO migration.validation_results (
        migration_run_id, check_key, scope, status, expected_value,
        actual_value, details
      )
      SELECT $1, 'convex_entry_type_row_count', expected.scope,
        CASE WHEN expected.expected_rows = COALESCE(actual.actual_rows, 0)
          THEN 'pass' ELSE 'fail' END,
        to_jsonb(expected.expected_rows),
        to_jsonb(COALESCE(actual.actual_rows, 0)),
        '{}'::jsonb
      FROM expected LEFT JOIN actual USING (scope)
      ON CONFLICT (migration_run_id, check_key, scope) DO UPDATE SET
        status = EXCLUDED.status,
        expected_value = EXCLUDED.expected_value,
        actual_value = EXCLUDED.actual_value,
        checked_at = now()
    `,
    [migrationRunId]
  )
  await client.query(
    `
      WITH expected AS (
        SELECT entry->>'name' AS scope,
          (entry->>'rowCount')::bigint AS expected_rows
        FROM migration.artifacts artifact
        CROSS JOIN LATERAL jsonb_array_elements(artifact.table_inventory) entry
        WHERE artifact.migration_run_id = $1
          AND artifact.source_kind = 'convex'
          AND entry->>'disposition' = 'canonical'
          AND entry->>'name' <> 'dataEntries'
      ),
      actual AS (
        SELECT source_table AS scope, count(*)::bigint AS actual_rows
        FROM migration.source_id_map
        WHERE migration_run_id = $1 AND source_system = 'convex'
          AND source_table <> 'dataEntries'
        GROUP BY source_table
      )
      INSERT INTO migration.validation_results (
        migration_run_id, check_key, scope, status, expected_value,
        actual_value, details
      )
      SELECT $1, 'convex_physical_table_row_count', expected.scope,
        CASE WHEN expected.expected_rows = COALESCE(actual.actual_rows, 0)
          THEN 'pass' ELSE 'fail' END,
        to_jsonb(expected.expected_rows),
        to_jsonb(COALESCE(actual.actual_rows, 0)),
        '{}'::jsonb
      FROM expected LEFT JOIN actual USING (scope)
      ON CONFLICT (migration_run_id, check_key, scope) DO UPDATE SET
        status = EXCLUDED.status,
        expected_value = EXCLUDED.expected_value,
        actual_value = EXCLUDED.actual_value,
        checked_at = now()
    `,
    [migrationRunId]
  )

  const overlap = await client.query<{
    physical_rows: string
    software_rows: string
  }>(
    `
      SELECT
        count(*) FILTER (
          WHERE source_table = 'productionEntries'
        )::text AS physical_rows,
        count(*) FILTER (
          WHERE source_table = 'dataEntries'
            AND document->>'entryType' = 'software_raw'
        )::text AS software_rows
      FROM migration.convex_documents
      WHERE migration_run_id = $1
    `,
    [migrationRunId]
  )
  const physicalRows = overlap.rows[0]?.physical_rows ?? "0"
  const softwareRows = overlap.rows[0]?.software_rows ?? "0"
  await client.query(
    `
      INSERT INTO migration.validation_results (
        migration_run_id, check_key, scope, status, expected_value,
        actual_value, details
      )
      VALUES (
        $1, 'convex_production_overlap', 'production',
        CASE WHEN $2::bigint > 0 AND $3::bigint > 0
          THEN 'warning' ELSE 'pass' END,
        NULL,
        jsonb_build_object(
          'physicalProductionRows', $2::bigint,
          'softwareProductionRows', $3::bigint
        ),
        jsonb_build_object(
          'rule', 'retain both sources with explicit provenance'
        )
      )
      ON CONFLICT (migration_run_id, check_key, scope) DO UPDATE SET
        status = EXCLUDED.status,
        actual_value = EXCLUDED.actual_value,
        details = EXCLUDED.details,
        checked_at = now()
    `,
    [migrationRunId, physicalRows, softwareRows]
  )
}

export async function reconcileConvexSnapshot(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
    transformationVersion: string
  }
) {
  for (const mapping of DIRECT_MAPPINGS) {
    await mapAndHashDirectRows(client, mapping, options)
  }
  await transformCorrections(client, options)
  await writeValidationResults(client, options.migrationRunId)

  const failures = await client.query<{ scope: string }>(
    `
      SELECT check_key || ':' || scope AS scope
      FROM migration.validation_results
      WHERE migration_run_id = $1 AND status = 'fail'
      UNION ALL
      SELECT 'unknown_entry_type:' || entry_type
      FROM migration.unknown_entry_types
      WHERE migration_run_id = $1 AND status = 'open'
      UNION ALL
      SELECT 'hash_mismatch:' || source_table || ':' || source_id
      FROM migration.source_hashes
      WHERE migration_run_id = $1
        AND source_system = 'convex'
        AND source_hash IS DISTINCT FROM target_hash
      ORDER BY scope
    `,
    [options.migrationRunId]
  )
  if (failures.rowCount) {
    throw new Error(
      `Convex reconciliation failed for: ${failures.rows
        .map((row) => row.scope)
        .join(", ")}`
    )
  }
}
