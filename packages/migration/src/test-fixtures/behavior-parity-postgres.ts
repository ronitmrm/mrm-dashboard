import { randomUUID } from "node:crypto"

import {
  createAccessAdministrationRepository,
  createAuthorizationRepository,
  createCommercialCostingRepository,
  createCommercialMasterRepository,
  createCommercialOrdersRepository,
  createCommercialReportingRepository,
  createCommercialRevisionsRepository,
  createCommercialWorkflowRepository,
  createCustomerRepository,
  createDashboardPlanningRepository,
  createDashboardReadModelRepository,
  createProductRepository,
  createProductionShopFloorRepository,
  createQualityRepository,
  createRecruitmentRepository,
  createWorkforceRepository,
  migrateDatabase,
} from "@workspace/db"
import {
  createDurableRefreshWorker,
  type RedisAcceleration,
} from "@workspace/runtime"
import { Pool } from "pg"

import type {
  BehaviorCapture,
  BehaviorSnapshot,
} from "../behavior-parity-oracle"

type CaptureOptions = { connectionString: string }

type FailureCategory =
  | "authorization"
  | "conflict"
  | "infrastructure"
  | "missing-record"
  | "validation"

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError"
}

function errorCategory(
  error: unknown,
  boundary: "domain" | "infrastructure" = "domain"
): FailureCategory {
  if (boundary === "infrastructure") return "infrastructure"
  const details = record(error)
  const code = details.code ?? record(details.cause).code
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (code === "23505" || message.includes("duplicate key")) return "conflict"
  if (message.includes("not found")) return "missing-record"
  if (error instanceof Error) return "validation"
  return "infrastructure"
}

function keySummary(payload: Record<string, unknown>) {
  const value = record(payload.dataEntry).keySummary
  const rows: unknown[] = Array.isArray(value) ? value : []
  return rows.map((value) => {
    const row = record(value)
    return {
      entryType: String(row.entryType),
      rows: Number(row.rows),
    }
  })
}

function sourceCoverage(payload: Record<string, unknown>) {
  const coverage = record(payload.sourceCoverage)
  return Object.fromEntries(
    ["corrections", "dataEntries", "physicalRows"].map((category) => {
      const details = record(coverage[category])
      const groups = record(details.groups)
      return [
        category,
        {
          available: Number(details.available),
          limit: Number(details.limit),
          returned: Number(details.returned),
          truncated: details.truncated === true,
          truncatedGroups: stringArray(details.truncatedGroups),
          ...(Object.keys(groups).length
            ? {
                groups: Object.fromEntries(
                  Object.entries(groups).map(([group, value]) => {
                    const facts = record(value)
                    return [
                      group,
                      {
                        available: Number(facts.available),
                        limit: Number(facts.limit),
                        returned: Number(facts.returned),
                        truncated: facts.truncated === true,
                      },
                    ]
                  })
                ),
              }
            : {}),
        },
      ]
    })
  )
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function normalizeObservableValue(value: unknown): BehaviorSnapshot {
  if (value instanceof Date) return "<timestamp>"
  if (typeof value === "string") {
    if (ISO_TIMESTAMP_PATTERN.test(value)) return "<timestamp>"
    return value.replace(UUID_PATTERN, "<generated-id>")
  }
  if (Array.isArray(value)) return value.map(normalizeObservableValue)
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value
  }
  if (typeof value !== "object") return String(value)
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeObservableValue(entry)])
  )
}

function auditSubject(
  after: Record<string, unknown>,
  before: Record<string, unknown>,
  targetSchema: string,
  targetTable: string,
  explicitSubject: string | null
) {
  const state = { ...before, ...after }
  const businessKey = [
    "postCode",
    "post_code",
    "candidateName",
    "candidate_name",
    "customerPartCode",
    "customer_part_code",
    "customerUid",
    "customer_uid",
    "enquiryNumber",
    "enquiry_number",
    "poNumber",
    "po_number",
    "uid",
    "code",
    "name",
  ].find((key) => typeof state[key] === "string")
  const subject =
    explicitSubject ?? (businessKey ? String(state[businessKey]) : null)
  return `${targetSchema}.${targetTable}${subject ? `:${subject}` : ""}`
}

type DashboardRepository = ReturnType<typeof createDashboardReadModelRepository>

async function captureAuditEvidence(
  pool: Pool,
  organizationId: string,
  oracleUserId: string
) {
  const events = await pool.query<{
    actor_user_id: string | null
    after_state: unknown
    before_state: unknown
    business_subject: string | null
    event_type: string
    metadata: unknown
    occurred_at: Date
    reason: string | null
    target_schema: string
    target_table: string
  }>(
    `
      SELECT event.actor_user_id, event.after_state, event.before_state,
        event.event_type, event.metadata, event.target_schema,
        event.target_table, event.occurred_at, event.reason,
        COALESCE(
          event.after_state->>'postCode', event.after_state->>'post_code',
          event.before_state->>'postCode', event.before_state->>'post_code',
          event.after_state->>'customerPartCode',
          event.after_state->>'customer_part_code',
          event.before_state->>'customerPartCode',
          event.before_state->>'customer_part_code',
          (SELECT post.post_code FROM recruitment.posts post
            WHERE event.target_schema = 'recruitment'
              AND event.target_table = 'posts' AND post.id = event.target_id),
          (SELECT candidate.name
            FROM recruitment.applications application
            JOIN recruitment.candidates candidate
              ON candidate.id = application.candidate_id
            WHERE event.target_schema = 'recruitment'
              AND event.target_table = 'applications'
              AND application.id = event.target_id),
          (SELECT item.customer_part_code FROM sales.enquiry_items item
            WHERE event.target_schema = 'sales'
              AND event.target_table = 'enquiry_items'
              AND item.id = event.target_id),
          (SELECT product.uid FROM catalog.items product
            WHERE event.target_schema = 'catalog'
              AND event.target_table = 'items'
              AND product.id = event.target_id),
          (SELECT purchase_order.po_number FROM sales.purchase_orders purchase_order
            WHERE event.target_schema = 'sales'
              AND event.target_table = 'purchase_orders'
              AND purchase_order.id = event.target_id),
          (SELECT customer.customer_uid FROM sales.customers customer
            WHERE event.target_schema = 'sales'
              AND event.target_table = 'customers'
              AND customer.id = event.target_id)
        ) AS business_subject
      FROM audit.events event
      WHERE event.organization_id = $1
      ORDER BY event.occurred_at, event.event_type, event.target_schema,
        event.target_table, event.source_table, event.source_id
    `,
    [organizationId]
  )
  const normalized = events.rows.map((event) => {
    const after = record(event.after_state)
    const before = record(event.before_state)
    const metadata = record(event.metadata)
    return {
      actor: event.actor_user_id === oracleUserId ? "oracle-user" : "system",
      after: normalizeObservableValue(after),
      before: normalizeObservableValue(before),
      eventType: event.event_type,
      inputOrder:
        typeof (
          metadata.commandOrdinal ??
          metadata.rowNumber ??
          metadata.row_number
        ) === "number"
          ? Number(
              metadata.commandOrdinal ??
                metadata.rowNumber ??
                metadata.row_number
            )
          : null,
      metadata: normalizeObservableValue(metadata),
      occurredAt: event.occurred_at.toISOString(),
      reason: event.reason,
      subject: auditSubject(
        after,
        before,
        event.target_schema,
        event.target_table,
        event.business_subject
      ),
    }
  })

  const transactionTimestamps = [
    ...new Set(normalized.map((event) => event.occurredAt)),
  ].sort()
  return transactionTimestamps.map((occurredAt, transactionOrder) => ({
    events: normalized
      .filter((event) => event.occurredAt === occurredAt)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      )
      .map(({ occurredAt: eventTimestamp, ...event }) => {
        if (eventTimestamp !== occurredAt) {
          throw new Error("Audit transaction grouping lost its timestamp")
        }
        return event
      }),
    transactionOrder,
  }))
}

async function seedCommercialCapFixtures({
  customerId,
  itemId,
  organizationId,
  pool,
  sourceSystem,
  suffix,
  workflowEnquiryId,
  workflowItemId,
}: {
  customerId: string
  itemId: string
  organizationId: string
  pool: Pool
  sourceSystem: string
  suffix: string
  workflowEnquiryId: string
  workflowItemId: string
}) {
  await pool.query(
    `
      UPDATE sales.enquiries
      SET technical_handover_status = 'Handed Over',
        technical_handover_at = TIMESTAMPTZ '2026-08-01 00:00:00Z'
      WHERE organization_id = $1 AND source_system = $2
        AND source_table = 'enquiries'
    `,
    [organizationId, sourceSystem]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, technical_review_status,
        source_system, source_table, source_id
      )
      SELECT $1, enquiry.id, 1,
        'CAP-DESIGN-' || lpad(row_number() OVER (
          ORDER BY enquiry.enquiry_number
        )::text, 3, '0'),
        'Cap design and costing fixture', 1, $3, 'Feasible',
        $2, 'oracle_cap_design_items',
        $4 || ':cap-design-item:' || enquiry.enquiry_number
      FROM sales.enquiries enquiry
      WHERE enquiry.organization_id = $1 AND enquiry.source_system = $2
        AND enquiry.source_table = 'enquiries'
      ORDER BY enquiry.enquiry_number
    `,
    [organizationId, sourceSystem, itemId, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        next_stage_status, quoted_part_uid,
        source_system, source_table, source_id
      )
      SELECT $1, item.id, 'Pending', 'Pending Design', 'Product Costing',
        'P-001', $2, 'oracle_cap_design_tasks',
        $3 || ':cap-design-task:' || item.customer_part_code
      FROM sales.enquiry_items item
      WHERE item.organization_id = $1 AND item.source_system = $2
        AND item.source_table = 'oracle_cap_design_items'
      ORDER BY item.customer_part_code
    `,
    [organizationId, sourceSystem, suffix]
  )
  await pool.query(
    `
      WITH clarification_item AS (
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, customer_part_code,
          description, quantity, item_id, technical_review_status,
          source_system, source_table, source_id
        ) VALUES (
          $1, $2, 2, 'CAP-CLARIFICATION-201',
          'Cap sales clarification fixture', 1, $3,
          'Not Feasible', $4, 'oracle_cap_clarification_items',
          $5 || ':cap-clarification-item:201'
        )
        RETURNING id
      )
      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, created_at, updated_at,
        source_system, source_table, source_id
      )
      SELECT $1, $2, clarification_item.id, 'Cap clarification?', 'Open',
        'Technical Review', 'Sales', TIMESTAMPTZ '2026-08-02 00:03:21Z',
        TIMESTAMPTZ '2026-08-02 00:03:21Z', $4,
        'oracle_cap_clarifications', $5 || ':cap-clarification:201'
      FROM clarification_item
    `,
    [organizationId, workflowEnquiryId, itemId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, technical_review_status,
        source_system, source_table, source_id
      )
      SELECT $1, enquiry.id, 2,
        'CAP-CLARIFICATION-' || lpad(row_number() OVER (
          ORDER BY enquiry.enquiry_number
        )::text, 3, '0'),
        'Cap sales clarification fixture', 1, $3,
        'Not Feasible', $2, 'oracle_cap_clarification_items',
        $4 || ':cap-clarification-item:' || enquiry.enquiry_number
      FROM sales.enquiries enquiry
      WHERE enquiry.organization_id = $1 AND enquiry.source_system = $2
        AND enquiry.source_table = 'enquiries'
      ORDER BY enquiry.enquiry_number
    `,
    [organizationId, sourceSystem, itemId, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, created_at, updated_at,
        source_system, source_table, source_id
      )
      SELECT $1, item.enquiry_id, item.id, 'Cap clarification?', 'Open',
        'Technical Review', 'Sales',
        TIMESTAMPTZ '2026-08-02 00:00:00Z' +
          row_number() OVER (ORDER BY item.customer_part_code) * INTERVAL '1 second',
        TIMESTAMPTZ '2026-08-02 00:00:00Z' +
          row_number() OVER (ORDER BY item.customer_part_code) * INTERVAL '1 second',
        $2, 'oracle_cap_clarifications',
        $3 || ':cap-clarification:' || item.customer_part_code
      FROM sales.enquiry_items item
      WHERE item.organization_id = $1 AND item.source_system = $2
        AND item.source_table = 'oracle_cap_clarification_items'
        AND item.enquiry_id <> $4
      ORDER BY item.customer_part_code
    `,
    [organizationId, sourceSystem, suffix, workflowEnquiryId]
  )
  await pool.query(
    `
      WITH correction_item AS (
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, customer_part_code,
          description, quantity, item_id, technical_review_status,
          source_system, source_table, source_id
        ) VALUES (
          $1, $2, 3, 'CAP-CORRECTION-201', 'Cap correction fixture', 1,
          $3, 'Not Feasible', $4, 'oracle_cap_correction_items',
          $5 || ':cap-correction-item:201'
        )
        RETURNING id
      )
      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        next_stage_status, quoted_part_uid,
        source_system, source_table, source_id
      )
      SELECT $1, correction_item.id, 'Pending', 'Design Complete', 'Started',
        'P-001', $4, 'oracle_cap_correction_designs',
        $5 || ':cap-correction-design:201'
      FROM correction_item
    `,
    [organizationId, workflowEnquiryId, itemId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, technical_review_status,
        source_system, source_table, source_id
      )
      SELECT $1, enquiry.id, 3,
        'CAP-CORRECTION-' || lpad(row_number() OVER (
          ORDER BY enquiry.enquiry_number
        )::text, 3, '0'),
        'Cap correction fixture', 1, $3, 'Not Feasible',
        $2, 'oracle_cap_correction_items',
        $4 || ':cap-correction-item:' || enquiry.enquiry_number
      FROM sales.enquiries enquiry
      WHERE enquiry.organization_id = $1 AND enquiry.source_system = $2
        AND enquiry.source_table = 'enquiries'
      ORDER BY enquiry.enquiry_number
    `,
    [organizationId, sourceSystem, itemId, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        next_stage_status, quoted_part_uid,
        source_system, source_table, source_id
      )
      SELECT $1, item.id, 'Pending', 'Design Complete', 'Started', 'P-001',
        $2, 'oracle_cap_correction_designs',
        $3 || ':cap-correction-design:' || item.customer_part_code
      FROM sales.enquiry_items item
      WHERE item.organization_id = $1 AND item.source_system = $2
        AND item.source_table = 'oracle_cap_correction_items'
        AND item.enquiry_id <> $4
      ORDER BY item.customer_part_code
    `,
    [organizationId, sourceSystem, suffix, workflowEnquiryId]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on,
        technical_handover_status, created_at, updated_at,
        source_system, source_table, source_id
      )
      SELECT $1, 'CAP-HANDOVER-' || lpad(ordinal::text, 3, '0'), $2,
        DATE '2026-02-01' + ordinal,
        'Draft', TIMESTAMPTZ '2026-02-01 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-02-01 00:00:00Z' + ordinal * INTERVAL '1 second',
        $3, 'oracle_cap_handover_enquiries',
        $4 || ':cap-handover-enquiry:' || ordinal
      FROM generate_series(1, 201) ordinal
    `,
    [organizationId, customerId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, technical_review_status,
        source_system, source_table, source_id
      )
      SELECT $1, enquiry.id, 1, 'ORACLE-DESIGN-1',
        'Cap sales handover fixture', 1, $3, 'Pending Review',
        $2, 'oracle_cap_handover_items',
        $4 || ':cap-handover-item:' || enquiry.enquiry_number
      FROM sales.enquiries enquiry
      WHERE enquiry.organization_id = $1 AND enquiry.source_system = $2
        AND enquiry.source_table = 'oracle_cap_handover_enquiries'
      ORDER BY enquiry.enquiry_number
    `,
    [organizationId, sourceSystem, itemId, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, status,
        source_system, source_table, source_id
      )
      SELECT $1, 'CAP-DRAFT-' || lpad(row_number() OVER (
          ORDER BY item.customer_part_code
        )::text, 3, '0'), 1, item.enquiry_id, item.id, $2, $3, $3,
        item.customer_part_code, 1, 10, 'Draft',
        $4, 'oracle_cap_draft_quotes',
        $5 || ':cap-draft-quote:' || item.customer_part_code
      FROM sales.enquiry_items item
      WHERE item.organization_id = $1 AND item.source_system = $4
        AND item.source_table = 'oracle_cap_design_items'
      ORDER BY item.customer_part_code
    `,
    [organizationId, customerId, itemId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, status,
        source_system, source_table, source_id
      ) VALUES (
        $1, 'CAP-DRAFT-201', 1, $2, $3, $4, $5, $5,
        'ORACLE-DESIGN-1', 1, 10, 'Draft',
        $6, 'oracle_cap_draft_quotes', $7 || ':cap-draft-quote:201'
      )
    `,
    [
      organizationId,
      workflowEnquiryId,
      workflowItemId,
      customerId,
      itemId,
      sourceSystem,
      suffix,
    ]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_items (
        id, organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, status, sent_at,
        created_at, updated_at, source_system, source_table, source_id
      )
      SELECT (
          lpad((1000 - ordinal)::text, 8, '0') || '-0000-4000-8000-' ||
          substring(md5($1::text), 1, 12)
        )::uuid,
        $1, 'CAP-SENT-' || lpad(ordinal::text, 3, '0'), 1,
        item.enquiry_id, item.id, $2, $3, $3, 'ORACLE-DESIGN-1', 1, 11,
        'Sent', TIMESTAMPTZ '2026-08-03 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-08-03 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-08-03 00:00:00Z' + ordinal * INTERVAL '1 second',
        $4, 'oracle_cap_sent_quotes', $5 || ':cap-sent-quote:' || ordinal
      FROM (
        SELECT item.*, row_number() OVER (
          ORDER BY enquiry.enquiry_number
        ) AS ordinal
        FROM sales.enquiry_items item
        JOIN sales.enquiries enquiry ON enquiry.id = item.enquiry_id
        WHERE item.organization_id = $1 AND item.source_system = $4
          AND item.source_table = 'oracle_cap_handover_items'
        ORDER BY enquiry.enquiry_number
        LIMIT 51
      ) item
    `,
    [organizationId, customerId, itemId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.followups (
        organization_id, enquiry_id, due_on, status, note,
        created_at, updated_at, source_system, source_table, source_id
      )
      SELECT $1, enquiry.id, DATE '2027-02-01' + ordinal::int, 'Pending',
        'Cap follow-up ' || ordinal,
        TIMESTAMPTZ '2026-08-04 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-08-04 00:00:00Z' + ordinal * INTERVAL '1 second',
        $2, 'oracle_cap_followups', $3 || ':cap-followup:' || ordinal
      FROM (
        SELECT enquiry.id, row_number() OVER (
          ORDER BY enquiry.enquiry_number
        ) AS ordinal
        FROM sales.enquiries enquiry
        WHERE enquiry.organization_id = $1 AND enquiry.source_system = $2
          AND enquiry.source_table = 'enquiries'
        ORDER BY enquiry.enquiry_number
      ) enquiry
    `,
    [organizationId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.purchase_orders (
        organization_id, customer_id, po_number, po_date, status,
        created_at, updated_at, source_system, source_table, source_id
      )
      SELECT $1, $2, 'CAP-PO-' || lpad(ordinal::text, 3, '0'),
        DATE '2026-01-01' + ordinal, 'Imported',
        TIMESTAMPTZ '2026-01-01 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-01-01 00:00:00Z' + ordinal * INTERVAL '1 second',
        $3, 'oracle_cap_purchase_orders', $4 || ':cap-po:' || ordinal
      FROM generate_series(1, 200) ordinal
    `,
    [organizationId, customerId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO sales.bulk_price_revisions (
        organization_id, revision_number, status, reason, effective_on,
        customer_id, revision_route, created_at, updated_at,
        source_system, source_table, source_id
      )
      SELECT $1, 'CAP-REV-' || lpad(ordinal::text, 3, '0'), 'Draft',
        'Cap revision fixture', DATE '2026-09-01', $2,
        'Customer Parameter Bulk Revision',
        TIMESTAMPTZ '2026-08-05 00:00:00Z' + ordinal * INTERVAL '1 second',
        TIMESTAMPTZ '2026-08-05 00:00:00Z' + ordinal * INTERVAL '1 second',
        $3, 'oracle_cap_bulk_revisions', $4 || ':cap-revision:' || ordinal
      FROM generate_series(1, 201) ordinal
    `,
    [organizationId, customerId, sourceSystem, suffix]
  )
  await pool.query(
    `
      INSERT INTO audit.pricing_correction_requests (
        organization_id, target_table, target_id, requested_action, reason,
        status, created_at, source_system, source_table, source_id
      )
      SELECT $1, 'quote_items', quote.id, 'Recalculate',
        'Cap correction fixture', 'Quarantined',
        TIMESTAMPTZ '2026-08-06 00:00:00Z' + ordinal * INTERVAL '1 second',
        $2, 'oracle_cap_pricing_corrections',
        $3 || ':cap-pricing-correction:' || ordinal
      FROM (
        SELECT quote.id, row_number() OVER (
          ORDER BY quote.quote_number
        ) AS ordinal
        FROM sales.quote_items quote
        WHERE quote.organization_id = $1 AND quote.source_system = $2
          AND quote.source_table = 'oracle_cap_draft_quotes'
        ORDER BY quote.quote_number
        LIMIT 201
      ) quote
    `,
    [organizationId, sourceSystem, suffix]
  )
}

async function captureDashboardWorkflow({
  acceleration,
  connectionString,
  dashboard,
  initialState,
  organizationId,
  pool,
}: {
  acceleration: RedisAcceleration
  connectionString: string
  dashboard: DashboardRepository
  initialState: Awaited<ReturnType<DashboardRepository["state"]>>
  organizationId: string
  pool: Pool
}) {
  const refreshRequest = await dashboard.requestRefresh(organizationId)
  const duplicateRefreshRequest = await dashboard.requestRefresh(organizationId)
  const pendingState = await dashboard.state(organizationId)

  const worker = createDurableRefreshWorker({
    organizationId,
    postgresPool: pool,
    postgresUrl: connectionString,
    redisAcceleration: acceleration,
    workerId: "behavior-oracle-initial",
  })
  const refresh = await worker.runRefreshOnce()
  const outboxPublished = await worker.flushOutboxOnce()
  const floorStates = await Promise.all(
    (["conventional", "cnc", "forging"] as const).map(async (floor) => ({
      floor,
      state: await dashboard.state(organizationId, { month: "2026-08" }, floor),
    }))
  )
  const unchangedState = await dashboard.state(
    organizationId,
    { month: "2026-08" },
    "cnc",
    refresh.status === "processed" ? refresh.version : undefined
  )
  await worker.close()

  const retryRequest = await dashboard.requestRefresh(organizationId)
  const retryWorker = createDurableRefreshWorker({
    buildReadModel: async () => {
      throw new Error("oracle refresh infrastructure failure")
    },
    maxAttempts: 2,
    organizationId,
    postgresPool: pool,
    postgresUrl: connectionString,
    redisAcceleration: acceleration,
    retryDelayMs: 0,
    workerId: "behavior-oracle-before-restart",
  })
  const retryingRefresh = await retryWorker.runRefreshOnce()
  const retryingState = await dashboard.state(organizationId)
  await retryWorker.close()

  const restartedWorker = createDurableRefreshWorker({
    organizationId,
    postgresPool: pool,
    postgresUrl: connectionString,
    redisAcceleration: acceleration,
    workerId: "behavior-oracle-after-restart",
  })
  const restartedRefresh = await restartedWorker.runRefreshOnce()
  const restartedState = await dashboard.state(organizationId)
  await restartedWorker.close()

  const redisUnavailable: RedisAcceleration = {
    async close() {},
    async consumeRateLimit() {
      throw new Error("oracle redis unavailable")
    },
    async publishInvalidation() {
      throw new Error("oracle redis unavailable")
    },
  }
  const redisFailureWorker = createDurableRefreshWorker({
    organizationId,
    postgresPool: pool,
    postgresUrl: connectionString,
    redisAcceleration: redisUnavailable,
    retryDelayMs: 0,
    workerId: "behavior-oracle-redis-loss",
  })
  const redisFailure = await redisFailureWorker.flushOutboxOnce()
  const redisAuthoritativeState = await dashboard.state(organizationId)
  await redisFailureWorker.close()

  await dashboard.requestRefresh(organizationId)
  const failureWorker = createDurableRefreshWorker({
    buildReadModel: async () => {
      throw new Error("oracle terminal infrastructure failure")
    },
    maxAttempts: 1,
    organizationId,
    postgresPool: pool,
    postgresUrl: connectionString,
    redisAcceleration: acceleration,
    retryDelayMs: 0,
    workerId: "behavior-oracle-terminal-failure",
  })
  const failedRefresh = await failureWorker.runRefreshOnce()
  const failedState = await dashboard.state(organizationId)
  await failureWorker.close()

  const projectedFloors = floorStates.map(({ floor, state }) => {
    const payload = record(state.dashboard)
    return {
      machineMasterRows:
        keySummary(payload).find((row) => row.entryType === "machine_master")
          ?.rows ?? 0,
      requested: floor,
      returned: String(payload.productionFloorCode),
      state: normalizeObservableValue(payload),
    }
  })
  const cncPayload = record(
    floorStates.find(({ floor }) => floor === "cnc")?.state.dashboard
  )

  return {
    dashboard: {
      categoryRows: keySummary(cncPayload),
      floorIsolation: projectedFloors,
      projectionKeys: Object.keys(cncPayload)
        .filter(
          (key) =>
            !["filters", "snapshotCacheUpdatedAt", "sourceWatermark"].includes(
              key
            )
        )
        .sort(),
      sourceCoverage: sourceCoverage(cncPayload),
      unchangedPayloadOmitted:
        unchangedState.notModified && unchangedState.dashboard === null,
    },
    infrastructureFailureCategory: errorCategory(
      failedRefresh.status === "failed" ? failedRefresh.error : undefined,
      "infrastructure"
    ),
    refresh: {
      duplicateHintHarmless:
        refreshRequest.jobId === duplicateRefreshRequest.jobId,
      failedState: {
        stalePayloadRetained: failedState.dashboard !== null,
        status: failedState.status.status,
      },
      initialState: {
        payloadAbsent: initialState.dashboard === null,
        status: initialState.status.status,
      },
      outboxPublished: outboxPublished.status,
      pendingState: {
        payloadAbsent: pendingState.dashboard === null,
        status: pendingState.status.status,
      },
      redisLoss: {
        postgresPayloadRetained: redisAuthoritativeState.dashboard !== null,
        status: redisFailure.status,
      },
      restart: {
        recoveredJob:
          restartedRefresh.status === "processed" &&
          restartedRefresh.jobId === retryRequest.jobId,
        status: restartedRefresh.status,
      },
      retry: {
        attempt:
          retryingRefresh.status === "retrying" ? retryingRefresh.attempts : 0,
        postgresPayloadRetained: retryingState.dashboard !== null,
        status: retryingRefresh.status,
      },
      successfulRun: {
        attempts: refresh.status === "processed" ? refresh.attempts : null,
        status: refresh.status,
        version: refresh.status === "processed" ? refresh.version : null,
      },
      versionAfterRestart:
        restartedState.dashboard === null
          ? null
          : Number(record(restartedState.dashboard).readModelVersion),
    },
  }
}

export async function captureCanonicalBehaviorParityFixture({
  connectionString,
}: CaptureOptions): Promise<BehaviorCapture> {
  await migrateDatabase({ connectionString })

  const pool = new Pool({ connectionString, max: 4 })
  const access = createAccessAdministrationRepository({ pool })
  const authorizationA = createAuthorizationRepository({ pool })
  const authorizationB = createAuthorizationRepository({ pool })
  const commercial = createCommercialWorkflowRepository({ pool })
  const commercialCosting = createCommercialCostingRepository({ pool })
  const commercialMasters = createCommercialMasterRepository({ pool })
  const commercialOrders = createCommercialOrdersRepository({ pool })
  const commercialReporting = createCommercialReportingRepository({ pool })
  const commercialRevisions = createCommercialRevisionsRepository({ pool })
  const customers = createCustomerRepository({ pool })
  const dashboard = createDashboardReadModelRepository({ pool })
  const planning = createDashboardPlanningRepository({ pool })
  const products = createProductRepository({ pool })
  const production = createProductionShopFloorRepository({ pool })
  const quality = createQualityRepository({ pool })
  const recruitment = createRecruitmentRepository({ pool })
  const workforce = createWorkforceRepository({ pool })
  const suffix = randomUUID()
  const organizationCode = `ORACLE-${suffix}`
  const sourceSystem = `behavior-oracle-${suffix}`
  const dashboardSourceSystem = "mrm-dashboard"

  const acceleration: RedisAcceleration = {
    async close() {},
    async consumeRateLimit() {
      return { allowed: true, count: 1, retryAfterSeconds: 0 }
    },
    async publishInvalidation() {},
  }

  try {
    const organization = await pool.query<{ id: string }>(
      `
        INSERT INTO core.organizations (code, name)
        VALUES ($1, 'Behavior parity oracle')
        RETURNING id
      `,
      [organizationCode]
    )
    const organizationId = organization.rows[0]!.id
    const initialDashboardState = await dashboard.state(organizationId)

    const floors = await pool.query<{ code: string; id: string }>(
      `
        INSERT INTO manufacturing.production_floors (
          organization_id, code, name
        ) VALUES
          ($1, 'conventional', 'Conventional'),
          ($1, 'cnc', 'CNC'),
          ($1, 'forging', 'Forging')
        RETURNING id, code
      `,
      [organizationId]
    )
    await pool.query(
      `
        INSERT INTO catalog.machines (
          organization_id, machine_number, name, production_floor_id,
          source_system, source_table, source_id, source_payload
        )
        SELECT $1, 'CNC-CAP-' || lpad(machine_number::text, 4, '0'),
          'CNC cap fixture ' || machine_number, floor.id,
          $2, 'machines', $3 || ':cap-machine:' || machine_number,
          jsonb_build_object(
            '_id', $3 || ':cap-machine:' || machine_number,
            'entryType', 'machine_master',
            'payload', jsonb_build_object(
              'machineNumber',
                'CNC-CAP-' || lpad(machine_number::text, 4, '0'),
              'productionFloorCode', 'cnc'
            ),
            'productionFloorCode', 'cnc'
          )
        FROM generate_series(1, 1001) machine_number
        CROSS JOIN LATERAL (
          SELECT id
          FROM manufacturing.production_floors
          WHERE organization_id = $1 AND code = 'cnc'
        ) floor
      `,
      [organizationId, dashboardSourceSystem, suffix]
    )
    await pool.query(
      `
        INSERT INTO catalog.machines (
          organization_id, machine_number, name, production_floor_id,
          source_system, source_table, source_id, source_payload
        )
        SELECT $1, upper(floor.code) || '-01', floor.code || ' machine',
          floor.id, $2, 'machines', $3 || ':floor:' || floor.code,
          jsonb_build_object(
            '_id', $3 || ':floor:' || floor.code,
            'entryType', 'machine_master',
            'payload', jsonb_build_object(
              'machineNumber', upper(floor.code) || '-01',
              'productionFloorCode', floor.code
            ),
            'productionFloorCode', floor.code
          )
        FROM manufacturing.production_floors floor
        WHERE floor.organization_id = $1
      `,
      [organizationId, dashboardSourceSystem, suffix]
    )

    const createdCustomer = await customers.create({
      companyName: "Oracle Customer 001",
      customerUid: "C-001",
      organizationId,
      source: {
        id: `${suffix}:customer:1`,
        system: sourceSystem,
        table: "customers",
      },
    })
    await pool.query(
      `
        INSERT INTO sales.customers (
          organization_id, customer_uid, company_name,
          source_system, source_table, source_id
        )
        SELECT $1, 'C-' || lpad(customer_number::text, 3, '0'),
          'Oracle Customer ' || lpad(customer_number::text, 3, '0'),
          $2, 'customers', $3 || ':customer:' || customer_number
        FROM generate_series(2, 16) customer_number
      `,
      [organizationId, sourceSystem, suffix]
    )

    await products.create({
      description: "Oracle Product 001",
      organizationId,
      source: {
        id: `${suffix}:product:1`,
        system: sourceSystem,
        table: "products",
      },
      uid: "P-001",
    })
    await pool.query(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          source_system, source_table, source_id
        )
        SELECT $1, 'P-' || lpad(product_number::text, 3, '0'),
          'INTERNAL', 'P',
          'Oracle Product ' || lpad(product_number::text, 3, '0'),
          $2, 'products', $3 || ':product:' || product_number
        FROM generate_series(2, 26) product_number
      `,
      [organizationId, sourceSystem, suffix]
    )
    await pool.query(
      `
        UPDATE catalog.items
        SET item_type = 'Package'
        WHERE organization_id = $1 AND uid IN ('P-001', 'P-002')
      `,
      [organizationId]
    )
    const graphItems = await pool.query<{ id: string; uid: string }>(
      `
        SELECT id, uid FROM catalog.items
        WHERE organization_id = $1 AND uid = ANY($2::text[])
        ORDER BY uid
      `,
      [organizationId, ["P-001", "P-002", "P-003", "P-004"]]
    )
    const graphItemId = new Map(
      graphItems.rows.map((item) => [item.uid, item.id])
    )
    for (const [parentUid, componentUid] of [
      ["P-001", "P-002"],
      ["P-001", "P-003"],
      ["P-002", "P-004"],
    ] as const) {
      await pool.query(
        `
          INSERT INTO catalog.bom_lines (
            organization_id, parent_item_id, component_item_id, quantity,
            source_system, source_table, source_id
          ) VALUES ($1, $2, $3, 1, $4, 'bom_lines', $5)
        `,
        [
          organizationId,
          graphItemId.get(parentUid)!,
          graphItemId.get(componentUid)!,
          sourceSystem,
          `${suffix}:bom:${parentUid}:${componentUid}`,
        ]
      )
    }
    const completeEcnGraph = (
      await products.listBomLines(organizationCode)
    ).map((line) => `${line.parentUid}->${line.componentUid}`)

    const qualityMachineNumber = "QUALITY-01"
    const qualityJobCard = "ORACLE-JC-1"
    await workforce.upsertEmployee({
      employeeCode: "QC-1",
      name: "Oracle Inspector",
      organizationId,
    })
    await planning.upsertMachine({
      machineNumber: qualityMachineNumber,
      name: "Oracle quality machine",
      organizationId,
    })
    await planning.upsertWorkOrder({
      itemUid: "P-001",
      jobCardNumber: qualityJobCard,
      orderedQuantity: 100,
      organizationId,
      workOrderNumber: "ORACLE-WO-1",
    })
    await planning.upsertRouteOption({
      itemUid: "P-001",
      organizationId,
      routeCode: "1",
      setups: [
        {
          legacySetupCode: "1.1",
          operationCode: "INSPECT",
          sequence: 1,
          setupNumber: 1,
        },
      ],
    })
    await planning.selectRoute({
      jobCardNumber: qualityJobCard,
      organizationId,
      routeCode: "1",
    })
    await planning.upsertWorkOrder({
      itemUid: "P-001",
      jobCardNumber: "ORACLE-JC-2",
      orderedQuantity: 50,
      organizationId,
      workOrderNumber: "ORACLE-WO-2",
    })
    await planning.selectRoute({
      jobCardNumber: "ORACLE-JC-2",
      organizationId,
      routeCode: "1",
    })
    await planning.recordPlanOverride({
      jobCardNumber: qualityJobCard,
      organizationId,
      productionFloorCode: "conventional",
      queuePlacements: [
        {
          queueBeforeSetups: [
            {
              jobCardNumber: "ORACLE-JC-2",
              machineNumber: qualityMachineNumber,
              setupNumber: 1,
            },
          ],
          targetJobCardNumber: qualityJobCard,
          targetMachineNumber: qualityMachineNumber,
          targetPartCode: "P-001",
          targetSetupNumber: 1,
        },
      ],
      reason: "Preserve oracle schedule order",
      setupNumber: 1,
      toMachineNumber: qualityMachineNumber,
    })
    await planning.recordMachineConstraint({
      machineNumber: qualityMachineNumber,
      organizationId,
      planningMode: "Preserve queue",
      reason: "Planned pause",
      rescheduleAction: "Keep interrupted work",
      unavailableFrom: "2026-08-08T10:00:00+05:30",
      unavailableTo: "2026-08-08T11:00:00+05:30",
    })
    await quality.upsertParameterDefinition({
      dataType: "numeric",
      inputType: "number",
      itemUid: "P-001",
      lowerLimit: 9.8,
      name: "Total length",
      nominalValue: 10,
      operationSetupCode: "1.1",
      organizationId,
      parameterCode: "LEN",
      payload: { specification: "10.00" },
      routeCode: "1",
      sequence: 1,
      upperLimit: 10.2,
    })
    const firstPiece = await quality.recordFirstPieceInspection({
      approvedBy: "QC-1",
      dimensions: [
        {
          parameterCode: "LEN",
          readings: [10, 10.1, 9.9, 10.2, 9.8],
        },
      ],
      inspectionKey: "ORACLE-FPIR-1",
      inspectedAt: "2026-08-08T09:00:00.000Z",
      jobCardNumber: qualityJobCard,
      machineNumber: qualityMachineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { reportId: "ORACLE-FPIR-1" },
      status: "Approved",
    })
    await quality.recordHourlyCheck({
      checkKey: "ORACLE-HOURLY-1",
      checkedAt: "2026-08-08T10:00:00.000Z",
      checkedBy: "QC-1",
      jobCardNumber: qualityJobCard,
      machineNumber: qualityMachineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { hourSlot: "10:00-11:00" },
      readings: [
        { actualReading: "10.05", parameterCode: "LEN", result: "OK" },
      ],
      status: "OK",
    })
    await production.upsertProductionCard({
      cardNumber: "ORACLE-CARD-1",
      jobCardNumber: qualityJobCard,
      organizationId,
      payload: {
        cardEntryKind: "production",
        machine: qualityMachineNumber,
        prodDate: "2026-08-08",
        setupNo: "1.1",
      },
      productionFloorCode: "conventional",
    })
    await production.recordProductionEntry({
      jobCardNumber: qualityJobCard,
      machineNumber: qualityMachineNumber,
      operationSetupCode: "1.1",
      operatorCode: "QC-1",
      organizationId,
      payload: {
        endTime: "2026-08-08T09:45:00.000Z",
        startTime: "2026-08-08T09:15:00.000Z",
      },
      productionDate: "2026-08-08",
      productionFloorCode: "conventional",
      quantityGood: 10,
      quantityRejected: 1,
      shift: "A",
    })
    const qualityEvidence = await pool.query<{
      active_production_cards: number
      first_piece_floor: string
      first_piece_readings: number
      first_piece_samples: number
      hourly_readings: number
      pause_floor: string
      pause_events: number
      pause_reversible: boolean
      production_entries: number
      schedule_order: string[]
      work_order_status: string
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM manufacturing.production_cards
            WHERE organization_id = $1 AND status = 'Open')
            AS active_production_cards,
          (SELECT count(*)::int FROM quality.first_piece_readings
            WHERE inspection_id = $2) AS first_piece_readings,
          (SELECT count(*)::int FROM quality.first_piece_reading_samples sample
            JOIN quality.first_piece_readings reading
              ON reading.id = sample.reading_id
            WHERE reading.inspection_id = $2) AS first_piece_samples,
          (SELECT count(*)::int FROM quality.hourly_check_readings reading
            JOIN quality.hourly_checks check_row
              ON check_row.id = reading.hourly_check_id
            WHERE check_row.organization_id = $1) AS hourly_readings,
          (SELECT count(*)::int FROM manufacturing.machine_constraint_events
            WHERE organization_id = $1 AND reason = 'Planned pause') AS pause_events,
          (SELECT event.ends_at IS NOT NULL
              AND event.source_payload->>'rescheduleAction' =
                'Keep interrupted work'
            FROM manufacturing.machine_constraint_events event
            WHERE event.organization_id = $1 AND event.reason = 'Planned pause'
            LIMIT 1) AS pause_reversible,
          (SELECT floor.code
            FROM quality.first_piece_inspections inspection
            JOIN catalog.machines machine ON machine.id = inspection.machine_id
            JOIN manufacturing.production_floors floor
              ON floor.id = machine.production_floor_id
            WHERE inspection.id = $2) AS first_piece_floor,
          (SELECT floor.code
            FROM manufacturing.machine_constraint_events event
            JOIN catalog.machines machine ON machine.id = event.machine_id
            JOIN manufacturing.production_floors floor
              ON floor.id = machine.production_floor_id
            WHERE event.organization_id = $1 AND event.reason = 'Planned pause'
            LIMIT 1) AS pause_floor,
          (SELECT status FROM manufacturing.work_orders
            WHERE organization_id = $1 AND job_card_number = $3)
            AS work_order_status,
          (SELECT count(*)::int FROM manufacturing.production_entries
            WHERE organization_id = $1) AS production_entries,
          (SELECT array_agg(work_order.job_card_number ORDER BY detail.sequence)
            FROM manufacturing.plan_override_event_details detail
            JOIN manufacturing.plan_override_events event
              ON event.id = detail.plan_override_event_id
            LEFT JOIN manufacturing.work_orders work_order
              ON work_order.id = detail.related_work_order_id
            WHERE event.organization_id = $1) AS schedule_order
      `,
      [organizationId, firstPiece.id, qualityJobCard]
    )

    const workflowEnquiry = await commercial.createEnquiry({
      commercialTerms: {
        conversionRate: 83.25,
        currency: "USD",
        incoterms: "FOB",
        packagingTerms: "Export",
        paymentTerms: "Net 30",
        shipmentMode: "Sea",
      },
      customerId: createdCustomer.id,
      organizationId,
      receivedOn: "2026-12-31",
      source: "Email",
    })
    const workflowLine = await commercial.addEnquiryItem({
      customerPartCode: "ORACLE-DESIGN-1",
      description: "Oracle designed product",
      enquiryId: workflowEnquiry.id,
      grade: "CZ121",
      organizationId,
      quantity: 25,
      targetPrice: 4.5,
    })
    const technicalHandover = await commercial.handOverToTechnicalReview(
      workflowEnquiry.id
    )
    await commercial.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: false,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: workflowLine.id,
      missingInformation: "Confirm tolerance",
      status: "Need Clarification",
    })
    const clarificationSnapshot = await commercial.getEnquiry(
      workflowEnquiry.id
    )
    await commercial.completeSalesClarification({
      clarificationTaskId: clarificationSnapshot.clarifications[0]!.id,
      enquiryItemId: workflowLine.id,
      response: "Tolerance is ±0.05 mm.",
    })
    await commercial.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: true,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: workflowLine.id,
      status: "Feasible",
      technicalRemarks: "Feasible after clarification",
    })
    const designed = await commercial.saveDesign({
      bomLines: [
        {
          casting: 1,
          componentCode: "Q-ORACLE-DESIGN-1",
          componentSource: "New",
          grade: "CZ121",
          lineNumber: 1,
          pieceWeight: 0.025,
          quantity: 1,
          rodSize: "12 mm",
          rodType: "Round",
        },
      ],
      designStatus: "Design Complete",
      enquiryItemId: workflowLine.id,
      itemType: "List",
      portfolioMatchStatus: "New Design Required",
      quotedPartUid: "Q-ORACLE-DESIGN-1",
    })
    const costingHandoff = await commercial.prepareCostingFromDesign(
      workflowLine.id
    )
    await commercial.recordAttachment({
      byteSize: 128,
      fileName: "oracle-drawing.pdf",
      mediaType: "application/pdf",
      organizationId,
      purpose: "internal_drawing",
      sourceId: `${suffix}:oracle-drawing`,
      storageKey: `attachments/${suffix}/oracle-drawing.pdf`,
      targetId: workflowLine.id,
      targetTable: "enquiry_items",
    })
    const workflowAttachments = await commercial.listAttachments({
      organizationId,
      targetId: workflowLine.id,
      targetTable: "enquiry_items",
    })
    const workflowFollowup = await commercial.createFollowup({
      dueOn: "2027-01-15",
      enquiryId: workflowEnquiry.id,
      note: "Oracle follow-up",
      organizationId,
    })
    const completedFollowup = await commercial.completeFollowup({
      followupId: workflowFollowup.id,
      note: "Oracle follow-up completed",
    })
    await pool.query(
      `
        INSERT INTO sales.enquiries (
          organization_id, enquiry_number, customer_id, received_on,
          created_at, updated_at, source_system, source_table, source_id
        )
        SELECT $1, 'ENQ-' || lpad(enquiry_number::text, 3, '0'), $2,
          DATE '2026-01-01' + (enquiry_number - 1),
          TIMESTAMPTZ '2026-01-01 00:00:00Z' +
            enquiry_number * INTERVAL '1 second',
          TIMESTAMPTZ '2026-01-01 00:00:00Z' +
            enquiry_number * INTERVAL '1 second',
          $3, 'enquiries', $4 || ':enquiry:' || enquiry_number
        FROM generate_series(1, 200) enquiry_number
      `,
      [organizationId, createdCustomer.id, sourceSystem, suffix]
    )
    await seedCommercialCapFixtures({
      customerId: createdCustomer.id,
      itemId: graphItemId.get("P-001")!,
      organizationId,
      pool,
      sourceSystem,
      suffix,
      workflowEnquiryId: workflowEnquiry.id,
      workflowItemId: workflowLine.id,
    })
    const enquiryRows = await commercial.listEnquiries(organizationCode, 200)
    const enquiryTotal = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM sales.enquiries WHERE organization_id = $1`,
      [organizationId]
    )
    const customerCountBeforeFailures = await pool.query<{
      audit_count: number
      count: number
    }>(
      `
        SELECT count(*)::int AS count,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $1) AS audit_count
        FROM sales.customers WHERE organization_id = $1
      `,
      [organizationId]
    )
    const failureCategories: FailureCategory[] = []
    try {
      await customers.create({
        companyName: "Invalid customer",
        customerUid: " ",
        organizationId,
        source: {
          id: `${suffix}:invalid`,
          system: sourceSystem,
          table: "customers",
        },
      })
    } catch (error) {
      failureCategories.push(errorCategory(error))
    }
    try {
      await customers.create({
        companyName: "Duplicate customer",
        customerUid: "C-001",
        organizationId,
        source: {
          id: `${suffix}:duplicate`,
          system: sourceSystem,
          table: "customers",
        },
      })
    } catch (error) {
      failureCategories.push(errorCategory(error))
    }
    try {
      await commercial.getEnquiry(randomUUID())
    } catch (error) {
      failureCategories.push(errorCategory(error))
    }
    const customerCountAfterFailures = await pool.query<{
      audit_count: number
      count: number
    }>(
      `
        SELECT count(*)::int AS count,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $1) AS audit_count
        FROM sales.customers WHERE organization_id = $1
      `,
      [organizationId]
    )

    const user = await pool.query<{ id: string }>(
      `
        INSERT INTO identity.users (name, email)
        VALUES ('Oracle Planner', $1)
        RETURNING id
      `,
      [`oracle-${suffix}@example.test`]
    )
    const userId = user.rows[0]!.id
    await access.setPermissionOverride({
      actorUserId: userId,
      effect: "allow",
      permissionKey: "planning.plan.read",
      reason: "behavior oracle",
      userId,
    })
    const beforeRevocation =
      await authorizationA.listAllGrantedCapabilities(userId)
    await access.setPermissionOverride({
      actorUserId: userId,
      effect: "deny",
      permissionKey: "planning.plan.read",
      reason: "behavior oracle revocation",
      userId,
    })
    const afterRevocation =
      await authorizationB.listAllGrantedCapabilities(userId)

    const engineeringChange =
      await commercialRevisions.createEngineeringChangeNote({
        actorUserId: userId,
        effectiveOn: "2026-08-09",
        itemId: graphItemId.get("P-001")!,
        organizationId,
        reason: "Oracle nested package revision",
      })
    const engineeringDesign =
      await commercialRevisions.completeEngineeringChangeDesign({
        actorUserId: userId,
        engineeringChangeNoteId: engineeringChange.id,
        itemPatch: {
          bomLines: [
            {
              componentItemId: graphItemId.get("P-002")!,
              notes: "Preserve nested component",
              quantity: 1,
            },
            {
              componentItemId: graphItemId.get("P-003")!,
              notes: "Preserve branch component",
              quantity: 1,
            },
          ],
          description: "Oracle revised package",
          remarks: "Oracle ECN",
        },
      })
    const engineeringCompletion =
      await commercialRevisions.completeEngineeringChangeProductCosting({
        actorUserId: userId,
        engineeringChangeNoteId: engineeringChange.id,
        itemPatch: { assemblyOperationCost: 25 },
      })
    const engineeringChanges =
      await commercialRevisions.listEngineeringChangeNotes(organizationCode)

    const drawing = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.drawings (
          organization_id, item_id, revision, drawing_number, status,
          effective_at, source_system, source_table, source_id
        ) VALUES ($1, $2, '0', 'ORACLE-DWG-0', 'current', DATE '2026-08-01',
          $3, 'drawing_history', $4)
        RETURNING id
      `,
      [
        organizationId,
        graphItemId.get("P-001")!,
        sourceSystem,
        `${suffix}:drawing`,
      ]
    )
    await commercialReporting.updateDrawingHistory({
      actorUserId: userId,
      buffoliLaminatedQuantity: 3,
      cncLaminatedQuantity: 2,
      conventionalLaminatedQuantity: 1,
      drawingId: drawing.rows[0]!.id,
      drawingNumber: "ORACLE-DWG-1",
      organizationId,
      remarks: "Oracle drawing revision",
      revision: "1",
      revisionDate: "2026-08-08",
    })
    const drawingHistory = await commercialReporting.listDrawingHistory({
      organizationId,
    })
    await pool.query(
      `
        INSERT INTO catalog.website_product_profiles (
          organization_id, item_id, title, slug, summary, published,
          source_system, source_table, source_id
        ) VALUES ($1, $2, 'Oracle Website Product', 'oracle-product',
          'Oracle website summary', true, $3, 'website_products', $4)
      `,
      [
        organizationId,
        graphItemId.get("P-001")!,
        sourceSystem,
        `${suffix}:website-product`,
      ]
    )
    const websiteProducts = await commercialReporting.listWebsiteProducts({
      organizationId,
    })
    const purchaseOrder = await commercialOrders.createPurchaseOrder({
      actorUserId: userId,
      customerId: createdCustomer.id,
      organizationId,
      poDate: "2026-08-08",
      poNumber: "ORACLE-PO-1",
    })
    const purchaseOrdersBeforeCancellation =
      await commercialOrders.listPurchaseOrders(organizationCode)
    const cancelledPurchaseOrder = await commercialOrders.cancelPurchaseOrder({
      actorUserId: userId,
      purchaseOrderId: purchaseOrder.id,
      reason: "Oracle cancellation",
    })
    const [
      costingTasks,
      editableMasters,
      bulkRevisions,
      correctionCandidates,
      designQueue,
      followups,
      pricingCorrections,
      salesClarification,
      salesHandover,
      salesQuoteReady,
      salesSentQuotes,
      technicalReview,
      salesCandidatesByItem,
      commercialAvailable,
    ] = await Promise.all([
      commercialCosting.listCostingTasks(organizationCode),
      commercialMasters.listEditable(organizationId),
      commercialRevisions.listBulkPriceRevisions(organizationCode),
      commercialRevisions.listCorrectionCandidates(organizationCode),
      commercial.listDesignQueue(organizationCode),
      commercial.listFollowups(organizationCode),
      commercialRevisions.listPricingCorrections(organizationCode),
      commercial.listSalesClarificationQueue(organizationCode),
      commercial.listSalesHandoverQueue(organizationCode),
      commercial.listSalesQuoteReadyQueue(organizationCode),
      commercial.listSalesSentQuoteQueue(organizationCode),
      commercial.listTechnicalReviewQueue(organizationCode),
      commercial.listSalesMatchCandidatesForItems([workflowLine.id]),
      pool.query<{
        followups: number
        sales_candidates: number
        sent_quotes: number
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM sales.followups
              WHERE organization_id = $1) AS followups,
            (SELECT count(*)::int FROM sales.quote_items quote
              WHERE quote.organization_id = $1
                AND quote.customer_id = $2
                AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered'))
              AS sales_candidates,
            (SELECT count(DISTINCT quote.enquiry_id)::int
              FROM sales.quote_items quote
              WHERE quote.organization_id = $1
                AND quote.status <> 'Superseded'
                AND quote.sent_at IS NOT NULL) AS sent_quotes
        `,
        [organizationId, createdCustomer.id]
      ),
    ])
    const salesCandidates = salesCandidatesByItem.get(workflowLine.id) ?? []
    const queueEvidence = (
      rows: readonly unknown[],
      available = rows.length,
      limit = 200
    ) => ({
      available,
      limit,
      returned: rows.length,
      rows: normalizeObservableValue(rows),
    })
    const commercialQueues = {
      bulkRevisions: queueEvidence(bulkRevisions),
      correctionCandidates: queueEvidence(correctionCandidates.designHandoffs),
      costing: queueEvidence(costingTasks),
      design: queueEvidence(designQueue),
      followups: queueEvidence(
        followups,
        commercialAvailable.rows[0]!.followups
      ),
      orders: queueEvidence(purchaseOrdersBeforeCancellation),
      pricingCorrections: queueEvidence(pricingCorrections),
      salesCandidates: queueEvidence(
        salesCandidates,
        commercialAvailable.rows[0]!.sales_candidates,
        50
      ),
      salesClarification: queueEvidence(salesClarification),
      salesHandover: queueEvidence(salesHandover),
      salesQuoteReady: queueEvidence(salesQuoteReady),
      salesSentQuotes: queueEvidence(
        salesSentQuotes,
        commercialAvailable.rows[0]!.sent_quotes,
        50
      ),
      technicalReview: queueEvidence(technicalReview),
    }

    const department = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.departments (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'ORACLE', 'Oracle Department', $2, 'departments', $3)
        RETURNING id
      `,
      [organizationId, sourceSystem, `${suffix}:department`]
    )
    const designation = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.designations (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'ENGINEER', 'Oracle Engineer', $2, 'designations', $3)
        RETURNING id
      `,
      [organizationId, sourceSystem, `${suffix}:designation`]
    )
    const approvedPosts = await pool.query<{
      id: string
      post_code: string
      status: string
    }>(
      `
        WITH inserted AS (
          INSERT INTO recruitment.posts (
            organization_id, department_id, designation_id,
            vacancy_number, post_code, vacancy_code, status,
            employee_name, employee_code,
            source_system, source_table, source_id
          )
          SELECT $1, $2, $3, ordinal::text, 'POST-' || ordinal,
            'VAC-' || ordinal, state,
            CASE WHEN state IN ('Occupied', 'Resigned') THEN 'Oracle Employee' END,
            CASE WHEN state IN ('Occupied', 'Resigned') THEN 'EMP-' || ordinal END,
            $4, 'posts', $5 || ':post:' || ordinal
          FROM unnest(ARRAY[
            'Vacant', 'Appointed', 'Occupied', 'Resigned', 'Inactive',
            'Vacant', 'Vacant', 'Vacant'
          ]::text[]) WITH ORDINALITY states(state, ordinal)
          RETURNING id, post_code, status
        )
        SELECT id, post_code, status FROM inserted ORDER BY post_code
      `,
      [
        organizationId,
        department.rows[0]!.id,
        designation.rows[0]!.id,
        sourceSystem,
        suffix,
      ]
    )
    const combinedRole = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.combined_roles (
          organization_id, name, vacancy_code,
          source_system, source_table, source_id
        ) VALUES ($1, 'Oracle Combined Role', 'COMBINED-1', $2, 'combined_roles', $3)
        RETURNING id
      `,
      [organizationId, sourceSystem, `${suffix}:combined-role`]
    )
    await pool.query(
      `
        INSERT INTO recruitment.combined_role_posts (
          combined_role_id, post_id, is_primary
        ) VALUES ($1, $2, true), ($1, $3, false)
      `,
      [
        combinedRole.rows[0]!.id,
        approvedPosts.rows[0]!.id,
        approvedPosts.rows[5]!.id,
      ]
    )

    const candidate = await pool.query<{ id: string; name: string }>(
      `
        WITH inserted AS (
          INSERT INTO recruitment.candidates (
            organization_id, name, phone,
            source_system, source_table, source_id
          )
          SELECT $1, candidate_name, $2 || ':' || ordinal, $3,
            'candidates', $4 || ':candidate:' || ordinal
          FROM unnest(ARRAY[
            'Repeat Candidate', 'Bulk Candidate B', 'Bulk Candidate C'
          ]::text[]) WITH ORDINALITY candidates(candidate_name, ordinal)
          ORDER BY ordinal
          RETURNING id, name
        )
        SELECT id, name FROM inserted
        ORDER BY CASE name
          WHEN 'Repeat Candidate' THEN 1
          WHEN 'Bulk Candidate B' THEN 2
          ELSE 3
        END
      `,
      [organizationId, `PHONE-${suffix}`, sourceSystem, `${suffix}:candidate`]
    )
    const job = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.job_posts (
          organization_id, job_number, vacancy_code, title,
          source_system, source_table, source_id
        ) VALUES ($1, 'JOB-1', 'JOB-1', 'Oracle opening', $2, 'job_posts', $3)
        RETURNING id
      `,
      [organizationId, sourceSystem, `${suffix}:job`]
    )
    const firstApplication = await recruitment.assignCandidates({
      candidateIds: candidate.rows.map((row) => row.id),
      jobId: job.rows[0]!.id,
      organizationId,
    })
    const successfulCandidateMembership = await pool.query<{ name: string }>(
      `
        SELECT candidate.name
        FROM unnest($1::uuid[]) WITH ORDINALITY returned(candidate_id, ordinal)
        JOIN recruitment.candidates candidate ON candidate.id = returned.candidate_id
        ORDER BY candidate.name
      `,
      [firstApplication.map((application) => application.candidate_id)]
    )
    const firstRepeatApplication = firstApplication.find(
      (application) => application.candidate_id === candidate.rows[0]!.id
    )!
    await pool.query(
      `UPDATE recruitment.applications SET status = 'Approved' WHERE id = $1`,
      [firstRepeatApplication.id]
    )
    const beforeInvalidCandidateBulk = await pool.query<{
      applications: number
      assignment_events: number
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM recruitment.applications
            WHERE organization_id = $1) AS applications,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $1
              AND event_type = 'recruitment.candidate.assigned')
            AS assignment_events
      `,
      [organizationId]
    )
    let invalidCandidateBulkError = ""
    try {
      await recruitment.assignCandidates({
        candidateIds: [candidate.rows[0]!.id, randomUUID()],
        jobId: job.rows[0]!.id,
        organizationId,
      })
    } catch (error) {
      invalidCandidateBulkError = errorName(error)
    }
    const afterInvalidCandidateBulk = await pool.query<{
      applications: number
      assignment_events: number
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM recruitment.applications
            WHERE organization_id = $1) AS applications,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $1
              AND event_type = 'recruitment.candidate.assigned')
            AS assignment_events
      `,
      [organizationId]
    )
    const repeatedApplication = await recruitment.assignCandidates({
      candidateIds: [candidate.rows[0]!.id],
      jobId: job.rows[0]!.id,
      organizationId,
    })
    const applicationStatuses = await pool.query<{
      id: string
      status: string
    }>(
      `SELECT id, status FROM recruitment.applications WHERE id = ANY($1::uuid[])`,
      [firstApplication.concat(repeatedApplication).map((row) => row.id)]
    )
    const applicationStatusById = new Map(
      applicationStatuses.rows.map((row) => [row.id, row.status])
    )
    const interviewRounds = [
      {
        name: "Screening Round",
        scores: {
          availability_suitability: 4,
          communication_clarity: 4,
          relevant_experience: 4,
          role_understanding: 4,
          screening_recommendation: 4,
        },
      },
      {
        name: "Technical Round",
        scores: {
          independent_working: 4,
          practical_problem_solving: 4,
          process_equipment_knowledge: 4,
          quality_safety_awareness: 4,
          technical_knowledge: 4,
        },
      },
      {
        name: "HR Round",
        scores: {
          final_hiring_recommendation: 4,
          motivation_retention: 4,
          policy_shift_acceptance: 4,
          reliability_discipline: 4,
          team_fit: 4,
        },
      },
    ] as const
    const workspaceNextRounds: Array<string | null> = []
    const beforeLockedRound = await pool.query<{
      audit_count: number
      interview_count: number
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM recruitment.interviews
            WHERE application_id = $1) AS interview_count,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $2) AS audit_count
      `,
      [repeatedApplication[0]!.id, organizationId]
    )
    let lockedRoundError = ""
    try {
      await recruitment.recordInterview({
        applicationId: repeatedApplication[0]!.id,
        interviewerName: "Oracle Interviewer",
        organizationId,
        questionScores: interviewRounds[1].scores,
        roundName: "Technical Round",
        status: "Approved",
      })
    } catch (error) {
      lockedRoundError =
        error instanceof Error ? error.message : errorName(error)
    }
    const afterLockedRound = await pool.query<{
      audit_count: number
      interview_count: number
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM recruitment.interviews
            WHERE application_id = $1) AS interview_count,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $2) AS audit_count
      `,
      [repeatedApplication[0]!.id, organizationId]
    )
    const initialWorkspace = await recruitment.getJobWorkspace(
      organizationId,
      job.rows[0]!.id
    )
    workspaceNextRounds.push(
      initialWorkspace?.applications.find(
        (application) => application.id === repeatedApplication[0]!.id
      )?.nextRound ?? null
    )
    for (const [index, round] of interviewRounds.entries()) {
      await recruitment.scheduleInterview({
        applicationId: repeatedApplication[0]!.id,
        interviewAt: `2026-08-${String(index + 10).padStart(2, "0")}T10:00:00.000Z`,
        organizationId,
      })
      await recruitment.recordInterview({
        applicationId: repeatedApplication[0]!.id,
        interviewerName: "Oracle Interviewer",
        joiningDate: round.name === "HR Round" ? "2026-09-01" : undefined,
        organizationId,
        questionScores: round.scores,
        roundName: round.name,
        status: "Approved",
      })
      const workspace = await recruitment.getJobWorkspace(
        organizationId,
        job.rows[0]!.id
      )
      workspaceNextRounds.push(
        workspace?.applications.find(
          (application) => application.id === repeatedApplication[0]!.id
        )?.nextRound ?? null
      )
    }
    const interviewEvidence = await pool.query<{
      question_count: number
      round_name: string
      status: string
    }>(
      `
        SELECT interview.round_name, interview.status,
          (SELECT count(*)::int
            FROM jsonb_object_keys(interview.scores->'questions')) AS question_count
        FROM recruitment.interviews interview
        WHERE application_id = $1
        ORDER BY CASE round_name
          WHEN 'Screening Round' THEN 1
          WHEN 'Technical Round' THEN 2
          WHEN 'HR Round' THEN 3
        END
      `,
      [repeatedApplication[0]!.id]
    )

    const combinedWorkbook = await recruitment.bulkAssignEmployees({
      assignments: [
        {
          employeeCode: "EMP-COMBINED",
          employeeEvent: "Joined",
          employeeName: "Combined Employee",
          rowNumber: 1,
          targetCode: "COMBINED-1",
          targetType: "combined",
        },
      ],
      organizationId,
    })
    const combinedWorkbookPosts = await pool.query<{
      post_code: string
      status: string
    }>(
      `
        SELECT post.post_code, post.status
        FROM recruitment.combined_role_posts link
        JOIN recruitment.posts post ON post.id = link.post_id
        WHERE link.combined_role_id = $1
        ORDER BY link.is_primary DESC, post.post_code, post.id
      `,
      [combinedRole.rows[0]!.id]
    )

    const workbookPost = approvedPosts.rows[6]!
    const secondWorkbookPost = approvedPosts.rows[7]!
    const validWorkbookInput = [
      {
        employeeCode: "EMP-WORKBOOK",
        employeeEvent: "Joined" as const,
        employeeName: "Workbook Employee",
        rowNumber: 2,
        targetCode: workbookPost.post_code,
        targetType: "individual" as const,
      },
      {
        employeeCode: "EMP-WORKBOOK-2",
        employeeEvent: "Joined" as const,
        employeeName: "Second Workbook Employee",
        rowNumber: 3,
        targetCode: secondWorkbookPost.post_code,
        targetType: "individual" as const,
      },
    ]
    const validWorkbook = await recruitment.bulkAssignEmployees({
      assignments: validWorkbookInput,
      organizationId,
    })
    const validWorkbookAffectedPosts = await pool.query<{
      employee_code: string
      post_code: string
    }>(
      `
        SELECT post.employee_code, post.post_code
        FROM recruitment.posts post
        WHERE post.id = ANY($1::uuid[])
        ORDER BY post.post_code
      `,
      [[workbookPost.id, secondWorkbookPost.id]]
    )
    const beforeInvalidWorkbook = await pool.query<{
      audit_count: number
      row_version: string
      status: string
    }>(
      `
        SELECT row_version::text, status,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $2) AS audit_count
        FROM recruitment.posts WHERE id = $1
      `,
      [workbookPost.id, organizationId]
    )
    let invalidWorkbookError = ""
    try {
      await recruitment.bulkAssignEmployees({
        assignments: [
          {
            employeeEvent: "Removed",
            rowNumber: 4,
            targetCode: workbookPost.post_code,
            targetType: "individual",
          },
          {
            employeeCode: "EMP-INVALID",
            employeeEvent: "Joined",
            employeeName: "Invalid Employee",
            rowNumber: 5,
            targetCode: "MISSING-POST",
            targetType: "individual",
          },
        ],
        organizationId,
      })
    } catch (error) {
      invalidWorkbookError = errorName(error)
    }
    const afterInvalidWorkbook = await pool.query<{
      audit_count: number
      row_version: string
      status: string
    }>(
      `
        SELECT row_version::text, status,
          (SELECT count(*)::int FROM audit.events
            WHERE organization_id = $2) AS audit_count
        FROM recruitment.posts WHERE id = $1
      `,
      [workbookPost.id, organizationId]
    )
    const recruitmentCounts = await recruitment.count(organizationId)

    const dashboardEvidence = await captureDashboardWorkflow({
      acceleration,
      connectionString,
      dashboard,
      initialState: initialDashboardState,
      organizationId,
      pool,
    })
    const afterRedisLoss =
      await authorizationA.listAllGrantedCapabilities(userId)
    const authorizationFailure: FailureCategory | null =
      afterRevocation.includes("planning.plan.read") ? null : "authorization"

    const customerRows = await customers.list(organizationId)
    const productRows = await products.list(organizationId)
    const auditEvidence = await captureAuditEvidence(
      pool,
      organizationId,
      userId
    )
    return {
      version: "v1",
      observable: {
        auditEvidence,
        authorization: {
          afterRevocation: afterRevocation.sort(),
          beforeRevocation: beforeRevocation.sort(),
          postgresAuthoritativeAfterAccelerationFailure: afterRedisLoss.sort(),
          sensitiveCapabilityDecision: await authorizationB.hasCapability(
            userId,
            "planning.plan.read"
          ),
        },
        commercial: {
          costingTasks: costingTasks.map((task) => ({
            itemType: task.itemType,
            nextStageStatus: task.nextStageStatus,
          })),
          completeEcnGraph,
          customerPage: {
            first: customerRows.slice(0, 15).map((row) => row.customerUid),
            returned: customerRows.slice(0, 15).length,
            total: customerRows.length,
          },
          enquiryCoverage: {
            available: enquiryTotal.rows[0]!.count,
            returned: enquiryRows.length,
          },
          engineeringChange: {
            designStatus: engineeringDesign.status,
            finalStatus: engineeringCompletion.status,
            listedStatuses: engineeringChanges.map((change) => change.status),
          },
          masters: normalizeObservableValue(editableMasters),
          operationalQueues: commercialQueues,
          productPage: {
            first: productRows.slice(0, 25).map((row) => row.uid),
            returned: productRows.slice(0, 25).length,
            total: productRows.length,
          },
          purchaseOrder: {
            cancelledStatus: cancelledPurchaseOrder.status,
            listedBeforeCancellation: purchaseOrdersBeforeCancellation.map(
              (order) => ({ poNumber: order.poNumber, status: order.status })
            ),
          },
          reporting: {
            drawingHistory: drawingHistory.map((entry) => ({
              drawingNumber: entry.drawingNumber,
              revision: entry.revision,
              revisionDate: entry.revisionDate,
            })),
            websiteProducts: websiteProducts.map((entry) => ({
              partCode: entry.partCode,
              productDescription: entry.productDescription,
              websiteStatus: entry.websiteStatus,
            })),
          },
          workflow: {
            attachments: workflowAttachments.map(
              (attachment) => attachment.fileName
            ),
            costingStatus: costingHandoff.nextStageStatus,
            designStatus: designed.nextStageStatus,
            followupStatus: completedFollowup.status,
            handoverStatus: technicalHandover.technicalHandoverStatus,
          },
        },
        dashboard: dashboardEvidence.dashboard,
        failures: {
          categories: [
            ...failureCategories,
            ...(authorizationFailure === null ? [] : [authorizationFailure]),
            dashboardEvidence.infrastructureFailureCategory,
          ],
          customerFailuresAtomic:
            JSON.stringify(customerCountBeforeFailures.rows) ===
            JSON.stringify(customerCountAfterFailures.rows),
          invalidCandidateBulkError,
          invalidCandidateBulkLeavesNoPartialWrites:
            JSON.stringify(afterInvalidCandidateBulk.rows) ===
            JSON.stringify(beforeInvalidCandidateBulk.rows),
          invalidWorkbookError,
          invalidWorkbookLeavesNoPartialWrites:
            JSON.stringify(afterInvalidWorkbook.rows) ===
            JSON.stringify(beforeInvalidWorkbook.rows),
        },
        productionFloors: ["conventional", "cnc", "forging"].filter((code) =>
          floors.rows.some((floor) => floor.code === code)
        ),
        quality: qualityEvidence.rows[0]!,
        recruitment: {
          approvedPostStates: approvedPosts.rows
            .slice(0, 5)
            .map((post) => post.status),
          candidateBulk: {
            inputOrder: candidate.rows.map((row) => row.name),
            resultMembership: successfulCandidateMembership.rows.map(
              (row) => row.name
            ),
          },
          combinedRoleAssignment: {
            assignmentCount: combinedWorkbook.assignmentCount,
            posts: combinedWorkbookPosts.rows.map((post) => ({
              postCode: post.post_code,
              status: post.status,
            })),
            updatedPostCount: combinedWorkbook.updatedPostCount,
          },
          combinedRolePostCodes: approvedPosts.rows
            .filter((post) =>
              [approvedPosts.rows[0]!.id, approvedPosts.rows[5]!.id].includes(
                post.id
              )
            )
            .map((post) => post.post_code),
          invalidWorkbookAtomic:
            JSON.stringify(afterInvalidWorkbook.rows) ===
            JSON.stringify(beforeInvalidWorkbook.rows),
          lockedRound: {
            error: lockedRoundError,
            leavesNoPartialWrites:
              JSON.stringify(afterLockedRound.rows) ===
              JSON.stringify(beforeLockedRound.rows),
          },
          repeatApplicationStatuses: [
            applicationStatusById.get(firstRepeatApplication.id) ?? "missing",
            applicationStatusById.get(repeatedApplication[0]!.id) ?? "missing",
          ],
          sequentialInterviewRounds: interviewEvidence.rows.map((round) => ({
            questionCount: round.question_count,
            roundName: round.round_name,
            status: round.status,
          })),
          vacancyCounts: recruitmentCounts,
          validWorkbook: {
            affectedPosts: validWorkbookAffectedPosts.rows.map((row) => ({
              employeeCode: row.employee_code,
              postCode: row.post_code,
            })),
            assignmentCount: validWorkbook.assignmentCount,
            inputRowOrder: validWorkbookInput.map((row) => ({
              rowNumber: row.rowNumber,
              targetCode: row.targetCode,
            })),
          },
          workspaceNextRounds,
        },
        refresh: dashboardEvidence.refresh,
      },
      volatile: {
        generatedIdentifiers: {
          organizationId,
        },
        timestamps: {
          capturedAt: new Date().toISOString(),
        },
      },
    }
  } finally {
    await Promise.all([
      access.close(),
      authorizationA.close(),
      authorizationB.close(),
      commercial.close(),
      commercialCosting.close(),
      commercialMasters.close(),
      commercialOrders.close(),
      commercialReporting.close(),
      commercialRevisions.close(),
      customers.close(),
      dashboard.close(),
      planning.close(),
      products.close(),
      production.close(),
      quality.close(),
      recruitment.close(),
      workforce.close(),
    ])
    await pool.end()
  }
}
