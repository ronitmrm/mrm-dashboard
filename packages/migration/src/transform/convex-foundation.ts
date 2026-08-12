import type { PoolClient } from "pg"

const FOUNDATION_STATEMENTS = [
  `
    INSERT INTO manufacturing.production_floors (
      organization_id, code, name
    )
    SELECT $2, 'conventional', 'Production Planning & Control Conventional-01'
    WHERE $1::uuid IS NOT NULL
    ON CONFLICT (organization_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      active = true,
      updated_at = now()
  `,
  `
    WITH source_refs AS (
      SELECT btrim(
        CASE document->>'entryType'
          WHEN 'cycle' THEN document->'payload'->>'partNo'
          WHEN 'first_piece_inspection_master'
            THEN COALESCE(document->'payload'->>'uid', document->'payload'->>'partNo')
          WHEN 'first_piece_inspection_report' THEN document->'payload'->>'partCode'
          WHEN 'hourly_quality_check' THEN document->'payload'->>'partCode'
          WHEN 'production_card' THEN document->'payload'->>'partCode'
          WHEN 'quality_parameter_master' THEN document->'payload'->>'partNo'
          WHEN 'rm_inward' THEN document->'payload'->>'partCode'
          WHEN 'route' THEN document->'payload'->>'partNo'
          WHEN 'setup_checklist' THEN document->'payload'->>'partNo'
          WHEN 'setup_checklist_session' THEN document->'payload'->>'partCode'
          WHEN 'shop_floor_status' THEN document->'payload'->>'partCode'
          WHEN 'tooling' THEN document->'payload'->>'partNo'
          WHEN 'work_order' THEN document->'payload'->>'partCode'
        END
      ) AS part_code
      FROM migration.convex_documents
      WHERE migration_run_id = $1 AND source_table = 'dataEntries'
      UNION
      SELECT btrim(document->>'partCode')
      FROM migration.convex_documents
      WHERE migration_run_id = $1 AND source_table = 'productionEntries'
    )
    INSERT INTO catalog.items (
      organization_id, uid, description, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, part_code, part_code, 'convex', 'part_reference',
      lower(part_code),
      jsonb_build_object('partCode', part_code, 'generatedFrom', 'convex')
    FROM source_refs
    WHERE part_code IS NOT NULL AND part_code <> ''
    ON CONFLICT (organization_id, lower(uid)) DO NOTHING
  `,
  `
    WITH names AS (
      SELECT DISTINCT btrim(COALESCE(
        document->'payload'->>'MACHINE TYPE',
        document->'payload'->>'machineType'
      )) AS name
      FROM migration.convex_documents
      WHERE migration_run_id = $1
        AND source_table = 'dataEntries'
    )
    INSERT INTO catalog.machine_types (
      organization_id, name, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, name, 'convex', 'machine_type_reference', lower(name),
      jsonb_build_object('name', name, 'generatedFrom', 'convex')
    FROM names WHERE name IS NOT NULL AND name <> ''
    ON CONFLICT (organization_id, lower(name)) DO NOTHING
  `,
  `
    INSERT INTO catalog.machines (
      organization_id, production_floor_id, machine_number, name,
      machine_type_id, active, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, production_floor.id,
      btrim(COALESCE(
        source.document->'payload'->>'M/C NO',
        source.document->'payload'->>'machineNo'
      )),
      COALESCE(
        source.document->'payload'->>'MACHINE NAME',
        source.document->'payload'->>'machineName'
      ),
      machine_type.id,
      lower(COALESCE(
        source.document->'payload'->>'Status',
        source.document->'payload'->>'status',
        'active'
      )) NOT IN ('inactive', 'disabled'),
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents AS source
    JOIN manufacturing.production_floors AS production_floor
      ON production_floor.organization_id = $2
     AND production_floor.code = 'conventional'
    LEFT JOIN catalog.machine_types AS machine_type
      ON machine_type.organization_id = $2
     AND lower(machine_type.name) = lower(btrim(COALESCE(
       source.document->'payload'->>'MACHINE TYPE',
       source.document->'payload'->>'machineType'
     )))
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'machine_master'
      AND btrim(COALESCE(
        source.document->'payload'->>'M/C NO',
        source.document->'payload'->>'machineNo',
        ''
      )) <> ''
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      production_floor_id = EXCLUDED.production_floor_id,
      machine_number = EXCLUDED.machine_number,
      name = EXCLUDED.name,
      machine_type_id = EXCLUDED.machine_type_id,
      active = EXCLUDED.active,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.machines.row_version + 1
    WHERE catalog.machines.source_payload IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH source_refs AS (
      SELECT DISTINCT btrim(COALESCE(
        document->'payload'->>'machine',
        document->'payload'->>'machineNo',
        document->'payload'->>'machineUsed'
      )) AS machine_number
      FROM migration.convex_documents
      WHERE migration_run_id = $1
    )
    INSERT INTO catalog.machines (
      organization_id, production_floor_id, machine_number, name, active,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, production_floor.id, machine_number, machine_number, true,
      'convex',
      'machine_reference', lower(machine_number),
      jsonb_build_object(
        'machineNumber', machine_number,
        'generatedFrom', 'convex reference'
      )
    FROM source_refs AS reference
    JOIN manufacturing.production_floors AS production_floor
      ON production_floor.organization_id = $2
     AND production_floor.code = 'conventional'
    WHERE machine_number IS NOT NULL AND machine_number <> ''
      AND NOT EXISTS (
        SELECT 1 FROM catalog.machines AS machine
        WHERE machine.organization_id = $2
          AND machine.production_floor_id = production_floor.id
          AND lower(machine.machine_number) = lower(reference.machine_number)
      )
    ON CONFLICT (
      organization_id, production_floor_id, lower(machine_number)
    ) DO NOTHING
  `,
  `
    INSERT INTO workforce.employees (
      organization_id, employee_code, name, department, designation, active,
      joined_on, source_system, source_table, source_id, source_payload
    )
    SELECT $2,
      btrim(COALESCE(
        source.document->'payload'->>'empId',
        source.document->>'key',
        source.source_id
      )),
      COALESCE(
        NULLIF(btrim(source.document->'payload'->>'employeeName'), ''),
        source.document->'payload'->>'empId',
        source.source_id
      ),
      source.document->'payload'->>'location',
      source.document->'payload'->>'employeeType',
      lower(COALESCE(source.document->'payload'->>'status', 'active'))
        NOT IN ('inactive', 'left', 'disabled'),
      migration.try_date(source.document->'payload'->>'doj'),
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents AS source
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'employee'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      employee_code = EXCLUDED.employee_code,
      name = EXCLUDED.name,
      department = EXCLUDED.department,
      designation = EXCLUDED.designation,
      active = EXCLUDED.active,
      joined_on = EXCLUDED.joined_on,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = workforce.employees.row_version + 1
    WHERE workforce.employees.source_payload IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH source_refs AS (
      SELECT DISTINCT
        btrim(COALESCE(
          document->'payload'->>'partNo',
          document->'payload'->>'partCode',
          document->'payload'->>'uid'
        )) AS part_code,
        COALESCE(
          NULLIF(btrim(document->'payload'->>'optionNumber'), ''),
          '1'
        ) AS option_number
      FROM migration.convex_documents
      WHERE migration_run_id = $1
        AND source_table = 'dataEntries'
        AND document->>'entryType' IN (
          'cycle', 'first_piece_inspection_master',
          'first_piece_inspection_report', 'hourly_quality_check',
          'production_card', 'quality_parameter_master', 'route',
          'setup_checklist', 'setup_checklist_session',
          'shop_floor_status', 'tooling'
        )
    )
    INSERT INTO manufacturing.route_options (
      organization_id, production_floor_id, item_id, route_code, name,
      legacy_option_number, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, production_floor.id, item.id,
      'OPTION-' || reference.option_number,
      'Option ' || reference.option_number, reference.option_number,
      'convex', 'route_reference',
      lower(reference.part_code) || '|' || lower(reference.option_number),
      jsonb_build_object(
        'partCode', reference.part_code,
        'optionNumber', reference.option_number,
        'generatedFrom', 'convex'
      )
    FROM source_refs AS reference
    JOIN manufacturing.production_floors AS production_floor
      ON production_floor.organization_id = $2
     AND production_floor.code = 'conventional'
    JOIN catalog.items AS item
      ON item.organization_id = $2
     AND lower(item.uid) = lower(reference.part_code)
    WHERE reference.part_code IS NOT NULL AND reference.part_code <> ''
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      production_floor_id = EXCLUDED.production_floor_id,
      item_id = EXCLUDED.item_id,
      route_code = EXCLUDED.route_code,
      name = EXCLUDED.name,
      legacy_option_number = EXCLUDED.legacy_option_number,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.route_options.row_version + 1
    WHERE manufacturing.route_options.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH routes AS (
      SELECT source.source_id, source.document,
        route.id AS route_option_id,
        machine_type.id AS machine_type_id,
        COALESCE(
          NULLIF(btrim(source.document->'payload'->>'setupNo'), ''),
          source.source_id
        ) AS setup_code,
        row_number() OVER (
          PARTITION BY route.id
          ORDER BY
            migration.try_numeric(source.document->'payload'->>'setupNo')
              NULLS LAST,
            source.source_creation_time,
            source.source_id
        )::integer AS execution_sequence
      FROM migration.convex_documents AS source
      JOIN catalog.items AS item
        ON item.organization_id = $2
       AND lower(item.uid) =
         lower(btrim(source.document->'payload'->>'partNo'))
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2
       AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      LEFT JOIN catalog.machine_types AS machine_type
        ON machine_type.organization_id = $2
       AND lower(machine_type.name) =
         lower(btrim(source.document->'payload'->>'machineType'))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'route'
    )
    INSERT INTO manufacturing.operation_setups (
      organization_id, route_option_id, setup_number, legacy_setup_code,
      operation_code, operation_name, machine_type_id, sequence,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, route_option_id, execution_sequence, setup_code,
      source_id, document->'payload'->>'setupName', machine_type_id,
      execution_sequence, 'convex', 'dataEntries', source_id, document
    FROM routes
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      route_option_id = EXCLUDED.route_option_id,
      setup_number = EXCLUDED.setup_number,
      legacy_setup_code = EXCLUDED.legacy_setup_code,
      operation_code = EXCLUDED.operation_code,
      operation_name = EXCLUDED.operation_name,
      machine_type_id = EXCLUDED.machine_type_id,
      sequence = EXCLUDED.sequence,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.operation_setups.row_version + 1
    WHERE manufacturing.operation_setups.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH source_refs AS (
      SELECT DISTINCT
        btrim(COALESCE(
          document->'payload'->>'partNo',
          document->'payload'->>'partCode',
          document->'payload'->>'uid'
        )) AS part_code,
        COALESCE(
          NULLIF(btrim(document->'payload'->>'optionNumber'), ''),
          '1'
        ) AS option_number,
        btrim(document->'payload'->>'setupNo') AS setup_code
      FROM migration.convex_documents
      WHERE migration_run_id = $1
        AND source_table = 'dataEntries'
        AND document->>'entryType' IN (
          'cycle', 'first_piece_inspection_master',
          'first_piece_inspection_report', 'hourly_quality_check',
          'production_card', 'quality_parameter_master',
          'setup_checklist', 'setup_checklist_session',
          'shop_floor_status', 'tooling'
        )
    ),
    missing AS (
      SELECT route.id AS route_option_id, reference.setup_code,
        row_number() OVER (
          PARTITION BY route.id
          ORDER BY migration.try_numeric(reference.setup_code) NULLS LAST,
            reference.setup_code
        )::integer
          + (
            SELECT count(*)::integer
            FROM manufacturing.operation_setups existing
            WHERE existing.route_option_id = route.id
          ) AS execution_sequence
      FROM source_refs AS reference
      JOIN catalog.items AS item
        ON item.organization_id = $2
       AND lower(item.uid) = lower(reference.part_code)
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2
       AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(reference.option_number)
      WHERE reference.setup_code IS NOT NULL
        AND reference.setup_code <> ''
        AND NOT EXISTS (
          SELECT 1 FROM manufacturing.operation_setups AS setup
          WHERE setup.route_option_id = route.id
            AND lower(setup.legacy_setup_code) = lower(reference.setup_code)
        )
    )
    INSERT INTO manufacturing.operation_setups (
      organization_id, route_option_id, setup_number, legacy_setup_code,
      operation_code, operation_name, sequence, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, route_option_id, execution_sequence, setup_code,
      'REFERENCE-' || setup_code, 'Legacy setup ' || setup_code,
      execution_sequence, 'convex', 'setup_reference',
      route_option_id::text || '|' || lower(setup_code),
      jsonb_build_object(
        'setupCode', setup_code,
        'generatedFrom', 'convex reference'
      )
    FROM missing
    ON CONFLICT (source_system, source_table, source_id) DO NOTHING
  `,
  `
    INSERT INTO manufacturing.work_orders (
      organization_id, work_order_number, job_card_number, item_id,
      ordered_quantity, order_date, due_date, status, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2,
      btrim(source.document->'payload'->>'jcNo'),
      btrim(source.document->'payload'->>'jcNo'),
      item.id,
      COALESCE(
        migration.try_numeric(source.document->'payload'->>'orderPcs'),
        0
      ),
      migration.try_date(source.document->'payload'->>'poDate'),
      migration.try_date(source.document->'payload'->>'deliveryDate'),
      CASE
        WHEN lower(COALESCE(
          source.document->'payload'->>'status', 'open'
        )) IN ('closed', 'complete', 'completed') THEN 'Complete'
        ELSE 'Open'
      END,
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents AS source
    JOIN catalog.items AS item
      ON item.organization_id = $2
     AND lower(item.uid) =
       lower(btrim(source.document->'payload'->>'partCode'))
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'work_order'
      AND btrim(COALESCE(source.document->'payload'->>'jcNo', '')) <> ''
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      item_id = EXCLUDED.item_id,
      ordered_quantity = EXCLUDED.ordered_quantity,
      order_date = EXCLUDED.order_date,
      due_date = EXCLUDED.due_date,
      status = EXCLUDED.status,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.work_orders.row_version + 1
    WHERE manufacturing.work_orders.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH source_refs AS (
      SELECT DISTINCT
        btrim(COALESCE(
          document->'payload'->>'jcNo',
          document->'payload'->>'jobCard',
          document->>'jobCard'
        )) AS job_card_number,
        btrim(COALESCE(
          document->'payload'->>'partCode',
          document->>'partCode'
        )) AS part_code
      FROM migration.convex_documents
      WHERE migration_run_id = $1
    )
    INSERT INTO manufacturing.work_orders (
      organization_id, work_order_number, job_card_number, item_id,
      ordered_quantity, status, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, reference.job_card_number, reference.job_card_number,
      item.id, 0, 'Open', 'convex', 'work_order_reference',
      lower(reference.job_card_number),
      jsonb_build_object(
        'jobCard', reference.job_card_number,
        'partCode', reference.part_code,
        'generatedFrom', 'convex reference'
      )
    FROM source_refs AS reference
    JOIN catalog.items AS item
      ON item.organization_id = $2
     AND lower(item.uid) = lower(reference.part_code)
    WHERE reference.job_card_number IS NOT NULL
      AND reference.job_card_number <> ''
      AND reference.part_code IS NOT NULL
      AND reference.part_code <> ''
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing.work_orders AS work_order
        WHERE work_order.organization_id = $2
          AND lower(work_order.job_card_number) =
            lower(reference.job_card_number)
      )
    ON CONFLICT (organization_id, lower(work_order_number)) DO NOTHING
  `,
] as const

export async function transformConvexFoundation(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
  }
) {
  for (const statement of FOUNDATION_STATEMENTS) {
    await client.query(
      statement,
      statement.includes("$2")
        ? [options.migrationRunId, options.organizationId]
        : [options.migrationRunId]
    )
  }
}
