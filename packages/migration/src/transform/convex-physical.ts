import type { PoolClient } from "pg"

const PHYSICAL_STATEMENTS = [
  `
    WITH entries AS (
      SELECT source.*, work_order.id AS work_order_id,
        route.id AS route_id, setup.id AS setup_id, machine.id AS machine_id,
        employee.id AS employee_id
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) = lower(btrim(COALESCE(
         source.document->>'jobCard',
         source.document->>'jcNo'
       )))
      LEFT JOIN manufacturing.route_options route
        ON route.organization_id = $2
       AND route.item_id = work_order.item_id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->>'optionNumber'), ''), '1'
       ))
      LEFT JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->>'setupNo'))
        ORDER BY candidate.sequence LIMIT 1
      ) setup ON true
      LEFT JOIN catalog.machines machine
        ON machine.organization_id = $2
       AND lower(machine.machine_number) =
         lower(btrim(source.document->>'machine'))
      LEFT JOIN workforce.employees employee
        ON employee.organization_id = $2
       AND lower(employee.employee_code) =
         lower(btrim(source.document->>'operatorId'))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'productionEntries'
    )
    INSERT INTO manufacturing.production_entries (
      organization_id, work_order_id, route_option_id, operation_setup_id,
      machine_id, operator_employee_id, production_date, shift,
      quantity_good, quantity_rejected, recorded_at, legacy_actor,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, work_order_id, route_id, setup_id, machine_id, employee_id,
      COALESCE(
        migration.try_date(document->>'prodDate'),
        to_timestamp(source_creation_time / 1000.0)::date
      ),
      document->>'shift',
      GREATEST(COALESCE(
        migration.try_numeric(document->>'outputQty'),
        migration.try_numeric(document->>'actualQty'),
        0
      ), 0),
      GREATEST(COALESCE(
        migration.try_numeric(document->>'rejectQty'), 0
      ), 0),
      COALESCE(
        migration.try_timestamptz(document->>'createdAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      COALESCE(document->>'operatorName', document->>'operatorId'),
      'convex', 'productionEntries', source_id, document
    FROM entries
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      route_option_id = EXCLUDED.route_option_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      machine_id = EXCLUDED.machine_id,
      operator_employee_id = EXCLUDED.operator_employee_id,
      production_date = EXCLUDED.production_date,
      quantity_good = EXCLUDED.quantity_good,
      quantity_rejected = EXCLUDED.quantity_rejected,
      recorded_at = EXCLUDED.recorded_at,
      legacy_actor = EXCLUDED.legacy_actor,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.production_entries.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH entries AS (
      SELECT source.*, work_order.id AS work_order_id,
        route.id AS route_id, setup.id AS setup_id, machine.id AS machine_id,
        employee.id AS employee_id
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) = lower(btrim(COALESCE(
         source.document->'payload'->>'jobCard',
         source.document->'payload'->>'jcNo'
       )))
      LEFT JOIN manufacturing.route_options route
        ON route.organization_id = $2 AND route.item_id = work_order.item_id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''), '1'
       ))
      LEFT JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY candidate.sequence LIMIT 1
      ) setup ON true
      LEFT JOIN catalog.machines machine
        ON machine.organization_id = $2
       AND lower(machine.machine_number) =
         lower(btrim(source.document->'payload'->>'machine'))
      LEFT JOIN workforce.employees employee
        ON employee.organization_id = $2
       AND lower(employee.employee_code) =
         lower(btrim(source.document->'payload'->>'operatorId'))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'software_raw'
    )
    INSERT INTO manufacturing.production_entries (
      organization_id, work_order_id, route_option_id, operation_setup_id,
      machine_id, operator_employee_id, production_date, shift,
      quantity_good, quantity_rejected, recorded_at, legacy_actor,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, work_order_id, route_id, setup_id, machine_id, employee_id,
      COALESCE(
        migration.try_date(document->'payload'->>'prodDate'),
        to_timestamp(source_creation_time / 1000.0)::date
      ),
      document->'payload'->>'shift',
      GREATEST(COALESCE(
        migration.try_numeric(document->'payload'->>'outputQty'),
        migration.try_numeric(document->'payload'->>'actualQty'),
        0
      ), 0),
      GREATEST(COALESCE(
        migration.try_numeric(document->'payload'->>'rejectQty'), 0
      ), 0),
      COALESCE(
        migration.try_timestamptz(document->'payload'->>'createdAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      COALESCE(
        document->'payload'->>'operatorName',
        document->'payload'->>'operatorId'
      ),
      'convex', 'dataEntries', source_id, document
    FROM entries
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      route_option_id = EXCLUDED.route_option_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      machine_id = EXCLUDED.machine_id,
      operator_employee_id = EXCLUDED.operator_employee_id,
      production_date = EXCLUDED.production_date,
      quantity_good = EXCLUDED.quantity_good,
      quantity_rejected = EXCLUDED.quantity_rejected,
      recorded_at = EXCLUDED.recorded_at,
      legacy_actor = EXCLUDED.legacy_actor,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.production_entries.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH selections AS (
      SELECT source.*, work_order.id AS work_order_id, route.id AS route_id,
        row_number() OVER (
          PARTITION BY work_order.id
          ORDER BY source.source_creation_time DESC, source.source_id DESC
        ) AS recency
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) =
         lower(btrim(source.document->>'jcNo'))
      JOIN manufacturing.route_options route
        ON route.organization_id = $2
       AND route.item_id = work_order.item_id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->>'optionNumber'), ''), '1'
       ))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'routeSelections'
    )
    INSERT INTO manufacturing.route_selections (
      organization_id, work_order_id, route_option_id, selected_at,
      legacy_actor, reversed_at, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, work_order_id, route_id,
      COALESCE(
        migration.try_timestamptz(document->>'createdAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      document->>'ownerId',
      CASE WHEN recency = 1 THEN NULL
        ELSE to_timestamp(source_creation_time / 1000.0) END,
      'convex', 'routeSelections', source_id, document
    FROM selections
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      route_option_id = EXCLUDED.route_option_id,
      selected_at = EXCLUDED.selected_at,
      legacy_actor = EXCLUDED.legacy_actor,
      reversed_at = EXCLUDED.reversed_at,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.route_selections.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO manufacturing.planner_priority_events (
      organization_id, planning_date, reason, occurred_at, legacy_actor,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2,
      COALESCE(
        migration.try_date(source.document->>'planningDate'),
        migration.try_timestamptz(source.document->>'createdAt')::date,
        to_timestamp(source.source_creation_time / 1000.0)::date
      ),
      concat_ws(
        ': ',
        NULLIF(source.document->>'priority', ''),
        NULLIF(source.document->>'reason', '')
      ),
      COALESCE(
        migration.try_timestamptz(source.document->>'createdAt'),
        to_timestamp(source.source_creation_time / 1000.0)
      ),
      COALESCE(source.document->>'createdBy', source.document->>'ownerId'),
      'convex', 'plannerPriorities', source.source_id, source.document
    FROM migration.convex_documents source
    WHERE source.migration_run_id = $1
      AND source.source_table = 'plannerPriorities'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      planning_date = EXCLUDED.planning_date,
      reason = EXCLUDED.reason,
      occurred_at = EXCLUDED.occurred_at,
      legacy_actor = EXCLUDED.legacy_actor,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.planner_priority_events.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO manufacturing.machine_constraint_events (
      organization_id, machine_id, constraint_type, starts_at, ends_at,
      reason, occurred_at, legacy_actor, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, machine.id, 'unavailable',
      COALESCE(
        migration.try_timestamptz(source.document->>'unavailableFrom'),
        migration.try_timestamptz(source.document->>'createdAt'),
        to_timestamp(source.source_creation_time / 1000.0)
      ),
      migration.try_timestamptz(source.document->>'unavailableTo'),
      COALESCE(
        NULLIF(source.document->>'reason', ''),
        'Legacy machine constraint'
      ),
      COALESCE(
        migration.try_timestamptz(source.document->>'createdAt'),
        to_timestamp(source.source_creation_time / 1000.0)
      ),
      source.document->>'createdBy',
      'convex', 'machineConstraints', source.source_id, source.document
    FROM migration.convex_documents source
    JOIN catalog.machines machine
      ON machine.organization_id = $2
     AND lower(machine.machine_number) =
       lower(btrim(source.document->>'machineNo'))
    WHERE source.migration_run_id = $1
      AND source.source_table = 'machineConstraints'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      machine_id = EXCLUDED.machine_id,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      reason = EXCLUDED.reason,
      occurred_at = EXCLUDED.occurred_at,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.machine_constraint_events.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO manufacturing.plan_override_events (
      organization_id, work_order_id, operation_setup_id, source_machine_id,
      target_machine_id, target_date, reason, occurred_at, legacy_actor,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, work_order.id, setup.id, source_machine.id, target_machine.id,
      migration.try_date(source.document->>'targetDate'),
      COALESCE(NULLIF(source.document->>'reason', ''), 'Legacy plan override'),
      COALESCE(
        migration.try_timestamptz(source.document->>'createdAt'),
        to_timestamp(source.source_creation_time / 1000.0)
      ),
      source.document->>'createdBy',
      'convex', 'planOverrides', source.source_id, source.document
    FROM migration.convex_documents source
    JOIN manufacturing.work_orders work_order
      ON work_order.organization_id = $2
     AND lower(work_order.job_card_number) =
       lower(btrim(source.document->>'target'))
    LEFT JOIN manufacturing.route_options route
      ON route.organization_id = $2 AND route.item_id = work_order.item_id
    LEFT JOIN LATERAL (
      SELECT candidate.id
      FROM manufacturing.operation_setups candidate
      WHERE candidate.route_option_id = route.id
        AND lower(candidate.legacy_setup_code) =
          lower(btrim(source.document->>'setupNo'))
      ORDER BY candidate.sequence LIMIT 1
    ) setup ON true
    LEFT JOIN catalog.machines source_machine
      ON source_machine.organization_id = $2
     AND lower(source_machine.machine_number) =
       lower(btrim(source.document->>'fromMachine'))
    LEFT JOIN catalog.machines target_machine
      ON target_machine.organization_id = $2
     AND lower(target_machine.machine_number) =
       lower(btrim(source.document->>'toMachine'))
    WHERE source.migration_run_id = $1
      AND source.source_table = 'planOverrides'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      source_machine_id = EXCLUDED.source_machine_id,
      target_machine_id = EXCLUDED.target_machine_id,
      target_date = EXCLUDED.target_date,
      reason = EXCLUDED.reason,
      occurred_at = EXCLUDED.occurred_at,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.plan_override_events.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
] as const

export async function transformConvexPhysicalRows(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
  }
) {
  for (const statement of PHYSICAL_STATEMENTS) {
    await client.query(
      statement,
      statement.includes("$2")
        ? [options.migrationRunId, options.organizationId]
        : [options.migrationRunId]
    )
  }
}
