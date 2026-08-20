import { randomUUID } from "node:crypto"

import type { Pool, PoolClient, QueryResult } from "pg"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

const threadStandardRules = [
  { pattern: /\b(?:UNC|UNEF|UNF|UN|UNR)\b/i, standard: "ANSI/ASME B1.1" },
  { pattern: /\b(?:NPTF|NPSF)\b/i, standard: "ANSI/ASME B1.20.3" },
  { pattern: /\b(?:NPT|NPSC|NPSM|NPSL)\b/i, standard: "ANSI/ASME B1.20.1" },
  { pattern: /\bGHT\b/i, standard: "ANSI/ASME B1.20.7" },
  { pattern: /\bBSPT\b/i, standard: "ISO 7-1" },
  { pattern: /\bBSPP\b/i, standard: "ISO 228-1" },
  {
    pattern: /\b(?:METRIC|M\d+(?:\s*[xX]\s*\d+(?:\.\d+)?)?)\b/i,
    standard: "ISO 261",
  },
] as const

type ActorContext = {
  actorUserId?: string | null
  organizationId: string
}

export type DrawingHistoryRow = {
  buffoliLaminatedQuantity: number
  cncLaminatedQuantity: number
  conventionalLaminatedQuantity: number
  drawingId: string
  drawingNumber: string
  itemDescription: string
  itemId: string
  remarks: string | null
  revision: string
  revisionDate: string
  rowNumber: number
  sourceQuoteItemId: string | null
  uid: string
}

export type DrawingChangeValues = {
  buffoliLaminatedQuantity: number
  cncLaminatedQuantity: number
  conventionalLaminatedQuantity: number
  drawingNumber: string
  remarks: string | null
  revision: string
  revisionDate: string
}

export type DrawingChangeLogRow = {
  after: DrawingChangeValues
  before: DrawingChangeValues | null
  changeId: string
  changeType: "Drawing Updated" | "Revision Created"
  changedAt: string
  changedBy: string
  drawingId: string
  itemDescription: string
  itemId: string
  uid: string
}

type DrawingHistoryDatabaseRow = {
  buffoli_laminated_quantity: number
  cnc_laminated_quantity: number
  conventional_laminated_quantity: number
  drawing_id: string
  drawing_number: string | null
  item_description: string
  item_id: string
  remarks: string | null
  revision: string
  revision_date: string | Date | null
  row_number: string
  source_quote_item_id: string | null
  uid: string
}

type DrawingChangeLogDatabaseRow = {
  after_state: unknown
  before_state: unknown
  change_id: string
  change_type: "Drawing Updated" | "Revision Created"
  changed_at: string | Date
  changed_by: string | null
  drawing_id: string
  item_description: string
  item_id: string
  uid: string
}

export type WebsiteProductInput = ActorContext & {
  additionalNotes?: string | null
  applications: string
  category: string
  certifications?: string | null
  connections?: string | null
  description?: string | null
  dimensions?: string | null
  drawingCategory?: string | null
  entryCreatedAt?: string | null
  finishPlating?: string | null
  grade: string
  isActive: boolean
  material: string
  pressure?: string | null
  profileId: string
  remark?: string | null
  sealant?: string | null
  size: string
  subCategory: string
  temperature: string
  threadSize1?: string | null
  threadSize2?: string | null
  threadSize3?: string | null
  threadSize4?: string | null
  websiteCategory?: string | null
  websiteSubCategory?: string | null
}

export type WebsiteProductRow = {
  additionalNotes: string | null
  applications: string
  assemblyCode1: string | null
  assemblyCode2: string | null
  assemblyCode3: string | null
  assemblyCode4: string | null
  assemblyCode5: string | null
  assemblyCode6: string | null
  assemblyUid1: string | null
  assemblyUid2: string | null
  assemblyUid3: string | null
  assemblyUid4: string | null
  assemblyUid5: string | null
  assemblyUid6: string | null
  catalogGrade: string
  category: string | null
  certifications: string | null
  connections: string | null
  description: string | null
  dimensions: string | null
  drawingCategory: string | null
  entryCreatedAt: string
  finalAssembliesCode: string | null
  finishPlating: string | null
  grade: string
  isActive: boolean
  itemId: string
  material: string
  materialConstruction: string | null
  partCode: string
  pressure: string | null
  productDescription: string
  profileId: string
  remark: string | null
  sealant: string | null
  size: string | null
  sourceQuoteItemId: string | null
  subCategory: string | null
  temperature: string
  threadSize1: string | null
  threadSize2: string | null
  threadSize3: string | null
  threadSize4: string | null
  threadStandard: string | null
  uid: string
  websiteCategory: string | null
  websiteStatus: "Completed" | "In Progress"
  websiteSubCategory: string | null
}

type WebsiteDatabaseRow = {
  additional_notes: string | null
  applications: string
  assembly_code_1: string | null
  assembly_code_2: string | null
  assembly_code_3: string | null
  assembly_code_4: string | null
  assembly_code_5: string | null
  assembly_code_6: string | null
  assembly_uid_1: string | null
  assembly_uid_2: string | null
  assembly_uid_3: string | null
  assembly_uid_4: string | null
  assembly_uid_5: string | null
  assembly_uid_6: string | null
  catalog_grade: string
  category: string | null
  certifications: string | null
  connections: string | null
  description: string | null
  dimensions: string | null
  drawing_category: string | null
  entry_created_at: string | Date
  final_assemblies_code: string | null
  finish_plating: string | null
  grade: string
  is_active: boolean
  item_id: string
  material: string
  material_construction: string | null
  part_code: string | null
  pressure: string | null
  product_description: string
  profile_id: string
  remark: string | null
  sealant: string | null
  size: string | null
  source_quote_item_id: string | null
  sub_category: string | null
  temperature: string
  thread_size_1: string | null
  thread_size_2: string | null
  thread_size_3: string | null
  thread_size_4: string | null
  thread_standard: string | null
  uid: string
  website_category: string | null
  website_status: "Completed" | "In Progress"
  website_sub_category: string | null
}

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function optional(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function isoDate(value: string | Date | null | undefined) {
  if (!value) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function drawingHistoryRow(row: DrawingHistoryDatabaseRow): DrawingHistoryRow {
  return {
    buffoliLaminatedQuantity: row.buffoli_laminated_quantity,
    cncLaminatedQuantity: row.cnc_laminated_quantity,
    conventionalLaminatedQuantity: row.conventional_laminated_quantity,
    drawingId: row.drawing_id,
    drawingNumber: row.drawing_number ?? "",
    itemDescription: row.item_description,
    itemId: row.item_id,
    remarks: row.remarks,
    revision: row.revision,
    revisionDate: isoDate(row.revision_date),
    rowNumber: Number(row.row_number),
    sourceQuoteItemId: row.source_quote_item_id,
    uid: row.uid,
  }
}

function drawingChangeValues(value: unknown): DrawingChangeValues {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const quantity = (key: string) => {
    const parsed = Number(record[key] ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const text = (key: string) => String(record[key] ?? "")

  return {
    buffoliLaminatedQuantity: quantity("buffoliLaminatedQuantity"),
    cncLaminatedQuantity: quantity("cncLaminatedQuantity"),
    conventionalLaminatedQuantity: quantity("conventionalLaminatedQuantity"),
    drawingNumber: text("drawingNumber"),
    remarks: record.remarks ? String(record.remarks) : null,
    revision: text("revision"),
    revisionDate: text("revisionDate").slice(0, 10),
  }
}

function drawingChangeLogRow(
  row: DrawingChangeLogDatabaseRow
): DrawingChangeLogRow {
  return {
    after: drawingChangeValues(row.after_state),
    before: row.before_state ? drawingChangeValues(row.before_state) : null,
    changeId: row.change_id,
    changeType: row.change_type,
    changedAt:
      row.changed_at instanceof Date
        ? row.changed_at.toISOString()
        : String(row.changed_at),
    changedBy: row.changed_by ?? "System",
    drawingId: row.drawing_id,
    itemDescription: row.item_description,
    itemId: row.item_id,
    uid: row.uid,
  }
}

export function deriveThreadStandard(
  threadEntries: Array<string | null | undefined>
) {
  const standards = new Set<string>()
  for (const entry of threadEntries) {
    const value = String(entry ?? "").trim()
    if (!value) continue
    for (const rule of threadStandardRules) {
      if (rule.pattern.test(value)) standards.add(rule.standard)
    }
  }
  return Array.from(standards).join("; ")
}

function websiteRow(row: WebsiteDatabaseRow): WebsiteProductRow {
  return {
    additionalNotes: row.additional_notes,
    applications: row.applications,
    assemblyCode1: row.assembly_code_1,
    assemblyCode2: row.assembly_code_2,
    assemblyCode3: row.assembly_code_3,
    assemblyCode4: row.assembly_code_4,
    assemblyCode5: row.assembly_code_5,
    assemblyCode6: row.assembly_code_6,
    assemblyUid1: row.assembly_uid_1,
    assemblyUid2: row.assembly_uid_2,
    assemblyUid3: row.assembly_uid_3,
    assemblyUid4: row.assembly_uid_4,
    assemblyUid5: row.assembly_uid_5,
    assemblyUid6: row.assembly_uid_6,
    catalogGrade: row.catalog_grade,
    category: row.category,
    certifications: row.certifications,
    connections: row.connections,
    description: row.description,
    dimensions: row.dimensions,
    drawingCategory: row.drawing_category,
    entryCreatedAt: isoDate(row.entry_created_at),
    finalAssembliesCode: row.final_assemblies_code,
    finishPlating: row.finish_plating,
    grade: row.grade,
    isActive: row.is_active,
    itemId: row.item_id,
    material: row.material,
    materialConstruction: row.material_construction,
    partCode: row.part_code ?? "",
    pressure: row.pressure,
    productDescription: row.product_description,
    profileId: row.profile_id,
    remark: row.remark,
    sealant: row.sealant,
    size: row.size,
    sourceQuoteItemId: row.source_quote_item_id,
    subCategory: row.sub_category,
    temperature: row.temperature,
    threadSize1: row.thread_size_1,
    threadSize2: row.thread_size_2,
    threadSize3: row.thread_size_3,
    threadSize4: row.thread_size_4,
    threadStandard: row.thread_standard,
    uid: row.uid,
    websiteCategory: row.website_category,
    websiteStatus: row.website_status,
    websiteSubCategory: row.website_sub_category,
  }
}

const websiteSelect = `
  SELECT profiles.id profile_id, profiles.item_id, profiles.source_quote_item_id,
    items.uid, profiles.remark, profiles.category, profiles.sub_category,
    profiles.product_description, profiles.part_code, profiles.size,
    profiles.grade, profiles.material, profiles.material_construction,
    profiles.finish_plating, profiles.thread_standard, profiles.sealant,
    profiles.temperature, profiles.pressure, profiles.connections,
    profiles.final_assemblies_code, profiles.catalog_grade,
    profiles.description, profiles.applications, profiles.certifications,
    profiles.additional_notes, profiles.dimensions, profiles.website_category,
    profiles.website_sub_category, profiles.is_active,
    profiles.entry_created_at, profiles.drawing_category,
    profiles.thread_size_1, profiles.thread_size_2,
    profiles.thread_size_3, profiles.thread_size_4,
    profiles.assembly_uid_1, profiles.assembly_code_1,
    profiles.assembly_uid_2, profiles.assembly_code_2,
    profiles.assembly_uid_3, profiles.assembly_code_3,
    profiles.assembly_uid_4, profiles.assembly_code_4,
    profiles.assembly_uid_5, profiles.assembly_code_5,
    profiles.assembly_uid_6, profiles.assembly_code_6,
    profiles.website_status
  FROM catalog.website_product_profiles profiles
  JOIN catalog.items items ON items.id = profiles.item_id
`

async function writeAudit(
  client: PoolClient,
  input: ActorContext & {
    afterState?: Record<string, unknown> | null
    beforeState?: Record<string, unknown> | null
    eventType: string
    metadata: Record<string, unknown>
    targetId: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table,
        target_id, actor_user_id, before_state, after_state, metadata,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'catalog', $3, $4, $5, $6, $7, $8,
        'mrm-dashboard', 'commercial_reporting_events', $9)
    `,
    [
      input.organizationId,
      input.eventType,
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      input.beforeState ?? null,
      input.afterState ?? null,
      input.metadata,
      randomUUID(),
    ]
  )
}

async function syncWebsiteAssemblies(
  client: PoolClient,
  organizationId: string,
  actorUserId?: string | null
) {
  const profiles = await client.query<{ id: string; item_id: string }>(
    `SELECT id, item_id FROM catalog.website_product_profiles
     WHERE organization_id = $1`,
    [organizationId]
  )
  for (const profile of profiles.rows) {
    const related = await client.query<{
      part_code: string | null
      uid: string
    }>(
      `
        SELECT related.uid, website.part_code
        FROM (
          SELECT child.uid, child.id related_item_id,
            COALESCE(bom.sequence, 2147483647) sequence, bom.id sort_id
          FROM catalog.bom_lines bom
          JOIN catalog.items child ON child.id = bom.component_item_id
          WHERE bom.parent_item_id = $1
          UNION ALL
          SELECT parent.uid, parent.id,
            COALESCE(bom.sequence, 2147483647), bom.id
          FROM catalog.bom_lines bom
          JOIN catalog.items parent ON parent.id = bom.parent_item_id
          WHERE bom.component_item_id = $1
        ) related
        LEFT JOIN catalog.website_product_profiles website
          ON website.item_id = related.related_item_id
        ORDER BY related.sequence, related.sort_id, related.uid
      `,
      [profile.item_id]
    )
    const slots = Array.from({ length: 6 }, (_, index) => related.rows[index])
    const codes = related.rows
      .map((row) => row.part_code?.trim())
      .filter((value): value is string => Boolean(value))
    await client.query(
      `
        UPDATE catalog.website_product_profiles
        SET final_assemblies_code = $1,
          assembly_uid_1 = $2, assembly_code_1 = $3,
          assembly_uid_2 = $4, assembly_code_2 = $5,
          assembly_uid_3 = $6, assembly_code_3 = $7,
          assembly_uid_4 = $8, assembly_code_4 = $9,
          assembly_uid_5 = $10, assembly_code_5 = $11,
          assembly_uid_6 = $12, assembly_code_6 = $13,
          updated_by_user_id = $14, updated_at = now(),
          row_version = row_version + 1
        WHERE id = $15
      `,
      [
        codes.join("; ") || null,
        slots[0]?.uid ?? null,
        slots[0]?.part_code ?? null,
        slots[1]?.uid ?? null,
        slots[1]?.part_code ?? null,
        slots[2]?.uid ?? null,
        slots[2]?.part_code ?? null,
        slots[3]?.uid ?? null,
        slots[3]?.part_code ?? null,
        slots[4]?.uid ?? null,
        slots[4]?.part_code ?? null,
        slots[5]?.uid ?? null,
        slots[5]?.part_code ?? null,
        actorUserId ?? null,
        profile.id,
      ]
    )
  }
}

const exportBatchSize = (value: number) =>
  Math.min(Math.max(Math.floor(value), 1), 500)

async function readSnapshot<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    )
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

function monthKeys(now = new Date()) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    return {
      key,
      label: date.toLocaleString("en", { month: "short", year: "2-digit" }),
    }
  })
}

export function createCommercialReportingRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async dashboard(input: { organizationId: string }) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        const statsResult = await client.query(
          `
            SELECT
              (SELECT COUNT(*) FROM sales.customers WHERE organization_id = $1) customers,
              (SELECT COUNT(*) FROM sales.enquiries WHERE organization_id = $1) enquiries,
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Sent'
                  AND sent_at >= date_trunc('month', CURRENT_TIMESTAMP)) monthly_quoted,
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Draft') pending_costing,
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Sent') quoted,
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Accepted') ordered,
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Accepted'
                  AND is_active) p_prices,
              (SELECT COUNT(*) FROM sales.followups
                WHERE organization_id = $1 AND status = 'Pending'
                  AND due_on <= CURRENT_DATE) pending_followups
          `,
          [input.organizationId]
        )
        const monthlyRows = await client.query<{
          quote_count: string
          month_key: string
        }>(
          `
            SELECT to_char(sent_at, 'YYYY-MM') AS month_key,
              COUNT(*) AS quote_count
            FROM sales.quote_items
            WHERE organization_id = $1 AND status = 'Sent'
              AND sent_at >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
            GROUP BY 1 ORDER BY 1
          `,
          [input.organizationId]
        )
        const monthly = new Map(
          monthlyRows.rows.map((row) => [
            row.month_key,
            Number(row.quote_count),
          ])
        )
        const workflowResult = await client.query(
          `
            SELECT
              (SELECT COUNT(*) FROM sales.clarification_tasks
                WHERE organization_id = $1 AND target_stage = 'Sales'
                  AND status = 'Open') +
              (SELECT COUNT(*) FROM sales.followups
                WHERE organization_id = $1 AND status = 'Pending'
                  AND due_on <= CURRENT_DATE) +
              (SELECT COUNT(*) FROM sales.enquiries
                WHERE organization_id = $1
                  AND technical_handover_status <> 'Handed Over') sales,
              (SELECT COUNT(*) FROM sales.enquiry_items items
                JOIN sales.enquiries enquiries ON enquiries.id = items.enquiry_id
                WHERE items.organization_id = $1
                  AND enquiries.technical_handover_status = 'Handed Over'
                  AND items.technical_review_status IN
                    ('Pending Review', 'Need Clarification')) technical,
              (SELECT COUNT(*) FROM sales.design_tasks
                WHERE organization_id = $1
                  AND design_status NOT IN ('Design Complete', 'Not Required')) design,
              (SELECT COUNT(*) FROM sales.design_tasks
                WHERE organization_id = $1
                  AND next_stage_status = 'Product Costing') product_costing,
              (SELECT COUNT(*) FROM sales.design_tasks
                WHERE organization_id = $1
                  AND next_stage_status = 'Product Costing Complete') +
              (SELECT COUNT(*) FROM sales.quote_items
                WHERE organization_id = $1 AND status = 'Draft') quote_costing
          `,
          [input.organizationId]
        )
        const workflow = workflowResult.rows[0]!
        const quoteMix = await client.query<{ count: string; label: string }>(
          `
            SELECT label, COUNT(*) count
            FROM (
              SELECT CASE
                WHEN status = 'Accepted' THEN 'Purchase Items'
                WHEN status = 'Sent' THEN 'Quoted Items'
                ELSE 'Quote Costing'
              END label
              FROM sales.quote_items
              WHERE organization_id = $1 AND status <> 'Superseded'
            ) rows
            GROUP BY label ORDER BY count DESC, label
          `,
          [input.organizationId]
        )
        const materialLeadTimes = await client.query<{
          average_days: string
          material: string
          quoted_items: string
        }>(
          `
            SELECT COALESCE(NULLIF(btrim(grades.name), ''),
                NULLIF(btrim(enquiry_items.grade), ''), 'Material Not Set') material,
              COUNT(*) quoted_items,
              ROUND(AVG(GREATEST(0,
                EXTRACT(EPOCH FROM (quotes.sent_at - enquiries.received_on::timestamp)) /
                  86400))::numeric, 1) average_days
            FROM sales.quote_items quotes
            LEFT JOIN sales.enquiry_items enquiry_items
              ON enquiry_items.id = quotes.enquiry_item_id
            LEFT JOIN sales.enquiries enquiries
              ON enquiries.id = enquiry_items.enquiry_id
            JOIN catalog.items items ON items.id = quotes.item_id
            LEFT JOIN catalog.material_grades grades
              ON grades.id = items.material_grade_id
            WHERE quotes.organization_id = $1 AND quotes.status = 'Sent'
            GROUP BY material
            ORDER BY quoted_items DESC, average_days DESC
            LIMIT 8
          `,
          [input.organizationId]
        )
        const customers = await client.query<{
          count: string
          customer: string
        }>(
          `
            SELECT customers.company_name customer, COUNT(*) count
            FROM sales.quote_items quotes
            JOIN sales.customers customers ON customers.id = quotes.customer_id
            WHERE quotes.organization_id = $1 AND quotes.status = 'Sent'
            GROUP BY customers.id
            ORDER BY count DESC, customers.company_name
            LIMIT 8
          `,
          [input.organizationId]
        )
        const customerTotal = customers.rows.reduce(
          (total, row) => total + Number(row.count),
          0
        )
        let cumulative = 0
        await client.query("COMMIT")
        const stats = statsResult.rows[0]!
        return {
          customerPareto: customers.rows.map((row) => {
            cumulative += Number(row.count)
            return {
              count: Number(row.count),
              cumulativePercent:
                customerTotal > 0
                  ? Math.round((cumulative / customerTotal) * 100)
                  : 0,
              customer: row.customer,
            }
          }),
          materialLeadTimes: materialLeadTimes.rows.map((row) => ({
            averageDays: Number(row.average_days),
            material: row.material,
            quotedItems: Number(row.quoted_items),
          })),
          monthlyQuotedItems: monthKeys().map((month) => ({
            count: monthly.get(month.key) ?? 0,
            month: month.label,
          })),
          quoteMix: quoteMix.rows.map((row) => ({
            count: Number(row.count),
            label: row.label,
          })),
          stats: {
            customers: Number(stats.customers),
            enquiries: Number(stats.enquiries),
            monthlyQuoted: Number(stats.monthly_quoted),
            ordered: Number(stats.ordered),
            pendingCosting: Number(stats.pending_costing),
            pendingFollowups: Number(stats.pending_followups),
            pPrices: Number(stats.p_prices),
            quoted: Number(stats.quoted),
          },
          workflowLoad: [
            { count: Number(workflow.sales), label: "Sales Pending Work" },
            { count: Number(workflow.technical), label: "Technical Review" },
            { count: Number(workflow.design), label: "Design" },
            {
              count: Number(workflow.product_costing),
              label: "Product Costing",
            },
            { count: Number(workflow.quote_costing), label: "Quote Costing" },
          ],
        }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async listDrawingHistory(input: {
      organizationId: string
      query?: string | null
      revision?: string | null
    }) {
      const result = await pool.query<{
        buffoli_laminated_quantity: number
        cnc_laminated_quantity: number
        conventional_laminated_quantity: number
        drawing_id: string
        drawing_number: string | null
        item_description: string
        item_id: string
        remarks: string | null
        revision: string
        revision_date: string | Date | null
        row_number: string
        source_quote_item_id: string | null
        uid: string
      }>(
        `
          SELECT drawings.id drawing_id, drawings.item_id,
            drawings.source_quote_item_id, items.uid,
            items.description item_description,
            COALESCE(drawings.drawing_number, '') drawing_number,
            drawings.revision,
            to_char(
              COALESCE(drawings.effective_at, drawings.created_at),
              'YYYY-MM-DD'
            ) revision_date,
            drawings.buffoli_laminated_quantity,
            drawings.conventional_laminated_quantity,
            drawings.cnc_laminated_quantity, drawings.remarks,
            ROW_NUMBER() OVER (
              ORDER BY CASE WHEN items.uid ~ '^M[0-9]+$'
                THEN substring(items.uid from 2)::bigint ELSE 9223372036854775807 END,
                items.uid,
                CASE WHEN drawings.revision ~ '^[0-9]+$'
                  THEN drawings.revision::bigint ELSE 9223372036854775807 END,
                drawings.revision, drawings.id
            ) row_number
          FROM catalog.drawings drawings
          JOIN catalog.items items ON items.id = drawings.item_id
          WHERE drawings.organization_id = $1
            AND ($2::text IS NULL OR drawings.revision = $2)
            AND ($3::text IS NULL OR concat_ws(' ', items.uid,
              items.description, drawings.drawing_number, drawings.remarks)
              ILIKE '%' || $3 || '%')
          ORDER BY row_number
        `,
        [input.organizationId, optional(input.revision), optional(input.query)]
      )
      return result.rows.map(drawingHistoryRow)
    },

    async listDrawingRegister(input: { organizationId: string }) {
      const result = await pool.query<DrawingHistoryDatabaseRow>(
        `
          WITH ranked_drawings AS (
            SELECT drawings.id drawing_id, drawings.item_id,
              drawings.source_quote_item_id, items.uid,
              items.description item_description,
              COALESCE(drawings.drawing_number, '') drawing_number,
              drawings.revision,
              to_char(
                COALESCE(drawings.effective_at, drawings.created_at),
                'YYYY-MM-DD'
              ) revision_date,
              drawings.buffoli_laminated_quantity,
              drawings.conventional_laminated_quantity,
              drawings.cnc_laminated_quantity, drawings.remarks,
              ROW_NUMBER() OVER (
                PARTITION BY drawings.item_id
                ORDER BY (drawings.status = 'current') DESC,
                  COALESCE(drawings.effective_at, drawings.created_at) DESC,
                  drawings.created_at DESC,
                  CASE WHEN drawings.revision ~ '^[0-9]+$'
                    THEN drawings.revision::bigint END DESC NULLS LAST,
                  drawings.revision DESC, drawings.id DESC
              ) item_revision_rank
            FROM catalog.drawings drawings
            JOIN catalog.items items ON items.id = drawings.item_id
            WHERE drawings.organization_id = $1
          ), drawing_register AS (
            SELECT *, ROW_NUMBER() OVER (
              ORDER BY CASE WHEN uid ~ '^M[0-9]+$'
                  THEN substring(uid from 2)::bigint
                  ELSE 9223372036854775807 END,
                uid, drawing_id
            ) row_number
            FROM ranked_drawings
            WHERE item_revision_rank = 1
          )
          SELECT buffoli_laminated_quantity, cnc_laminated_quantity,
            conventional_laminated_quantity, drawing_id, drawing_number,
            item_description, item_id, remarks, revision, revision_date,
            row_number, source_quote_item_id, uid
          FROM drawing_register
          ORDER BY row_number
        `,
        [input.organizationId]
      )
      return result.rows.map(drawingHistoryRow)
    },

    async listDrawingChangeLog(input: { organizationId: string }) {
      const result = await pool.query<DrawingChangeLogDatabaseRow>(
        `
          WITH drawing_changes AS (
            SELECT drawings.id change_id, drawings.id drawing_id,
              drawings.item_id, items.uid,
              items.description item_description,
              'Revision Created'::text change_type,
              drawings.created_at changed_at,
              COALESCE(users.name, users.email) changed_by,
              NULL::jsonb before_state,
              jsonb_build_object(
                'drawingNumber', COALESCE(drawings.drawing_number, ''),
                'revision', drawings.revision,
                'revisionDate', to_char(
                  COALESCE(drawings.effective_at, drawings.created_at),
                  'YYYY-MM-DD'
                ),
                'buffoliLaminatedQuantity',
                  drawings.buffoli_laminated_quantity,
                'conventionalLaminatedQuantity',
                  drawings.conventional_laminated_quantity,
                'cncLaminatedQuantity', drawings.cnc_laminated_quantity,
                'remarks', drawings.remarks
              ) after_state
            FROM catalog.drawings drawings
            JOIN catalog.items items ON items.id = drawings.item_id
            LEFT JOIN identity.users users
              ON users.id = drawings.created_by_user_id
            WHERE drawings.organization_id = $1
              AND NOT EXISTS (
                SELECT 1
                FROM audit.events revision_event
                WHERE revision_event.target_schema = 'catalog'
                  AND revision_event.target_table = 'drawings'
                  AND revision_event.target_id = drawings.id
                  AND revision_event.event_type =
                    'drawing_history.revision_created'
              )

            UNION ALL

            SELECT events.id, drawings.id, drawings.item_id, items.uid,
              items.description,
              CASE
                WHEN events.event_type = 'drawing_history.revision_created'
                  THEN 'Revision Created'
                ELSE 'Drawing Updated'
              END,
              events.occurred_at,
              COALESCE(users.name, users.email, events.legacy_actor),
              events.before_state,
              COALESCE(events.after_state, events.metadata)
            FROM audit.events events
            JOIN catalog.drawings drawings ON drawings.id = events.target_id
            JOIN catalog.items items ON items.id = drawings.item_id
            LEFT JOIN identity.users users ON users.id = events.actor_user_id
            WHERE events.organization_id = $1
              AND events.target_schema = 'catalog'
              AND events.target_table = 'drawings'
              AND events.event_type IN (
                'drawing_history.updated',
                'drawing_history.revision_created'
              )
          )
          SELECT change_id, drawing_id, item_id, uid, item_description,
            change_type, changed_at, changed_by, before_state, after_state
          FROM drawing_changes
          ORDER BY changed_at DESC, change_id DESC
        `,
        [input.organizationId]
      )
      return result.rows.map(drawingChangeLogRow)
    },

    async listWebsiteProducts(input: {
      active?: boolean | null
      category?: string | null
      organizationId: string
      query?: string | null
      status?: string | null
    }) {
      const result = await pool.query<WebsiteDatabaseRow>(
        `${websiteSelect}
         WHERE profiles.organization_id = $1
           AND ($2::boolean IS NULL OR profiles.is_active = $2)
           AND ($3::text IS NULL OR profiles.website_status = $3)
           AND ($4::text IS NULL OR profiles.category = $4)
           AND ($5::text IS NULL OR concat_ws(' ', items.uid, profiles.part_code,
             profiles.product_description, profiles.category,
             profiles.sub_category, profiles.grade) ILIKE '%' || $5 || '%')
         ORDER BY CASE WHEN items.uid ~ '^M[0-9]+$'
           THEN substring(items.uid from 2)::bigint ELSE 9223372036854775807 END,
           items.uid, profiles.id`,
        [
          input.organizationId,
          input.active ?? null,
          optional(input.status),
          optional(input.category),
          optional(input.query),
        ]
      )
      return result.rows.map(websiteRow)
    },

    async listDrawingHistoryForExport(
      input: {
        organizationId: string
        query?: string | null
        revision?: string | null
      },
      requestedBatchSize = 500
    ) {
      const batchSize = exportBatchSize(requestedBatchSize)
      return readSnapshot(pool, async (client) => {
        const rows: DrawingHistoryRow[] = []
        let cursorRowNumber = 0

        while (true) {
          const batch = await client.query<DrawingHistoryDatabaseRow>(
            `
              WITH drawing_rows AS (
                SELECT drawings.id drawing_id, drawings.item_id,
                  drawings.source_quote_item_id, items.uid,
                  items.description item_description,
                  COALESCE(drawings.drawing_number, '') drawing_number,
                  drawings.revision,
                  to_char(
                    COALESCE(drawings.effective_at, drawings.created_at),
                    'YYYY-MM-DD'
                  ) revision_date,
                  drawings.buffoli_laminated_quantity,
                  drawings.conventional_laminated_quantity,
                  drawings.cnc_laminated_quantity, drawings.remarks,
                  ROW_NUMBER() OVER (
                    ORDER BY CASE WHEN items.uid ~ '^M[0-9]+$'
                      THEN substring(items.uid from 2)::bigint
                      ELSE 9223372036854775807 END,
                      items.uid,
                      CASE WHEN drawings.revision ~ '^[0-9]+$'
                        THEN drawings.revision::bigint
                        ELSE 9223372036854775807 END,
                      drawings.revision, drawings.id
                  ) row_number
                FROM catalog.drawings drawings
                JOIN catalog.items items ON items.id = drawings.item_id
                WHERE drawings.organization_id = $1
                  AND ($2::text IS NULL OR drawings.revision = $2)
                  AND ($3::text IS NULL OR concat_ws(' ', items.uid,
                    items.description, drawings.drawing_number,
                    drawings.remarks) ILIKE '%' || $3 || '%')
              )
              SELECT *
              FROM drawing_rows
              WHERE row_number > $4
              ORDER BY row_number
              LIMIT $5
            `,
            [
              input.organizationId,
              optional(input.revision),
              optional(input.query),
              cursorRowNumber,
              batchSize,
            ]
          )
          rows.push(...batch.rows.map(drawingHistoryRow))
          if (batch.rows.length < batchSize) break
          cursorRowNumber = Number(batch.rows.at(-1)!.row_number)
        }

        return rows
      })
    },

    async listWebsiteProductsForExport(
      input: {
        active?: boolean | null
        category?: string | null
        organizationId: string
        query?: string | null
        status?: string | null
      },
      requestedBatchSize = 500
    ) {
      const batchSize = exportBatchSize(requestedBatchSize)
      return readSnapshot(pool, async (client) => {
        const rows: WebsiteProductRow[] = []
        let cursorUidNumber: string | null = null
        let cursorUid: string | null = null
        let cursorId: string | null = null

        while (true) {
          const batch: QueryResult<WebsiteDatabaseRow> =
            await client.query<WebsiteDatabaseRow>(
              `${websiteSelect}
             WHERE profiles.organization_id = $1
               AND ($2::boolean IS NULL OR profiles.is_active = $2)
               AND ($3::text IS NULL OR profiles.website_status = $3)
               AND ($4::text IS NULL OR profiles.category = $4)
               AND ($5::text IS NULL OR concat_ws(' ', items.uid,
                 profiles.part_code, profiles.product_description,
                 profiles.category, profiles.sub_category, profiles.grade)
                 ILIKE '%' || $5 || '%')
               AND (
                 $6::bigint IS NULL
                 OR (
                   CASE WHEN items.uid ~ '^M[0-9]+$'
                     THEN substring(items.uid from 2)::bigint
                     ELSE 9223372036854775807 END,
                   items.uid,
                   profiles.id
                 ) > ($6::bigint, $7::text, $8::uuid)
               )
             ORDER BY CASE WHEN items.uid ~ '^M[0-9]+$'
               THEN substring(items.uid from 2)::bigint
               ELSE 9223372036854775807 END,
               items.uid, profiles.id
             LIMIT $9`,
              [
                input.organizationId,
                input.active ?? null,
                optional(input.status),
                optional(input.category),
                optional(input.query),
                cursorUidNumber,
                cursorUid,
                cursorId,
                batchSize,
              ]
            )
          rows.push(...batch.rows.map(websiteRow))
          if (batch.rows.length < batchSize) break
          const last: WebsiteDatabaseRow = batch.rows.at(-1)!
          cursorUidNumber =
            /^M([0-9]+)$/.exec(last.uid)?.[1] ?? "9223372036854775807"
          cursorUid = last.uid
          cursorId = last.profile_id
        }

        return rows
      })
    },

    async updateDrawingHistory(
      input: ActorContext & {
        buffoliLaminatedQuantity?: number
        cncLaminatedQuantity?: number
        conventionalLaminatedQuantity?: number
        drawingId: string
        drawingNumber: string
        remarks?: string | null
        revision: string
        revisionDate: string
      }
    ) {
      const drawingNumber = required(input.drawingNumber, "Drawing number")
      const revision = required(input.revision, "Revision number")
      const revisionDate = required(input.revisionDate, "Revision date")
      const quantities = [
        input.buffoliLaminatedQuantity ?? 0,
        input.conventionalLaminatedQuantity ?? 0,
        input.cncLaminatedQuantity ?? 0,
      ]
      if (quantities.some((value) => !Number.isInteger(value) || value < 0)) {
        throw new Error("Laminated quantities cannot be negative.")
      }
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const currentResult = await client.query<{
          buffoli_laminated_quantity: number
          cnc_laminated_quantity: number
          conventional_laminated_quantity: number
          drawing_number: string | null
          item_id: string
          remarks: string | null
          revision: string
          revision_date: string
          source_quote_item_id: string | null
        }>(
          `
            SELECT item_id, source_quote_item_id, revision,
              COALESCE(drawing_number, '') drawing_number,
              to_char(COALESCE(effective_at, created_at), 'YYYY-MM-DD')
                revision_date,
              buffoli_laminated_quantity,
              conventional_laminated_quantity,
              cnc_laminated_quantity, remarks
            FROM catalog.drawings
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [input.drawingId, input.organizationId]
        )
        const current = currentResult.rows[0]
        if (!current) throw new Error("Drawing history row was not found.")
        const remarks = optional(input.remarks)
        const beforeState = {
          buffoliLaminatedQuantity: current.buffoli_laminated_quantity,
          cncLaminatedQuantity: current.cnc_laminated_quantity,
          conventionalLaminatedQuantity:
            current.conventional_laminated_quantity,
          drawingNumber: current.drawing_number ?? "",
          remarks: current.remarks,
          revision: current.revision,
          revisionDate: current.revision_date,
        }
        const afterState = {
          buffoliLaminatedQuantity: quantities[0],
          cncLaminatedQuantity: quantities[2],
          conventionalLaminatedQuantity: quantities[1],
          drawingNumber,
          remarks,
          revision,
          revisionDate,
        }

        let savedDrawingId = input.drawingId
        let eventType = "drawing_history.updated"
        if (revision !== current.revision) {
          const inserted = await client.query<{ id: string }>(
            `
              INSERT INTO catalog.drawings (
                organization_id, item_id, source_quote_item_id, revision,
                drawing_number, status, effective_at,
                buffoli_laminated_quantity,
                conventional_laminated_quantity,
                cnc_laminated_quantity, remarks,
                created_by_user_id, updated_by_user_id,
                source_system, source_table, source_id, source_payload
              )
              VALUES (
                $1, $2, $3, $4, $5, 'current', $6::date,
                $7, $8, $9, $10, $11, $11,
                'mrm-dashboard', 'drawing_revisions', $12,
                jsonb_build_object('previousDrawingId', $13::text)
              )
              RETURNING id
            `,
            [
              input.organizationId,
              current.item_id,
              current.source_quote_item_id,
              revision,
              drawingNumber,
              revisionDate,
              ...quantities,
              remarks,
              input.actorUserId ?? null,
              randomUUID(),
              input.drawingId,
            ]
          )
          await client.query(
            `UPDATE catalog.drawings
             SET status = 'superseded', updated_by_user_id = $1,
               updated_at = now(), row_version = row_version + 1
             WHERE id = $2`,
            [input.actorUserId ?? null, input.drawingId]
          )
          savedDrawingId = inserted.rows[0]!.id
          eventType = "drawing_history.revision_created"
        } else {
          await client.query(
            `
              UPDATE catalog.drawings
              SET drawing_number = $1, effective_at = $2::date,
                buffoli_laminated_quantity = $3,
                conventional_laminated_quantity = $4,
                cnc_laminated_quantity = $5, remarks = $6,
                updated_by_user_id = $7, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $8 AND organization_id = $9
            `,
            [
              drawingNumber,
              revisionDate,
              ...quantities,
              remarks,
              input.actorUserId ?? null,
              input.drawingId,
              input.organizationId,
            ]
          )
        }
        await writeAudit(client, {
          ...input,
          afterState,
          beforeState,
          eventType,
          metadata: afterState,
          targetId: savedDrawingId,
          targetTable: "drawings",
        })
        await client.query("COMMIT")
        return savedDrawingId
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async updateWebsiteProduct(input: WebsiteProductInput) {
      const category = input.category.trim()
      const subCategory = input.subCategory.trim()
      const size = input.size.trim()
      const grade = input.grade.trim()
      const material = input.material.trim()
      const temperature = input.temperature.trim()
      const applications = input.applications.trim()
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const current = await client.query<{
          category_code: string | null
          current_part_code: string | null
          material_construction: string | null
          subcategory_code: string | null
        }>(
          `
            SELECT profiles.part_code current_part_code,
              categories.code category_code,
              subcategories.combination_code subcategory_code,
              items.production_type material_construction
            FROM catalog.website_product_profiles profiles
            JOIN catalog.items items ON items.id = profiles.item_id
            LEFT JOIN catalog.item_categories categories
              ON categories.organization_id = profiles.organization_id
             AND lower(categories.name) = lower($1)
            LEFT JOIN catalog.item_subcategories subcategories
              ON subcategories.category_id = categories.id
             AND lower(subcategories.name) = lower($2)
            WHERE profiles.id = $3 AND profiles.organization_id = $4
            FOR UPDATE OF profiles
          `,
          [category, subCategory, input.profileId, input.organizationId]
        )
        const record = current.rows[0]
        if (!record) throw new Error("Website product row was not found.")
        let partCode = record.current_part_code?.trim() ?? ""
        if (record.category_code && record.subcategory_code) {
          const prefix = `${record.category_code}-${record.subcategory_code}`
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [`${input.organizationId}:${prefix}`]
          )
          const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          if (!new RegExp(`^${escapedPrefix}-\\d{3}$`).test(partCode)) {
            const sequence = await client.query<{ next_value: number }>(
              `
                SELECT COALESCE(MAX(
                  CASE WHEN part_code ~ ('^' || $2 || '-[0-9]{3}$')
                    THEN right(part_code, 3)::integer ELSE 0 END
                ), 0) + 1 next_value
                FROM catalog.website_product_profiles
                WHERE organization_id = $1 AND id <> $3
                  AND part_code LIKE $2 || '-%'
              `,
              [input.organizationId, prefix, input.profileId]
            )
            partCode = `${prefix}-${String(sequence.rows[0]!.next_value).padStart(3, "0")}`
          }
        }
        const threadSizes = [
          optional(input.threadSize1),
          optional(input.threadSize2),
          optional(input.threadSize3),
          optional(input.threadSize4),
        ]
        const threadStandard = deriveThreadStandard(threadSizes) || null
        const productDescription = [size, subCategory]
          .filter(Boolean)
          .join(" X ")
        const requiredWebsiteValues = [
          grade,
          category,
          subCategory,
          productDescription,
          partCode,
          size,
          material,
          record.material_construction,
          optional(input.finishPlating),
          optional(input.drawingCategory),
          optional(input.dimensions),
          threadStandard,
          optional(input.connections),
          optional(input.pressure),
          temperature,
          optional(input.description),
          applications,
          optional(input.certifications),
          optional(input.additionalNotes),
        ]
        const websiteStatus = requiredWebsiteValues.every(
          (value) => String(value ?? "").trim().length > 0
        )
          ? "Completed"
          : "In Progress"
        await client.query(
          `
            UPDATE catalog.website_product_profiles
            SET title = $1, published = $2, remark = $3, category = $4,
              sub_category = $5, product_description = $1, part_code = $6,
              size = $7, grade = $8, material = $9,
              material_construction = $10, finish_plating = $11,
              thread_standard = $12, sealant = $13, temperature = $14,
              pressure = $15, connections = $16, catalog_grade = $8,
              description = $17, summary = $17, applications = $18,
              certifications = $19, additional_notes = $20,
              dimensions = $21, website_category = $22,
              website_sub_category = $23, is_active = $2,
              entry_created_at = COALESCE($24::date, entry_created_at),
              drawing_category = $25, thread_size_1 = $26,
              thread_size_2 = $27, thread_size_3 = $28,
              thread_size_4 = $29, website_status = $30,
              updated_by_user_id = $31, updated_at = now(),
              row_version = row_version + 1,
              source_payload = COALESCE(source_payload, '{}'::jsonb) ||
                jsonb_build_object(
                  'websiteStatus', $30::text,
                  'isActive', $2::boolean
                )
            WHERE id = $32 AND organization_id = $33
          `,
          [
            productDescription,
            input.isActive,
            optional(input.remark),
            category,
            subCategory,
            partCode || null,
            size,
            grade,
            material,
            record.material_construction,
            optional(input.finishPlating),
            threadStandard,
            optional(input.sealant),
            temperature,
            optional(input.pressure),
            optional(input.connections),
            optional(input.description),
            applications,
            optional(input.certifications),
            optional(input.additionalNotes),
            optional(input.dimensions),
            optional(input.websiteCategory),
            optional(input.websiteSubCategory),
            optional(input.entryCreatedAt),
            optional(input.drawingCategory),
            ...threadSizes,
            websiteStatus,
            input.actorUserId ?? null,
            input.profileId,
            input.organizationId,
          ]
        )
        await syncWebsiteAssemblies(
          client,
          input.organizationId,
          input.actorUserId
        )
        await writeAudit(client, {
          ...input,
          eventType: "website_product.updated",
          metadata: { partCode, websiteStatus },
          targetId: input.profileId,
          targetTable: "website_product_profiles",
        })
        const result = await client.query<WebsiteDatabaseRow>(
          `${websiteSelect} WHERE profiles.id = $1
            AND profiles.organization_id = $2`,
          [input.profileId, input.organizationId]
        )
        await client.query("COMMIT")
        return websiteRow(result.rows[0]!)
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },
  }
}
