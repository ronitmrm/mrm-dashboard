import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import {
  normalizeProductionFloorCode,
  type ProductionFloorCode,
} from "./production-floors"

type RepositoryOptions = RepositoryPoolOptions

type QualityContext = {
  item_id: string
  operation_setup_id: string
  route_option_id: string
  work_order_id: string
}

type ParameterRow = {
  data_type: "boolean" | "numeric" | "text"
  id: string
  lower_limit: string | null
  upper_limit: string | null
}

type ChecklistItemInput = {
  active?: boolean
  inputType: string
  itemKey: string
  prompt: string
  required: boolean
  sequence: number
}

type ResultInput = {
  itemKey: string
  itemPrompt?: string | null
  notes?: string | null
  passed?: boolean | null
  sequence?: number | null
  value: boolean | number | string | null
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

async function generatedQualityMasterCode(
  client: PoolClient,
  organizationId: string,
  requestedCode: string,
  kind:
    | "rejection-reason"
    | "rejection-remark"
    | "rejection-type"
    | "setup-checklist"
) {
  const cleaned = requestedCode.trim()
  if (cleaned) return cleaned
  const definition = {
    "rejection-type": { prefix: "RT", table: "quality.rejection_types" },
    "rejection-reason": { prefix: "DC", table: "quality.rejection_reasons" },
    "rejection-remark": { prefix: "RR", table: "quality.rejection_remarks" },
    "setup-checklist": { prefix: "SC", table: "quality.setup_checklist_templates" },
  }[kind]
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('quality.master-code'), hashtext($1))",
    [`${organizationId}:${kind}`]
  )
  const result = await client.query<{ nextNumber: number }>(
    `
      SELECT COALESCE(MAX(
        CASE WHEN code ~* $2 THEN substring(code from '([0-9]+)$')::integer END
      ), 0) + 1 AS "nextNumber"
      FROM ${definition.table}
      WHERE organization_id = $1
    `,
    [organizationId, `^${definition.prefix}[0-9]+$`]
  )
  return `${definition.prefix}${String(result.rows[0]?.nextNumber ?? 1).padStart(3, "0")}`
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

function numericOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function valueColumns(
  value: boolean | number | string | null,
  dataType?: ParameterRow["data_type"]
) {
  if (dataType === "boolean" || typeof value === "boolean") {
    const normalized =
      typeof value === "boolean"
        ? value
        : ["true", "yes", "ok", "pass", "passed", "1"].includes(
            String(value ?? "")
              .trim()
              .toLowerCase()
          )
    return { booleanValue: normalized, numericValue: null, textValue: null }
  }
  const numericValue = numericOrNull(value)
  if (dataType === "numeric" || typeof value === "number") {
    return { booleanValue: null, numericValue, textValue: null }
  }
  return {
    booleanValue: null,
    numericValue: null,
    textValue: value === null ? null : String(value),
  }
}

function readingResult(parameter: ParameterRow, value: unknown) {
  const numericValue = numericOrNull(value)
  if (parameter.data_type !== "numeric" || numericValue === null) {
    return value === null || value === "" ? "Pending" : "OK"
  }
  const lower = numericOrNull(parameter.lower_limit)
  const upper = numericOrNull(parameter.upper_limit)
  if (lower !== null && numericValue < lower) return "Not OK"
  if (upper !== null && numericValue > upper) return "Not OK"
  return "OK"
}

async function routeAndSetupFor(
  client: PoolClient,
  organizationId: string,
  itemUid: string,
  routeCode: string,
  operationSetupCode: string,
  productionFloorCode: ProductionFloorCode
) {
  const result = await client.query<{
    item_id: string
    operation_setup_id: string
    route_option_id: string
  }>(
    `
      SELECT item.id AS item_id, route.id AS route_option_id,
        setup.id AS operation_setup_id
      FROM catalog.items item
      JOIN manufacturing.route_options route ON route.item_id = item.id
      JOIN manufacturing.production_floors floor
        ON floor.id = route.production_floor_id
      JOIN manufacturing.operation_setups setup ON setup.route_option_id = route.id
      WHERE item.organization_id = $1 AND lower(item.uid) = lower($2)
        AND (
          lower(route.route_code) = lower($3)
          OR lower(COALESCE(route.legacy_option_number, '')) = lower($3)
        )
        AND floor.code = $4
        AND (
          lower(COALESCE(setup.legacy_setup_code, '')) = lower($5)
          OR setup.setup_number = CASE
            WHEN $5 ~ '^[0-9]+$' THEN $5::integer ELSE -1 END
        )
        AND route.active AND setup.active
      ORDER BY route.revision DESC
      LIMIT 1
    `,
    [
      organizationId,
      requiredText(itemUid, "Item"),
      requiredText(routeCode, "Route"),
      productionFloorCode,
      requiredText(operationSetupCode, "Operation setup"),
    ]
  )
  if (!result.rows[0]) {
    throw new Error(
      "The quality item, route, or operation setup was not found."
    )
  }
  return result.rows[0]
}

async function qualityContextFor(
  client: PoolClient,
  organizationId: string,
  jobCardNumber: string,
  operationSetupCode: string,
  productionFloorCode: ProductionFloorCode
) {
  const result = await client.query<QualityContext>(
    `
      SELECT work_order.id AS work_order_id, work_order.item_id,
        selection.route_option_id, setup.id AS operation_setup_id
      FROM manufacturing.work_orders work_order
      JOIN manufacturing.route_selections selection
        ON selection.work_order_id = work_order.id
        AND selection.reversed_at IS NULL
      JOIN manufacturing.operation_setups setup
        ON setup.route_option_id = selection.route_option_id
      JOIN manufacturing.route_options route
        ON route.id = setup.route_option_id
      JOIN manufacturing.production_floors floor
        ON floor.id = route.production_floor_id
      WHERE work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower($2)
        AND floor.code = $4
        AND (
          lower(COALESCE(setup.legacy_setup_code, '')) = lower($3)
          OR setup.setup_number = CASE
            WHEN $3 ~ '^[0-9]+$' THEN $3::integer ELSE -1 END
        )
      LIMIT 1
    `,
    [
      organizationId,
      requiredText(jobCardNumber, "Job card"),
      requiredText(operationSetupCode, "Operation setup"),
      productionFloorCode,
    ]
  )
  if (!result.rows[0]) {
    throw new Error("The selected quality work-order setup was not found.")
  }
  return result.rows[0]
}

async function machineIdFor(
  client: PoolClient,
  organizationId: string,
  machineNumber: string | null | undefined,
  productionFloorCode: ProductionFloorCode
) {
  if (!machineNumber) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT machine.id FROM catalog.machines machine
      JOIN manufacturing.production_floors floor
        ON floor.id = machine.production_floor_id
      WHERE machine.organization_id = $1
        AND lower(machine.machine_number) = lower($2)
        AND floor.code = $3
    `,
    [organizationId, machineNumber, productionFloorCode]
  )
  if (!result.rows[0]) throw new Error("Machine was not found.")
  return result.rows[0].id
}

async function parameterFor(
  client: PoolClient,
  organizationId: string,
  operationSetupId: string,
  parameterCode: string,
  parameterName?: string | null
) {
  const result = await client.query<ParameterRow>(
    `
      SELECT id, data_type, lower_limit::text, upper_limit::text
      FROM quality.parameter_definitions
      WHERE organization_id = $1 AND operation_setup_id = $2
        AND (
          lower(parameter_code) = lower($3)
          OR (NULLIF($4, '') IS NOT NULL AND lower(name) = lower($4))
        )
        AND active
      ORDER BY CASE WHEN lower(parameter_code) = lower($3) THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [organizationId, operationSetupId, parameterCode, parameterName ?? null]
  )
  if (!result.rows[0]) {
    throw new Error(`Quality parameter ${parameterCode} was not found.`)
  }
  return result.rows[0]
}

async function replaceFirstPieceReadings(
  client: PoolClient,
  input: {
    dimensions: Array<{
      parameterCode: string
      parameterName?: string | null
      readings: Array<boolean | number | string | null>
    }>
    inspectionId: string
    operationSetupId: string
    organizationId: string
  }
) {
  await client.query(
    "DELETE FROM quality.first_piece_readings WHERE inspection_id = $1",
    [input.inspectionId]
  )
  for (const [dimensionIndex, dimension] of input.dimensions.entries()) {
    const parameter = await parameterFor(
      client,
      input.organizationId,
      input.operationSetupId,
      requiredText(dimension.parameterCode, "Quality parameter code"),
      dimension.parameterName
    )
    const results = dimension.readings.map((value) =>
      readingResult(parameter, value)
    )
    const first = valueColumns(
      dimension.readings[0] ?? null,
      parameter.data_type
    )
    const reading = await client.query<{ id: string }>(
      `
        INSERT INTO quality.first_piece_readings (
          organization_id, inspection_id, parameter_definition_id,
          numeric_value, text_value, boolean_value, result, sequence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        input.organizationId,
        input.inspectionId,
        parameter.id,
        first.numericValue,
        first.textValue,
        first.booleanValue,
        results.every((result) => result === "OK") ? "OK" : "Not OK",
        dimensionIndex + 1,
      ]
    )
    for (const [sampleIndex, value] of dimension.readings.entries()) {
      const columns = valueColumns(value, parameter.data_type)
      await client.query(
        `
          INSERT INTO quality.first_piece_reading_samples (
            organization_id, reading_id, sample_number, numeric_value,
            text_value, boolean_value, result, source_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          input.organizationId,
          reading.rows[0]!.id,
          sampleIndex + 1,
          columns.numericValue,
          columns.textValue,
          columns.booleanValue,
          results[sampleIndex],
          { value },
        ]
      )
    }
  }
}

async function replaceHourlyReadings(
  client: PoolClient,
  input: {
    hourlyCheckId: string
    operationSetupId: string
    organizationId: string
    readings: Array<{
      actualReading: boolean | number | string | null
      parameterCode: string
      parameterName?: string | null
      result?: string | null
    }>
  }
) {
  await client.query(
    "DELETE FROM quality.hourly_check_readings WHERE hourly_check_id = $1",
    [input.hourlyCheckId]
  )
  for (const [index, reading] of input.readings.entries()) {
    const parameter = await parameterFor(
      client,
      input.organizationId,
      input.operationSetupId,
      requiredText(reading.parameterCode, "Quality parameter code"),
      reading.parameterName
    )
    const columns = valueColumns(reading.actualReading, parameter.data_type)
    await client.query(
      `
        INSERT INTO quality.hourly_check_readings (
          organization_id, hourly_check_id, parameter_definition_id,
          numeric_value, text_value, boolean_value, result, sequence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.organizationId,
        input.hourlyCheckId,
        parameter.id,
        columns.numericValue,
        columns.textValue,
        columns.booleanValue,
        reading.result || readingResult(parameter, reading.actualReading),
        index + 1,
      ]
    )
  }
}

async function upsertChecklistItems(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    items: ChecklistItemInput[]
    organizationId: string
    payload: Record<string, unknown>
    templateId: string
  }
) {
  for (const item of input.items) {
    await client.query(
      `
        INSERT INTO quality.setup_checklist_template_items (
          organization_id, template_id, item_key, prompt, response_type,
          required, sequence, active, created_by_user_id,
          updated_by_user_id, source_system, source_table, source_id,
          source_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
          'mrm-dashboard', 'setup_checklist_master', $10, $11)
        ON CONFLICT (template_id, item_key)
        DO UPDATE SET prompt = EXCLUDED.prompt,
          response_type = EXCLUDED.response_type,
          required = EXCLUDED.required,
          sequence = EXCLUDED.sequence,
          active = EXCLUDED.active,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          source_payload = EXCLUDED.source_payload,
          updated_at = now(), row_version = quality.setup_checklist_template_items.row_version + 1
      `,
      [
        input.organizationId,
        input.templateId,
        requiredText(item.itemKey, "Checklist item key"),
        requiredText(item.prompt, "Checklist prompt"),
        requiredText(item.inputType, "Checklist response type"),
        item.required,
        item.sequence,
        item.active ?? true,
        input.actorUserId ?? null,
        randomUUID(),
        { ...input.payload, ...item },
      ]
    )
  }
}

function resultValueColumns(value: ResultInput["value"]) {
  if (typeof value === "boolean") {
    return { booleanValue: value, numericValue: null, textValue: null }
  }
  if (typeof value === "number") {
    return { booleanValue: null, numericValue: value, textValue: null }
  }
  return {
    booleanValue: null,
    numericValue: null,
    textValue: value === null ? null : String(value),
  }
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const nested = record.payload
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : record
}

function payloadRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row)
      )
    : []
}

function relationalValue(input: {
  booleanValue: boolean | null
  numericValue: string | null
  textValue: string | null
}) {
  if (input.booleanValue !== null) return input.booleanValue
  if (input.numericValue !== null) return Number(input.numericValue)
  return input.textValue
}

function readingValue(input: {
  booleanValue: boolean | null
  numericValue: string | null
  textValue: string | null
}) {
  const value = relationalValue(input)
  return value === null ? "" : String(value)
}

async function legacyRejectionTypeId(
  client: PoolClient,
  organizationId: string
) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quality.rejection_types (
        organization_id, code, name, source_system, source_table, source_id
      ) VALUES ($1, '__LEGACY_UNCATEGORIZED__', 'Legacy uncategorized rejection',
        'mrm-dashboard', 'generated_reference', $2)
      ON CONFLICT (organization_id, lower(code))
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [organizationId, `generated:rejection-type:${organizationId}`]
  )
  return result.rows[0]!.id
}

async function legacyRejectionReasonId(
  client: PoolClient,
  organizationId: string
) {
  const rejectionTypeId = await legacyRejectionTypeId(client, organizationId)
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quality.rejection_reasons (
        organization_id, rejection_type_id, code, name,
        source_system, source_table, source_id
      ) VALUES ($1, $2, '__LEGACY_UNCATEGORIZED__',
        'Legacy uncategorized reason', 'mrm-dashboard', 'generated_reference', $3)
      ON CONFLICT (rejection_type_id, code)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [
      organizationId,
      rejectionTypeId,
      `generated:rejection-reason:${organizationId}`,
    ]
  )
  return result.rows[0]!.id
}

export function createQualityRepository(options: RepositoryOptions) {
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

    async readHourlyQualityPage(input: {
      checkKey?: string | null
      organizationId: string
      productionFloorCode?: string
    }) {
      const productionFloorCode = normalizeProductionFloorCode(
        input.productionFloorCode
      )
      const runningRows = await pool.query<{
        jcNo: string
        jobCard: string
        machine: string
        machineType: string | null
        optionNumber: string
        partCode: string
        setupName: string
        setupNo: string
      }>(
        `
          SELECT machine.machine_number AS "machine",
            machine_type.name AS "machineType", item.uid AS "partCode",
            work_order.job_card_number AS "jobCard",
            work_order.job_card_number AS "jcNo",
            COALESCE(route.legacy_option_number, route.route_code)
              AS "optionNumber",
            COALESCE(setup.legacy_setup_code, setup.setup_number::text)
              AS "setupNo",
            COALESCE(setup.operation_name, setup.operation_code)
              AS "setupName"
          FROM manufacturing.shop_floor_setup_state state
          JOIN manufacturing.work_orders work_order
            ON work_order.id = state.work_order_id
          JOIN catalog.items item ON item.id = work_order.item_id
          JOIN manufacturing.route_options route
            ON route.id = state.route_option_id
          JOIN manufacturing.production_floors floor
            ON floor.id = route.production_floor_id
          JOIN manufacturing.operation_setups setup
            ON setup.id = state.operation_setup_id
          JOIN catalog.machines machine ON machine.id = state.machine_id
          LEFT JOIN catalog.machine_types machine_type
            ON machine_type.id = machine.machine_type_id
          WHERE state.organization_id = $1 AND floor.code = $2
            AND state.active
          ORDER BY machine.machine_number, work_order.job_card_number
          LIMIT 500
        `,
        [input.organizationId, productionFloorCode]
      )
      const parameterRows = await pool.query<{
        code: string
        createdAt: Date
        inputType: string
        instrumentUsed: string | null
        optionNumber: string
        parameterName: string
        partNo: string
        required: string
        sequence: number
        setupNo: string
        sourcePayload: unknown
        specification: string | null
        status: string
        toleranceMinus: string | null
        tolerancePlus: string | null
      }>(
        `
          SELECT parameter.parameter_code AS "code", parameter.name AS "parameterName",
            item.uid AS "partNo",
            COALESCE(route.legacy_option_number, route.route_code)
              AS "optionNumber",
            COALESCE(setup.legacy_setup_code, setup.setup_number::text)
              AS "setupNo",
            parameter.sequence, parameter.created_at AS "createdAt",
            CASE WHEN parameter.active THEN 'Active' ELSE 'Inactive' END AS "status",
            COALESCE(parameter.source_payload->'payload'->>'inputType',
              parameter.source_payload->>'inputType',
              CASE parameter.data_type WHEN 'boolean' THEN 'pass_fail'
                WHEN 'numeric' THEN 'number' ELSE 'text' END) AS "inputType",
            COALESCE(parameter.source_payload->'payload'->>'instrumentUsed',
              parameter.source_payload->>'instrumentUsed') AS "instrumentUsed",
            COALESCE(parameter.source_payload->'payload'->>'specification',
              parameter.source_payload->>'specification',
              parameter.nominal_value::text) AS "specification",
            COALESCE(parameter.source_payload->'payload'->>'toleranceMinus',
              parameter.source_payload->>'toleranceMinus') AS "toleranceMinus",
            COALESCE(parameter.source_payload->'payload'->>'tolerancePlus',
              parameter.source_payload->>'tolerancePlus') AS "tolerancePlus",
            COALESCE(parameter.source_payload->'payload'->>'required',
              parameter.source_payload->>'required', 'Yes') AS "required",
            parameter.source_payload AS "sourcePayload"
          FROM quality.parameter_definitions parameter
          JOIN catalog.items item ON item.id = parameter.item_id
          JOIN manufacturing.route_options route ON route.id = parameter.route_option_id
          JOIN manufacturing.production_floors floor
            ON floor.id = route.production_floor_id
          JOIN manufacturing.operation_setups setup
            ON setup.id = parameter.operation_setup_id
          WHERE parameter.organization_id = $1 AND floor.code = $2
          ORDER BY item.uid, route.route_code, setup.setup_number,
            parameter.sequence, parameter.parameter_code
          LIMIT 2000
        `,
        [input.organizationId, productionFloorCode]
      )
      const qualityParameterMasterRows = parameterRows.rows.map(
        ({ sourcePayload, ...row }) => ({
          ...payloadRecord(sourcePayload),
          ...row,
        })
      )

      let existingCheck: Record<string, unknown> | null = null
      if (input.checkKey) {
        const checks = await pool.query<{
          checkId: string
          checkedAt: Date
          checkedBy: string | null
          id: string
          jcNo: string
          jobCard: string
          machine: string | null
          machineType: string | null
          optionNumber: string
          partCode: string
          setupName: string
          setupNo: string
          sourcePayload: unknown
          status: string
        }>(
          `
            SELECT check_row.id::text AS "id", check_row.check_key AS "checkId",
              check_row.checked_at AS "checkedAt", check_row.status,
              COALESCE(check_row.legacy_checker, checker.email) AS "checkedBy",
              work_order.job_card_number AS "jobCard",
              work_order.job_card_number AS "jcNo", item.uid AS "partCode",
              machine.machine_number AS "machine", machine_type.name AS "machineType",
              COALESCE(route.legacy_option_number, route.route_code)
                AS "optionNumber",
              COALESCE(setup.legacy_setup_code, setup.setup_number::text)
                AS "setupNo",
              COALESCE(setup.operation_name, setup.operation_code) AS "setupName",
              check_row.source_payload AS "sourcePayload"
            FROM quality.hourly_checks check_row
            JOIN manufacturing.work_orders work_order
              ON work_order.id = check_row.work_order_id
            JOIN catalog.items item ON item.id = work_order.item_id
            JOIN manufacturing.operation_setups setup
              ON setup.id = check_row.operation_setup_id
            JOIN manufacturing.route_options route ON route.id = setup.route_option_id
            JOIN manufacturing.production_floors floor
              ON floor.id = route.production_floor_id
            LEFT JOIN catalog.machines machine ON machine.id = check_row.machine_id
            LEFT JOIN catalog.machine_types machine_type
              ON machine_type.id = machine.machine_type_id
            LEFT JOIN identity.users checker ON checker.id = check_row.checker_user_id
            WHERE check_row.organization_id = $1
              AND lower(check_row.check_key) = lower($2)
              AND floor.code = $3
              AND check_row.reversed_at IS NULL
            LIMIT 1
          `,
          [input.organizationId, input.checkKey, productionFloorCode]
        )
        const check = checks.rows[0]
        if (check) {
          const sourcePayload = payloadRecord(check.sourcePayload)
          const sourceReadings = payloadRows(sourcePayload.readings)
          const readings = await pool.query<{
            booleanValue: boolean | null
            code: string
            numericValue: string | null
            parameterName: string
            result: string
            sequence: number
            textValue: string | null
          }>(
            `
              SELECT parameter.parameter_code AS "code",
                parameter.name AS "parameterName", reading.result,
                reading.sequence, reading.numeric_value::text AS "numericValue",
                reading.text_value AS "textValue",
                reading.boolean_value AS "booleanValue"
              FROM quality.hourly_check_readings reading
              JOIN quality.parameter_definitions parameter
                ON parameter.id = reading.parameter_definition_id
              JOIN quality.hourly_checks check_row
                ON check_row.id = reading.hourly_check_id
              WHERE check_row.organization_id = $1 AND check_row.id = $2
              ORDER BY reading.sequence, parameter.parameter_code
              LIMIT 500
            `,
            [input.organizationId, check.id]
          )
          existingCheck = {
            ...sourcePayload,
            ...check,
            prodDate:
              sourcePayload.prodDate ??
              check.checkedAt.toISOString().slice(0, 10),
            readings: readings.rows.map((reading) => {
              const sourceReading = sourceReadings.find(
                (row) =>
                  String(row.code ?? row.parameterCode ?? "").toLowerCase() ===
                  reading.code.toLowerCase()
              )
              return {
                ...(sourceReading ?? {}),
                actualReading: readingValue(reading),
                code: reading.code,
                parameterName: reading.parameterName,
                result: reading.result,
              }
            }),
          }
          delete existingCheck.id
          delete existingCheck.sourcePayload
        }
      }

      return {
        existingCheck,
        qualityParameterMasterRows,
        runningRows: runningRows.rows,
      }
    },

    async readSetupChecklistPage(input: {
      organizationId: string
      productionFloorCode?: string
      sessionKey?: string | null
    }) {
      const productionFloorCode = normalizeProductionFloorCode(
        input.productionFloorCode
      )
      const masters = await pool.query<{
        checkPoint: string
        createdAt: Date
        inputType: string
        itemKey: string
        required: string
        section: string
        sequence: number
        sourcePayload: unknown
        status: string
        version: string
      }>(
        `
          SELECT item.item_key AS "itemKey", item.prompt AS "checkPoint",
            item.response_type AS "inputType", item.sequence,
            CASE WHEN item.required THEN 'Yes' ELSE 'No' END AS "required",
            CASE WHEN template.active AND item.active
              THEN 'Active' ELSE 'Inactive' END AS "status",
            COALESCE(item.source_payload->'payload'->>'section',
              item.source_payload->>'section', 'Pre setting / setting') AS "section",
            COALESCE(item.source_payload->'payload'->>'version',
              item.source_payload->>'version',
              template.source_payload->'payload'->>'version',
              template.source_payload->>'version', template.code) AS "version",
            item.created_at AS "createdAt", item.source_payload AS "sourcePayload"
          FROM quality.setup_checklist_templates template
          JOIN quality.setup_checklist_template_items item
            ON item.template_id = template.id
          WHERE template.organization_id = $1
          ORDER BY template.revision, template.code, item.sequence, item.item_key
          LIMIT 2000
        `,
        [input.organizationId]
      )
      const setupChecklistMasterRows = masters.rows.map(
        ({ sourcePayload, ...row }) => ({
          ...payloadRecord(sourcePayload),
          ...row,
        })
      )

      let setupChecklistSession: Record<string, unknown> | undefined
      if (input.sessionKey) {
        const sessions = await pool.query<{
          completedAt: Date | null
          endedBy: string | null
          id: string
          jcNo: string
          machine: string | null
          machineType: string | null
          masterVersion: string
          optionNumber: string
          partCode: string
          sessionId: string
          setupName: string
          setupNo: string
          sourcePayload: unknown
          startedAt: Date
          status: string
          templateId: string
        }>(
          `
            SELECT session.id::text AS "id", session.session_key AS "sessionId",
              session.status,
              session.started_at AS "startedAt",
              session.completed_at AS "completedAt",
              COALESCE(session.legacy_completer, completer.email) AS "endedBy",
              template.id::text AS "templateId",
              COALESCE(template.source_payload->'payload'->>'version',
                template.source_payload->>'version', template.code)
                AS "masterVersion",
              work_order.job_card_number AS "jcNo", item.uid AS "partCode",
              machine.machine_number AS "machine", machine_type.name AS "machineType",
              COALESCE(route.legacy_option_number, route.route_code)
                AS "optionNumber",
              COALESCE(setup.legacy_setup_code, setup.setup_number::text)
                AS "setupNo",
              COALESCE(setup.operation_name, setup.operation_code) AS "setupName",
              session.source_payload AS "sourcePayload"
            FROM quality.setup_checklist_sessions session
            JOIN quality.setup_checklist_templates template
              ON template.id = session.template_id
            JOIN manufacturing.work_orders work_order
              ON work_order.id = session.work_order_id
            JOIN catalog.items item ON item.id = work_order.item_id
            JOIN manufacturing.operation_setups setup
              ON setup.id = session.operation_setup_id
            JOIN manufacturing.route_options route ON route.id = setup.route_option_id
            JOIN manufacturing.production_floors floor
              ON floor.id = route.production_floor_id
            LEFT JOIN catalog.machines machine ON machine.id = session.machine_id
            LEFT JOIN catalog.machine_types machine_type
              ON machine_type.id = machine.machine_type_id
            LEFT JOIN identity.users completer
              ON completer.id = session.completed_by_user_id
            WHERE session.organization_id = $1
              AND lower(session.session_key) = lower($2)
              AND floor.code = $3
              AND session.reversed_at IS NULL
            LIMIT 1
          `,
          [input.organizationId, input.sessionKey, productionFloorCode]
        )
        const session = sessions.rows[0]
        if (session) {
          const itemRows = await pool.query<{
            endBooleanValue: boolean | null
            endNumericValue: string | null
            endTextValue: string | null
            inputType: string
            itemKey: string
            prompt: string
            required: boolean
            section: string
            sequence: number
            sourcePayload: unknown
            startBooleanValue: boolean | null
            startNumericValue: string | null
            startTextValue: string | null
          }>(
            `
              SELECT item.item_key AS "itemKey", item.prompt,
                item.response_type AS "inputType", item.required, item.sequence,
                COALESCE(item.source_payload->'payload'->>'section',
                  item.source_payload->>'section', 'Pre setting / setting') AS "section",
                item.source_payload AS "sourcePayload",
                start_result.response_text AS "startTextValue",
                start_result.response_numeric::text AS "startNumericValue",
                start_result.response_boolean AS "startBooleanValue",
                end_result.response_text AS "endTextValue",
                end_result.response_numeric::text AS "endNumericValue",
                end_result.response_boolean AS "endBooleanValue"
              FROM quality.setup_checklist_template_items item
              LEFT JOIN quality.setup_checklist_results start_result
                ON start_result.template_item_id = item.id
                AND start_result.session_id = $2 AND start_result.phase = 'start'
              LEFT JOIN quality.setup_checklist_results end_result
                ON end_result.template_item_id = item.id
                AND end_result.session_id = $2 AND end_result.phase = 'end'
              WHERE item.organization_id = $1 AND item.template_id = $3
              ORDER BY item.sequence, item.item_key
              LIMIT 500
            `,
            [input.organizationId, session.id, session.templateId]
          )
          const sourcePayload = payloadRecord(session.sourcePayload)
          setupChecklistSession = {
            ...sourcePayload,
            ...session,
            endedAt: sourcePayload.endedAt ?? session.completedAt,
            endedBy: sourcePayload.endedBy ?? session.endedBy,
            items: itemRows.rows.map(
              ({ sourcePayload: itemPayload, ...item }) => ({
                ...payloadRecord(itemPayload),
                checkPoint: item.prompt,
                inputType: item.inputType,
                itemKey: item.itemKey,
                required: item.required ? "Yes" : "No",
                section: item.section,
                sequence: item.sequence,
                startValue: relationalValue({
                  booleanValue: item.startBooleanValue,
                  numericValue: item.startNumericValue,
                  textValue: item.startTextValue,
                }),
                endValue: relationalValue({
                  booleanValue: item.endBooleanValue,
                  numericValue: item.endNumericValue,
                  textValue: item.endTextValue,
                }),
              })
            ),
            startedAt: sourcePayload.startedAt ?? session.startedAt,
          }
          delete setupChecklistSession.id
          delete setupChecklistSession.sourcePayload
          delete setupChecklistSession.templateId
        }
      }

      return { setupChecklistMasterRows, setupChecklistSession }
    },

    async upsertRejectionType(input: {
      active?: boolean
      actorUserId?: string | null
      code: string
      name: string
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        const code = await generatedQualityMasterCode(client, input.organizationId, input.code, "rejection-type")
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO quality.rejection_types (
              organization_id, code, name, active,
              created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            ) VALUES ($1, $2, $3, $4, $5, $5,
              'mrm-dashboard', 'rejection_type_master', $6, $7)
            ON CONFLICT (organization_id, lower(code))
            DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload, updated_at = now(),
              row_version = quality.rejection_types.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            code,
            requiredText(input.name, "Rejection type name"),
            input.active ?? true,
            input.actorUserId ?? null,
            `rejection_type_master:${input.organizationId}:${code.toLowerCase()}`,
            { ...input.payload, code },
          ]
        )
        return result.rows[0]!
      })
    },

    async upsertRejectionReason(input: {
      active?: boolean
      actorUserId?: string | null
      code: string
      name: string
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        const rejectionTypeId = await legacyRejectionTypeId(
          client,
          input.organizationId
        )
        const code = await generatedQualityMasterCode(client, input.organizationId, input.code, "rejection-reason")
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO quality.rejection_reasons (
              organization_id, rejection_type_id, code, name, active,
              created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $6,
              'mrm-dashboard', 'rejection_reason_master', $7, $8)
            ON CONFLICT (rejection_type_id, code)
            DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload, updated_at = now(),
              row_version = quality.rejection_reasons.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            rejectionTypeId,
            code,
            requiredText(input.name, "Rejection reason name"),
            input.active ?? true,
            input.actorUserId ?? null,
            `rejection_reason_master:${input.organizationId}:${code.toLowerCase()}`,
            { ...input.payload, code },
          ]
        )
        return result.rows[0]!
      })
    },

    async upsertRejectionRemark(input: {
      active?: boolean
      actorUserId?: string | null
      code: string
      organizationId: string
      payload: Record<string, unknown>
      remark: string
    }) {
      return transaction(pool, async (client) => {
        const rejectionReasonId = await legacyRejectionReasonId(
          client,
          input.organizationId
        )
        const code = await generatedQualityMasterCode(client, input.organizationId, input.code, "rejection-remark")
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO quality.rejection_remarks (
              organization_id, rejection_reason_id, code, remark, active,
              created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $6,
              'mrm-dashboard', 'rejection_remark_master', $7, $8)
            ON CONFLICT (rejection_reason_id, code)
            DO UPDATE SET remark = EXCLUDED.remark, active = EXCLUDED.active,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload, updated_at = now(),
              row_version = quality.rejection_remarks.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            rejectionReasonId,
            code,
            requiredText(input.remark, "Rejection remark"),
            input.active ?? true,
            input.actorUserId ?? null,
            `rejection_remark_master:${input.organizationId}:${code.toLowerCase()}`,
            { ...input.payload, code },
          ]
        )
        return result.rows[0]!
      })
    },

    async upsertParameterDefinition(input: {
      actorUserId?: string | null
      dataType: "boolean" | "numeric" | "text"
      inputType?: string | null
      itemUid: string
      lowerLimit?: number | null
      name: string
      nominalValue?: number | null
      operationSetupCode: string
      organizationId: string
      parameterCode: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      routeCode: string
      sequence?: number
      unit?: string | null
      upperLimit?: number | null
      active?: boolean
    }) {
      return transaction(pool, async (client) => {
        const context = await routeAndSetupFor(
          client,
          input.organizationId,
          input.itemUid,
          input.routeCode,
          input.operationSetupCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO quality.parameter_definitions (
              organization_id, item_id, route_option_id, operation_setup_id,
              parameter_code, name, data_type, unit, lower_limit,
              upper_limit, nominal_value, sequence, active,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $14, 'mrm-dashboard',
              'quality_parameter_master', $15, $16)
            ON CONFLICT (item_id, route_option_id, operation_setup_id,
              lower(parameter_code))
            DO UPDATE SET name = EXCLUDED.name, data_type = EXCLUDED.data_type,
              unit = EXCLUDED.unit, lower_limit = EXCLUDED.lower_limit,
              upper_limit = EXCLUDED.upper_limit,
              nominal_value = EXCLUDED.nominal_value,
              sequence = EXCLUDED.sequence, active = EXCLUDED.active,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload,
              updated_at = now(), row_version = quality.parameter_definitions.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            context.item_id,
            context.route_option_id,
            context.operation_setup_id,
            requiredText(input.parameterCode, "Quality parameter code"),
            requiredText(input.name, "Quality parameter name"),
            input.dataType,
            input.unit ?? null,
            input.lowerLimit ?? null,
            input.upperLimit ?? null,
            input.nominalValue ?? null,
            input.sequence ?? 0,
            input.active ?? true,
            input.actorUserId ?? null,
            randomUUID(),
            { ...input.payload, inputType: input.inputType },
          ]
        )
        return result.rows[0]!
      })
    },

    async recordFirstPieceInspection(input: {
      actorUserId?: string | null
      approvedBy?: string | null
      dimensions: Array<{
        parameterCode: string
        parameterName?: string | null
        readings: Array<boolean | number | string | null>
      }>
      inspectedAt: string
      inspectionKey: string
      jobCardNumber: string
      machineNumber?: string | null
      notes?: string | null
      operationSetupCode: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      status: string
    }) {
      return transaction(pool, async (client) => {
        const inspectionKey = requiredText(
          input.inspectionKey,
          "First-piece inspection key"
        )
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('quality.first-piece'), hashtext(lower($1)))",
          [inspectionKey]
        )
        const context = await qualityContextFor(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.operationSetupCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM quality.first_piece_inspections
            WHERE organization_id = $1 AND lower(check_key) = lower($2)
              AND operation_setup_id = $3
              AND reversed_at IS NULL FOR UPDATE
          `,
          [input.organizationId, inspectionKey, context.operation_setup_id]
        )
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE quality.first_piece_inspections
                SET machine_id = $1,
                  inspected_at = COALESCE(migration.try_timestamptz($2), now()),
                  status = $3, inspector_user_id = $4, legacy_inspector = $5,
                  notes = $6, source_payload = $7
                WHERE id = $8 RETURNING id
              `,
              [
                machineId,
                input.inspectedAt,
                requiredText(input.status, "Inspection status"),
                input.actorUserId ?? null,
                input.approvedBy ?? null,
                input.notes ?? null,
                input.payload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO quality.first_piece_inspections (
                  organization_id, work_order_id, operation_setup_id,
                  machine_id, inspected_at, status, inspector_user_id,
                  legacy_inspector, notes, check_key, source_system,
                  source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4,
                  COALESCE(migration.try_timestamptz($5), now()), $6, $7, $8,
                  $9, $10, 'mrm-dashboard', 'first_piece_inspection_report',
                  $11, $12)
                RETURNING id
              `,
              [
                input.organizationId,
                context.work_order_id,
                context.operation_setup_id,
                machineId,
                input.inspectedAt,
                requiredText(input.status, "Inspection status"),
                input.actorUserId ?? null,
                input.approvedBy ?? null,
                input.notes ?? null,
                inspectionKey,
                randomUUID(),
                input.payload,
              ]
            )
        await replaceFirstPieceReadings(client, {
          dimensions: input.dimensions,
          inspectionId: result.rows[0]!.id,
          operationSetupId: context.operation_setup_id,
          organizationId: input.organizationId,
        })
        return result.rows[0]!
      })
    },

    async recordHourlyCheck(input: {
      actorUserId?: string | null
      checkKey: string
      checkedAt: string
      checkedBy?: string | null
      jobCardNumber: string
      machineNumber?: string | null
      operationSetupCode: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      readings: Array<{
        actualReading: boolean | number | string | null
        parameterCode: string
        parameterName?: string | null
        result?: string | null
      }>
      status: string
    }) {
      return transaction(pool, async (client) => {
        const checkKey = requiredText(input.checkKey, "Hourly check key")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('quality.hourly'), hashtext(lower($1)))",
          [checkKey]
        )
        const context = await qualityContextFor(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.operationSetupCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM quality.hourly_checks
            WHERE organization_id = $1 AND lower(check_key) = lower($2)
              AND operation_setup_id = $3
              AND reversed_at IS NULL FOR UPDATE
          `,
          [input.organizationId, checkKey, context.operation_setup_id]
        )
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE quality.hourly_checks
                SET machine_id = $1,
                  checked_at = COALESCE(migration.try_timestamptz($2), now()),
                  status = $3, checker_user_id = $4, legacy_checker = $5,
                  source_payload = $6
                WHERE id = $7 RETURNING id
              `,
              [
                machineId,
                input.checkedAt,
                requiredText(input.status, "Hourly check status"),
                input.actorUserId ?? null,
                input.checkedBy ?? null,
                input.payload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO quality.hourly_checks (
                  organization_id, work_order_id, operation_setup_id,
                  machine_id, checked_at, status, checker_user_id,
                  legacy_checker, check_key, source_system, source_table,
                  source_id, source_payload
                )
                VALUES ($1, $2, $3, $4,
                  COALESCE(migration.try_timestamptz($5), now()), $6, $7, $8,
                  $9, 'mrm-dashboard', 'hourly_quality_check', $10, $11)
                RETURNING id
              `,
              [
                input.organizationId,
                context.work_order_id,
                context.operation_setup_id,
                machineId,
                input.checkedAt,
                requiredText(input.status, "Hourly check status"),
                input.actorUserId ?? null,
                input.checkedBy ?? null,
                checkKey,
                randomUUID(),
                input.payload,
              ]
            )
        await replaceHourlyReadings(client, {
          hourlyCheckId: result.rows[0]!.id,
          operationSetupId: context.operation_setup_id,
          organizationId: input.organizationId,
          readings: input.readings,
        })
        return result.rows[0]!
      })
    },

    async upsertSetupChecklistTemplate(input: {
      actorUserId?: string | null
      active?: boolean
      code: string
      items: ChecklistItemInput[]
      name: string
      organizationId: string
      payload: Record<string, unknown>
      revision: number
    }) {
      return transaction(pool, async (client) => {
        const code = await generatedQualityMasterCode(
          client,
          input.organizationId,
          input.code,
          "setup-checklist"
        )
        const payload = {
          ...input.payload,
          checklistCode: code,
          version: code,
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO quality.setup_checklist_templates (
              organization_id, code, name, revision, active,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $6, 'mrm-dashboard',
              'setup_checklist_master', $7, $8)
            ON CONFLICT (organization_id, code, revision)
            DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload,
              updated_at = now(), row_version = quality.setup_checklist_templates.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            code,
            requiredText(input.name, "Setup checklist name"),
            input.revision,
            input.active ?? true,
            input.actorUserId ?? null,
            randomUUID(),
            payload,
          ]
        )
        await upsertChecklistItems(client, {
          actorUserId: input.actorUserId,
          items: input.items,
          organizationId: input.organizationId,
          payload,
          templateId: result.rows[0]!.id,
        })
        return result.rows[0]!
      })
    },

    async saveSetupChecklistSession(input: {
      actorUserId?: string | null
      completedAt?: string | null
      completedBy?: string | null
      jobCardNumber: string
      machineNumber?: string | null
      operationSetupCode: string
      organizationId: string
      payload: Record<string, unknown>
      phase: "end" | "start"
      productionFloorCode?: string
      results: ResultInput[]
      sessionKey: string
      status: string
      templateCode: string
    }) {
      return transaction(pool, async (client) => {
        const sessionKey = requiredText(
          input.sessionKey,
          "Setup checklist session key"
        )
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('quality.setup-checklist'), hashtext(lower($1)))",
          [sessionKey]
        )
        const context = await qualityContextFor(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.operationSetupCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const template = await client.query<{ id: string }>(
          `
            SELECT id FROM quality.setup_checklist_templates
            WHERE organization_id = $1 AND lower(code) = lower($2) AND active
            ORDER BY revision DESC LIMIT 1
          `,
          [
            input.organizationId,
            requiredText(input.templateCode, "Setup checklist template"),
          ]
        )
        if (!template.rows[0]) {
          throw new Error("Setup checklist template was not found.")
        }
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM quality.setup_checklist_sessions
            WHERE organization_id = $1 AND lower(session_key) = lower($2)
              AND operation_setup_id = $3
              AND reversed_at IS NULL FOR UPDATE
          `,
          [input.organizationId, sessionKey, context.operation_setup_id]
        )
        const completedAt =
          input.phase === "end"
            ? input.completedAt || new Date().toISOString()
            : null
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE quality.setup_checklist_sessions
                SET template_id = $1, machine_id = $2, status = $3,
                  completed_at = COALESCE(migration.try_timestamptz($4), completed_at),
                  completed_by_user_id = $5, legacy_completer = $6,
                  source_payload = $7
                WHERE id = $8 RETURNING id
              `,
              [
                template.rows[0].id,
                machineId,
                requiredText(input.status, "Setup checklist status"),
                completedAt,
                input.actorUserId ?? null,
                input.completedBy ?? null,
                input.payload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO quality.setup_checklist_sessions (
                  organization_id, template_id, work_order_id,
                  operation_setup_id, machine_id, status, completed_at,
                  completed_by_user_id, legacy_completer, session_key,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6,
                  migration.try_timestamptz($7), $8, $9, $10,
                  'mrm-dashboard', 'setup_checklist_session', $11, $12)
                RETURNING id
              `,
              [
                input.organizationId,
                template.rows[0].id,
                context.work_order_id,
                context.operation_setup_id,
                machineId,
                requiredText(input.status, "Setup checklist status"),
                completedAt,
                input.actorUserId ?? null,
                input.completedBy ?? null,
                sessionKey,
                randomUUID(),
                input.payload,
              ]
            )
        for (const itemResult of input.results) {
          const item = await client.query<{ id: string }>(
            `
              SELECT id FROM quality.setup_checklist_template_items
              WHERE template_id = $1 AND active AND (
                lower(item_key) = lower($2)
                OR (
                  $3::integer IS NOT NULL
                  AND sequence = $3::integer
                  AND (
                    NULLIF($4, '') IS NULL
                    OR lower(prompt) = lower($4)
                  )
                )
              )
              ORDER BY
                CASE WHEN lower(item_key) = lower($2) THEN 0 ELSE 1 END,
                CASE WHEN lower(prompt) = lower(COALESCE($4, '')) THEN 0 ELSE 1 END,
                id
              LIMIT 1
            `,
            [
              template.rows[0].id,
              requiredText(itemResult.itemKey, "Checklist item key"),
              itemResult.sequence ?? null,
              itemResult.itemPrompt ?? null,
            ]
          )
          if (!item.rows[0]) {
            throw new Error(
              `Setup checklist item ${itemResult.itemKey} was not found.`
            )
          }
          const columns = resultValueColumns(itemResult.value)
          await client.query(
            `
              INSERT INTO quality.setup_checklist_results (
                organization_id, session_id, template_item_id, response_text,
                response_numeric, response_boolean, passed, notes,
                recorded_by_user_id, phase
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (session_id, template_item_id, phase)
              DO UPDATE SET response_text = EXCLUDED.response_text,
                response_numeric = EXCLUDED.response_numeric,
                response_boolean = EXCLUDED.response_boolean,
                passed = EXCLUDED.passed, notes = EXCLUDED.notes,
                recorded_at = now(),
                recorded_by_user_id = EXCLUDED.recorded_by_user_id
            `,
            [
              input.organizationId,
              result.rows[0]!.id,
              item.rows[0].id,
              columns.textValue,
              columns.numericValue,
              columns.booleanValue,
              itemResult.passed ?? null,
              itemResult.notes ?? null,
              input.actorUserId ?? null,
              input.phase,
            ]
          )
        }
        return result.rows[0]!
      })
    },
  }
}
