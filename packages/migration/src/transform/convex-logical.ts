import type { PoolClient } from "pg"

const LOGICAL_STATEMENTS = [
  `
    WITH sources AS (
      SELECT source.*, item.id AS item_id, route.id AS route_id,
        setup.id AS setup_id
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
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups AS candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY
          (
            lower(COALESCE(candidate.operation_name, '')) =
            lower(COALESCE(source.document->'payload'->>'setupName', ''))
          ) DESC,
          (
            lower(COALESCE(
              candidate.source_payload->'payload'->>'machineUsed', ''
            )) =
            lower(COALESCE(source.document->'payload'->>'machineUsed', ''))
          ) DESC,
          candidate.sequence
        LIMIT 1
      ) AS setup ON true
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'cycle'
    )
    INSERT INTO manufacturing.operation_cycle_standards (
      organization_id, operation_setup_id, cycle_time_seconds,
      pieces_per_cycle, setup_time_minutes, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, setup_id,
      GREATEST(
        COALESCE(migration.try_numeric(document->'payload'->>'cycleTime'), 0),
        0.00000001
      ),
      1,
      GREATEST(
        COALESCE(
          migration.try_numeric(document->'payload'->>'loadingUnloading'),
          0
        ),
        0
      ),
      'convex', 'dataEntries', source_id, document
    FROM sources
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      operation_setup_id = EXCLUDED.operation_setup_id,
      cycle_time_seconds = EXCLUDED.cycle_time_seconds,
      setup_time_minutes = EXCLUDED.setup_time_minutes,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.operation_cycle_standards.row_version + 1
    WHERE manufacturing.operation_cycle_standards.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH sources AS (
      SELECT source.*, route.id AS route_id, setup.id AS setup_id
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
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups AS candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY
          (
            lower(COALESCE(candidate.operation_name, '')) =
            lower(COALESCE(source.document->'payload'->>'setupName', ''))
          ) DESC,
          candidate.sequence
        LIMIT 1
      ) AS setup ON true
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'tooling'
    )
    INSERT INTO manufacturing.operation_tooling (
      organization_id, operation_setup_id, tool_code, description, quantity,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, setup_id, source_id,
      concat_ws(
        '; ',
        NULLIF(document->'payload'->>'tooling', ''),
        NULLIF(document->'payload'->>'fixture', ''),
        NULLIF(document->'payload'->>'foamTool', '')
      ),
      GREATEST(
        COALESCE(
          migration.try_numeric(document->'payload'->>'toolingQty'),
          migration.try_numeric(document->'payload'->>'fixtureQty'),
          migration.try_numeric(document->'payload'->>'foamToolQty'),
          1
        )::integer,
        1
      ),
      'convex', 'dataEntries', source_id, document
    FROM sources
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      operation_setup_id = EXCLUDED.operation_setup_id,
      tool_code = EXCLUDED.tool_code,
      description = EXCLUDED.description,
      quantity = EXCLUDED.quantity,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.operation_tooling.row_version + 1
    WHERE manufacturing.operation_tooling.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO manufacturing.raw_material_receipts (
      organization_id, receipt_number, received_on, quantity_kg,
      remaining_quantity_kg, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, source.source_id,
      COALESCE(
        migration.try_date(source.document->'payload'->>'rmInwardDate'),
        to_timestamp(source.source_creation_time / 1000.0)::date
      ),
      GREATEST(COALESCE(
        migration.try_numeric(source.document->'payload'->>'rmInwardKg'),
        0
      ), 0),
      GREATEST(COALESCE(
        migration.try_numeric(source.document->'payload'->>'rmInwardKg'),
        0
      ), 0),
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents AS source
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'rm_inward'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      received_on = EXCLUDED.received_on,
      quantity_kg = EXCLUDED.quantity_kg,
      remaining_quantity_kg = EXCLUDED.remaining_quantity_kg,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.raw_material_receipts.row_version + 1
    WHERE manufacturing.raw_material_receipts.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH parameters AS (
      SELECT source.*, item.id AS item_id, route.id AS route_id,
        setup.id AS setup_id,
        COALESCE(
          source.document->'payload'->>'parameterName',
          source.document->'payload'->>'description',
          source.source_id
        ) AS parameter_name
      FROM migration.convex_documents AS source
      JOIN catalog.items AS item
        ON item.organization_id = $2
       AND lower(item.uid) = lower(btrim(COALESCE(
         source.document->'payload'->>'partNo',
         source.document->'payload'->>'uid'
       )))
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2
       AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups AS candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY candidate.sequence
        LIMIT 1
      ) AS setup ON true
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' IN (
          'first_piece_inspection_master',
          'quality_parameter_master'
        )
    )
    INSERT INTO quality.parameter_definitions (
      organization_id, item_id, route_option_id, operation_setup_id,
      parameter_code, name, data_type, lower_limit, upper_limit,
      nominal_value, source_system, source_table, source_id, source_payload
    )
    SELECT $2, item_id, route_id, setup_id, source_id, parameter_name,
      CASE
        WHEN lower(COALESCE(document->'payload'->>'inputType', 'number'))
          IN ('checkbox', 'boolean') THEN 'boolean'
        WHEN lower(COALESCE(document->'payload'->>'inputType', 'number'))
          IN ('text', 'string') THEN 'text'
        ELSE 'numeric'
      END,
      migration.try_numeric(document->'payload'->>'specification')
        - COALESCE(
          migration.try_numeric(document->'payload'->>'toleranceMinus'),
          0
        ),
      migration.try_numeric(document->'payload'->>'specification')
        + COALESCE(
          migration.try_numeric(document->'payload'->>'tolerancePlus'),
          0
        ),
      migration.try_numeric(document->'payload'->>'specification'),
      'convex', 'dataEntries', source_id, document
    FROM parameters
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      item_id = EXCLUDED.item_id,
      route_option_id = EXCLUDED.route_option_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      name = EXCLUDED.name,
      data_type = EXCLUDED.data_type,
      lower_limit = EXCLUDED.lower_limit,
      upper_limit = EXCLUDED.upper_limit,
      nominal_value = EXCLUDED.nominal_value,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = quality.parameter_definitions.row_version + 1
    WHERE quality.parameter_definitions.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH reports AS (
      SELECT source.*, work_order.id AS work_order_id,
        setup.id AS setup_id, machine.id AS machine_id,
        COALESCE(
          NULLIF(source.document->'payload'->>'reportId', ''),
          source.source_id
        ) AS base_check_key,
        row_number() OVER (
          PARTITION BY lower(COALESCE(
            NULLIF(source.document->'payload'->>'reportId', ''),
            source.source_id
          ))
          ORDER BY COALESCE(
            migration.try_timestamptz(
              source.document->'payload'->>'taskCompletedAt'
            ),
            to_timestamp(source.source_creation_time / 1000.0)
          ) DESC, source.source_id DESC
        ) AS check_key_rank
      FROM migration.convex_documents AS source
      JOIN manufacturing.work_orders AS work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) = lower(btrim(COALESCE(
         source.document->'payload'->>'jcNo',
         source.document->'payload'->>'jobCard'
       )))
      JOIN catalog.items AS item ON item.id = work_order.item_id
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2
       AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups AS candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY candidate.sequence LIMIT 1
      ) AS setup ON true
      LEFT JOIN catalog.machines AS machine
        ON machine.organization_id = $2
       AND lower(machine.machine_number) =
         lower(btrim(source.document->'payload'->>'machine'))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'first_piece_inspection_report'
    )
    INSERT INTO quality.first_piece_inspections (
      organization_id, work_order_id, operation_setup_id, machine_id,
      inspected_at, status, legacy_inspector, notes, check_key,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, work_order_id, setup_id, machine_id,
      COALESCE(
        migration.try_timestamptz(document->'payload'->>'taskCompletedAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      'Completed', document->'payload'->>'approvedBy',
      document->'payload'->>'remark',
      CASE WHEN check_key_rank = 1 THEN base_check_key
        ELSE base_check_key || '|legacy|' || source_id END,
      'convex', 'dataEntries', source_id, document
    FROM reports
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      machine_id = EXCLUDED.machine_id,
      inspected_at = EXCLUDED.inspected_at,
      status = EXCLUDED.status,
      legacy_inspector = EXCLUDED.legacy_inspector,
      notes = EXCLUDED.notes,
      check_key = EXCLUDED.check_key,
      source_payload = EXCLUDED.source_payload
    WHERE quality.first_piece_inspections.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH checks AS (
      SELECT source.*, work_order.id AS work_order_id,
        setup.id AS setup_id, machine.id AS machine_id,
        COALESCE(
          NULLIF(source.document->'payload'->>'checkId', ''),
          source.source_id
        ) AS base_check_key,
        row_number() OVER (
          PARTITION BY lower(COALESCE(
            NULLIF(source.document->'payload'->>'checkId', ''),
            source.source_id
          ))
          ORDER BY COALESCE(
            migration.try_timestamptz(
              source.document->'payload'->>'savedAt'
            ),
            to_timestamp(source.source_creation_time / 1000.0)
          ) DESC, source.source_id DESC
        ) AS check_key_rank
      FROM migration.convex_documents AS source
      JOIN manufacturing.work_orders AS work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) = lower(btrim(COALESCE(
         source.document->'payload'->>'jcNo',
         source.document->'payload'->>'jobCard'
       )))
      JOIN catalog.items AS item ON item.id = work_order.item_id
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2 AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups AS candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY candidate.sequence LIMIT 1
      ) AS setup ON true
      LEFT JOIN catalog.machines AS machine
        ON machine.organization_id = $2
       AND lower(machine.machine_number) =
         lower(btrim(source.document->'payload'->>'machine'))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'hourly_quality_check'
    )
    INSERT INTO quality.hourly_checks (
      organization_id, work_order_id, operation_setup_id, machine_id,
      checked_at, status, legacy_checker, check_key, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, work_order_id, setup_id, machine_id,
      COALESCE(
        migration.try_timestamptz(document->'payload'->>'savedAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      CASE
        WHEN COALESCE(
          migration.try_numeric(document->'payload'->>'ngCount'), 0
        ) > 0 THEN 'NG' ELSE 'OK'
      END,
      document->'payload'->>'checkedBy',
      CASE WHEN check_key_rank = 1 THEN base_check_key
        ELSE base_check_key || '|legacy|' || source_id END,
      'convex', 'dataEntries', source_id, document
    FROM checks
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      machine_id = EXCLUDED.machine_id,
      checked_at = EXCLUDED.checked_at,
      status = EXCLUDED.status,
      legacy_checker = EXCLUDED.legacy_checker,
      check_key = EXCLUDED.check_key,
      source_payload = EXCLUDED.source_payload
    WHERE quality.hourly_checks.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH versions AS (
      SELECT DISTINCT
        COALESCE(
          NULLIF(document->'payload'->>'version', ''),
          NULLIF(document->'payload'->>'masterVersion', ''),
          'legacy'
        ) AS version
      FROM migration.convex_documents
      WHERE migration_run_id = $1
        AND source_table = 'dataEntries'
        AND document->>'entryType' IN (
          'setup_checklist_master', 'setup_checklist_session',
          'setup_checklist'
        )
    )
    INSERT INTO quality.setup_checklist_templates (
      organization_id, code, name, revision, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, 'SETUP-' || version, 'Setup checklist ' || version, 1,
      'convex', 'setup_checklist_template', lower(version),
      jsonb_build_object('version', version, 'generatedFrom', 'convex')
    FROM versions
    ON CONFLICT (source_system, source_table, source_id) DO NOTHING
  `,
  `
    INSERT INTO quality.setup_checklist_template_items (
      organization_id, template_id, item_key, prompt, response_type, required,
      sequence, source_system, source_table, source_id, source_payload
    )
    SELECT $2, template.id, source.source_id,
      source.document->'payload'->>'checkPoint',
      COALESCE(source.document->'payload'->>'inputType', 'text'),
      lower(COALESCE(
        source.document->'payload'->>'required', 'yes'
      )) IN ('yes', 'true', 'required'),
      COALESCE(
        migration.try_numeric(source.document->'payload'->>'sequence'),
        0
      )::integer,
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents AS source
    JOIN quality.setup_checklist_templates AS template
      ON template.organization_id = $2
     AND template.source_system = 'convex'
     AND template.source_table = 'setup_checklist_template'
     AND template.source_id = lower(COALESCE(
       NULLIF(source.document->'payload'->>'version', ''),
       'legacy'
     ))
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'setup_checklist_master'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      template_id = EXCLUDED.template_id,
      prompt = EXCLUDED.prompt,
      response_type = EXCLUDED.response_type,
      required = EXCLUDED.required,
      sequence = EXCLUDED.sequence,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = quality.setup_checklist_template_items.row_version + 1
    WHERE quality.setup_checklist_template_items.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH sessions AS (
      SELECT source.*, work_order.id AS work_order_id,
        setup.id AS setup_id, machine.id AS machine_id,
        template.id AS template_id,
        COALESCE(
          NULLIF(source.document->'payload'->>'sessionId', ''),
          source.source_id
        ) AS base_session_key,
        row_number() OVER (
          PARTITION BY lower(COALESCE(
            NULLIF(source.document->'payload'->>'sessionId', ''),
            source.source_id
          ))
          ORDER BY COALESCE(
            migration.try_timestamptz(
              source.document->'payload'->>'endedAt'
            ),
            migration.try_timestamptz(
              source.document->'payload'->>'settingEndTime'
            ),
            migration.try_timestamptz(
              source.document->'payload'->>'startedAt'
            ),
            to_timestamp(source.source_creation_time / 1000.0)
          ) DESC, source.source_id DESC
        ) AS session_key_rank
      FROM migration.convex_documents AS source
      JOIN manufacturing.work_orders AS work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) =
         lower(btrim(source.document->'payload'->>'jcNo'))
      JOIN catalog.items AS item ON item.id = work_order.item_id
      JOIN manufacturing.route_options AS route
        ON route.organization_id = $2 AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
        SELECT candidate.id
        FROM manufacturing.operation_setups candidate
        WHERE candidate.route_option_id = route.id
          AND lower(candidate.legacy_setup_code) =
            lower(btrim(source.document->'payload'->>'setupNo'))
        ORDER BY candidate.sequence LIMIT 1
      ) setup ON true
      LEFT JOIN catalog.machines machine
        ON machine.organization_id = $2
       AND lower(machine.machine_number) = lower(btrim(COALESCE(
         source.document->'payload'->>'machine',
         source.document->'payload'->>'machineNo'
       )))
      JOIN quality.setup_checklist_templates template
        ON template.organization_id = $2
       AND template.source_system = 'convex'
       AND template.source_table = 'setup_checklist_template'
       AND template.source_id = lower(COALESCE(
         NULLIF(source.document->'payload'->>'masterVersion', ''),
         'legacy'
       ))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' IN (
          'setup_checklist_session', 'setup_checklist'
        )
    )
    INSERT INTO quality.setup_checklist_sessions (
      organization_id, template_id, work_order_id, operation_setup_id,
      machine_id, status, started_at, completed_at, legacy_completer,
      session_key, source_system, source_table, source_id, source_payload
    )
    SELECT $2, template_id, work_order_id, setup_id, machine_id,
      COALESCE(document->'payload'->>'status', 'Completed'),
      COALESCE(
        migration.try_timestamptz(document->'payload'->>'startedAt'),
        to_timestamp(source_creation_time / 1000.0)
      ),
      COALESCE(
        migration.try_timestamptz(document->'payload'->>'endedAt'),
        migration.try_timestamptz(document->'payload'->>'settingEndTime')
      ),
      COALESCE(
        document->'payload'->>'endedBy',
        document->'payload'->>'setterCode'
      ),
      CASE WHEN session_key_rank = 1 THEN base_session_key
        ELSE base_session_key || '|legacy|' || source_id END,
      'convex', 'dataEntries', source_id, document
    FROM sessions
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      template_id = EXCLUDED.template_id,
      work_order_id = EXCLUDED.work_order_id,
      operation_setup_id = EXCLUDED.operation_setup_id,
      machine_id = EXCLUDED.machine_id,
      status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      completed_at = EXCLUDED.completed_at,
      legacy_completer = EXCLUDED.legacy_completer,
      session_key = EXCLUDED.session_key,
      source_payload = EXCLUDED.source_payload
    WHERE quality.setup_checklist_sessions.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH events AS (
      SELECT source.*, work_order.id AS work_order_id,
        route.id AS route_id, setup.id AS setup_id, machine.id AS machine_id
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) =
         lower(btrim(source.document->'payload'->>'jcNo'))
      JOIN catalog.items item ON item.id = work_order.item_id
      JOIN manufacturing.route_options route
        ON route.organization_id = $2 AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
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
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'shop_floor_status'
    ),
    states AS (
      SELECT DISTINCT ON (work_order_id, route_id, setup_id)
        work_order_id, route_id, setup_id, machine_id,
        document->'payload'->>'stage' AS stage, document, source_id,
        source_creation_time
      FROM events
      ORDER BY work_order_id, route_id, setup_id, source_creation_time DESC
    )
    INSERT INTO manufacturing.shop_floor_setup_state (
      organization_id, work_order_id, route_option_id, operation_setup_id,
      machine_id, stage, active, started_at, completed_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, work_order_id, route_id, setup_id, machine_id, stage, false,
      NULL,
      migration.try_timestamptz(document->'payload'->>'completedAt'),
      'convex', 'shop_floor_state',
      work_order_id::text || '|' || route_id::text || '|' || setup_id::text,
      document
    FROM states
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      machine_id = EXCLUDED.machine_id,
      stage = EXCLUDED.stage,
      completed_at = EXCLUDED.completed_at,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.shop_floor_setup_state.row_version + 1
    WHERE manufacturing.shop_floor_setup_state.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH events AS (
      SELECT source.*, work_order.id AS work_order_id,
        route.id AS route_id, setup.id AS setup_id, machine.id AS machine_id
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) =
         lower(btrim(source.document->'payload'->>'jcNo'))
      JOIN catalog.items item ON item.id = work_order.item_id
      JOIN manufacturing.route_options route
        ON route.organization_id = $2 AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      JOIN LATERAL (
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
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'shop_floor_status'
    )
    INSERT INTO manufacturing.shop_floor_stage_events (
      organization_id, setup_state_id, to_stage, machine_id, occurred_at,
      legacy_actor, reason, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, state.id, events.document->'payload'->>'stage',
      events.machine_id,
      COALESCE(
        migration.try_timestamptz(
          events.document->'payload'->>'completedAt'
        ),
        to_timestamp(events.source_creation_time / 1000.0)
      ),
      COALESCE(
        events.document->'payload'->>'doneBy',
        events.document->'payload'->>'worker'
      ),
      events.document->'payload'->>'remark',
      'convex', 'dataEntries', events.source_id, events.document
    FROM events
    JOIN manufacturing.shop_floor_setup_state state
      ON state.organization_id = $2
     AND state.work_order_id = events.work_order_id
     AND state.route_option_id = events.route_id
     AND state.operation_setup_id = events.setup_id
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      setup_state_id = EXCLUDED.setup_state_id,
      to_stage = EXCLUDED.to_stage,
      machine_id = EXCLUDED.machine_id,
      occurred_at = EXCLUDED.occurred_at,
      legacy_actor = EXCLUDED.legacy_actor,
      reason = EXCLUDED.reason,
      source_payload = EXCLUDED.source_payload
    WHERE manufacturing.shop_floor_stage_events.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH cards AS (
      SELECT source.*, work_order.id AS work_order_id, route.id AS route_id
      FROM migration.convex_documents source
      JOIN manufacturing.work_orders work_order
        ON work_order.organization_id = $2
       AND lower(work_order.job_card_number) = lower(btrim(COALESCE(
         source.document->'payload'->>'jcNo',
         source.document->'payload'->>'jobCard'
       )))
      JOIN catalog.items item ON item.id = work_order.item_id
      LEFT JOIN manufacturing.route_options route
        ON route.organization_id = $2 AND route.item_id = item.id
       AND lower(route.legacy_option_number) = lower(COALESCE(
         NULLIF(btrim(source.document->'payload'->>'optionNumber'), ''),
         '1'
       ))
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'production_card'
    )
    INSERT INTO manufacturing.production_cards (
      organization_id, card_number, work_order_id, route_option_id, status,
      issued_on, source_system, source_table, source_id, source_payload
    )
    SELECT $2, source_id, work_order_id, route_id, 'Closed',
      COALESCE(
        migration.try_date(document->'payload'->>'prodDate'),
        to_timestamp(source_creation_time / 1000.0)::date
      ),
      'convex', 'dataEntries', source_id, document
    FROM cards
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      work_order_id = EXCLUDED.work_order_id,
      route_option_id = EXCLUDED.route_option_id,
      status = EXCLUDED.status,
      issued_on = EXCLUDED.issued_on,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = manufacturing.production_cards.row_version + 1
    WHERE manufacturing.production_cards.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    WITH codes AS (
      SELECT DISTINCT
        source.document->'payload'->>'checklistCode' AS code,
        source.document->'payload'->>'checklistTitle' AS title
      FROM migration.convex_documents source
      WHERE source.migration_run_id = $1
        AND source.source_table = 'dataEntries'
        AND source.document->>'entryType' = 'maintenance_checklist_master'
    )
    INSERT INTO maintenance.definitions (
      organization_id, code, name, frequency_unit, frequency_value,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, code, COALESCE(NULLIF(title, ''), code), 'month', 1,
      'convex', 'maintenance_definition_reference', lower(code),
      jsonb_build_object('code', code, 'title', title)
    FROM codes WHERE code IS NOT NULL AND code <> ''
    ON CONFLICT (source_system, source_table, source_id) DO NOTHING
  `,
  `
    INSERT INTO maintenance.checklist_items (
      organization_id, definition_id, item_key, prompt, response_type,
      required, sequence, source_system, source_table, source_id,
      source_payload
    )
    SELECT $2, definition.id, source.source_id,
      source.document->'payload'->>'stepDescription',
      COALESCE(source.document->'payload'->>'inputType', 'text'),
      true,
      COALESCE(
        migration.try_numeric(source.document->'payload'->>'sequence'), 0
      )::integer,
      'convex', 'dataEntries', source.source_id, source.document
    FROM migration.convex_documents source
    JOIN maintenance.definitions definition
      ON definition.organization_id = $2
     AND definition.source_system = 'convex'
     AND definition.source_table = 'maintenance_definition_reference'
     AND definition.source_id =
       lower(source.document->'payload'->>'checklistCode')
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' = 'maintenance_checklist_master'
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      definition_id = EXCLUDED.definition_id,
      prompt = EXCLUDED.prompt,
      response_type = EXCLUDED.response_type,
      sequence = EXCLUDED.sequence,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = maintenance.checklist_items.row_version + 1
    WHERE maintenance.checklist_items.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO migration.type_conflicts (
      migration_run_id, source_system, source_table, source_id, status,
      proposed_resolution, approved_resolution, evidence
    )
    SELECT $1, 'convex', 'dataEntries', source.source_id, 'approved',
      jsonb_build_object('disposition', 'typed_quarantine'),
      jsonb_build_object(
        'rule', 'retain until payload-specific domain mapping is approved'
      ),
      source.document
    FROM migration.convex_documents source
    WHERE source.migration_run_id = $1
      AND source.source_table = 'dataEntries'
      AND source.document->>'entryType' IN (
        'rejection_classification', 'machine_planning',
        'raw_material_plan', 'quality_inspection', 'meeting_action'
      )
      AND NOT EXISTS (
        SELECT 1 FROM migration.type_conflicts existing
        WHERE existing.migration_run_id = $1
          AND existing.source_system = 'convex'
          AND existing.source_table = 'dataEntries'
          AND existing.source_id = source.source_id
      )
  `,
] as const

export async function transformConvexLogicalRows(
  client: PoolClient,
  options: {
    migrationRunId: string
    organizationId: string
  }
) {
  for (const statement of LOGICAL_STATEMENTS) {
    await client.query(
      statement,
      statement.includes("$2")
        ? [options.migrationRunId, options.organizationId]
        : [options.migrationRunId]
    )
  }
}
