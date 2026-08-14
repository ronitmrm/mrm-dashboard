import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialWorkflowRepository({ connectionString })

let emptyOrganizationCode: string
let exactOrganizationCode: string
let overflowOrganizationCode: string

async function createOrganization(code: string) {
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $1)
      RETURNING id
    `,
    [code]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $2, 'test', 'commercial_design_bounds', $3)
      RETURNING id
    `,
    [organizationId, `C-${code}`, randomUUID()]
  )
  return { customerId: customer.rows[0]!.id, organizationId }
}

async function seedDesignQueue(input: {
  count: number
  customerId: string
  organizationId: string
  prefix: string
}) {
  const source = randomUUID()
  await pool.query(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on, status,
        source_system, source_table, source_id, created_at
      )
      SELECT $1, $4 || '-' || lpad(value::text, 4, '0'), $2,
        DATE '2026-01-01', 'Open', 'test', 'commercial_design_bounds',
        $3 || ':enquiry:' || value::text,
        TIMESTAMPTZ '2026-01-01 00:00:00+00'
      FROM generate_series(1, $5) value
    `,
    [input.organizationId, input.customerId, source, input.prefix, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, technical_review_status, source_system,
        source_table, source_id
      )
      SELECT enquiry.organization_id, enquiry.id, 1,
        'PART-' || enquiry.enquiry_number,
        'Design line ' || enquiry.enquiry_number, 1, 'Feasible', 'test',
        'commercial_design_bounds', $1 || ':item:' || value::text
      FROM generate_series(1, $3) value
      JOIN sales.enquiries enquiry
        ON enquiry.organization_id = $2
        AND enquiry.source_id = $1 || ':enquiry:' || value::text
    `,
    [source, input.organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        portfolio_match_status, source_system, source_table, source_id
      )
      SELECT item.organization_id, item.id, 'Pending',
        CASE value % 4
          WHEN 1 THEN 'Changes Required'
          WHEN 2 THEN 'Need Clarification'
          WHEN 3 THEN 'Pending Design'
          ELSE 'Design Complete'
        END,
        'New Design Required', 'test', 'commercial_design_bounds',
        $1 || ':design:' || value::text
      FROM generate_series(1, $3) value
      JOIN sales.enquiry_items item
        ON item.organization_id = $2
        AND item.source_id = $1 || ':item:' || value::text
    `,
    [source, input.organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.design_bom_lines (
        organization_id, design_task_id, component_code, quantity,
        sequence, line_number, component_source, component_item_type,
        package_part, design_notes, source_system, source_table, source_id
      )
      SELECT design.organization_id, design.id,
        'COMP-' || value::text || '-' || line::text, line, line,
        line, 'New', 'List', 'Part ' || line::text,
        'Complete child ' || line::text, 'test',
        'commercial_design_bounds',
        $1 || ':bom:' || value::text || ':' || line::text
      FROM generate_series(1, $3) value
      CROSS JOIN generate_series(1, 2) line
      JOIN sales.design_tasks design
        ON design.organization_id = $2
        AND design.source_id = $1 || ':design:' || value::text
    `,
    [source, input.organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO core.files (
        organization_id, file_name, media_type, byte_size, storage_key,
        source_system, source_table, source_id, source_payload
      )
      SELECT design.organization_id,
        'design-' || value::text || '-' || attachment::text || '.pdf',
        'application/pdf', attachment * 100,
        'design/' || value::text || '/' || attachment::text || '.pdf',
        'test', 'commercial_design_bounds',
        $1 || ':file:' || value::text || ':' || attachment::text,
        jsonb_build_object('designTaskId', design.id)
      FROM generate_series(1, $3) value
      CROSS JOIN generate_series(1, 2) attachment
      JOIN sales.design_tasks design
        ON design.organization_id = $2
        AND design.source_id = $1 || ':design:' || value::text
    `,
    [source, input.organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO core.file_links (
        organization_id, file_id, target_schema, target_table, target_id,
        purpose
      )
      SELECT file.organization_id, file.id, 'sales', 'design_tasks',
        (file.source_payload ->> 'designTaskId')::uuid,
        'internal_drawing'
      FROM core.files file
      WHERE file.organization_id = $1
        AND file.source_table = 'commercial_design_bounds'
        AND file.source_id LIKE $2 || ':file:%'
    `,
    [input.organizationId, source]
  )
  await pool.query(
    `
      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, source_system, source_table, source_id
      )
      SELECT item.organization_id, item.enquiry_id, item.id,
        'Latest bounded Design clarification', 'Open', 'Technical', 'Design',
        'test', 'commercial_design_bounds', $1 || ':clarification'
      FROM sales.enquiry_items item
      WHERE item.organization_id = $2
        AND item.source_id = $1 || ':item:1'
    `,
    [source, input.organizationId]
  )
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  emptyOrganizationCode = `DES-EMPTY-${suffix}`
  exactOrganizationCode = `DES-EXACT-${suffix}`
  overflowOrganizationCode = `DES-OVER-${suffix}`

  await createOrganization(emptyOrganizationCode)
  const exact = await createOrganization(exactOrganizationCode)
  const overflow = await createOrganization(overflowOrganizationCode)
  await seedDesignQueue({
    count: 200,
    customerId: exact.customerId,
    organizationId: exact.organizationId,
    prefix: "EXACT",
  })
  await seedDesignQueue({
    count: 201,
    customerId: overflow.customerId,
    organizationId: overflow.organizationId,
    prefix: "OVER",
  })

  await pool.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      SELECT $1,
        CASE WHEN value = 1 THEN 'NEEDLE'
          ELSE 'NEEDLE-' || lpad(value::text, 3, '0') END,
        'INTERNAL', 'P', 'Needle portfolio product ' || value::text,
        'test', 'commercial_design_bounds', $2 || ':product:' || value::text
      FROM generate_series(1, 51) value
    `,
    [exact.organizationId, randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      ) VALUES
        ($1, 'NEEDLE-ARCHIVED', 'INTERNAL', 'X', 'Needle excluded archive',
          'test', 'commercial_design_bounds', $2),
        ($1, 'NEEDLE-CUSTOMER', 'CUSTOMER', 'P', 'Needle excluded customer',
          'test', 'commercial_design_bounds', $3)
    `,
    [exact.organizationId, randomUUID(), randomUUID()]
  )
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("bounded Design repositories", () => {
  test("reports zero, exact-cap, and cap-plus-one coverage in stable business order", async () => {
    await expect(
      repository.listDesignQueueBounded(emptyOrganizationCode)
    ).resolves.toEqual({
      coverage: { limit: 200, returned: 0, truncated: false },
      rows: [],
    })

    const exact = await repository.listDesignQueueBounded(exactOrganizationCode)
    expect(exact.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: false,
    })

    const overflow = await repository.listDesignQueueBounded(
      overflowOrganizationCode
    )
    expect(overflow.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: true,
    })
    const expected = await pool.query<{ id: string }>(
      `
        SELECT item.id
        FROM sales.enquiry_items item
        JOIN sales.enquiries enquiry ON enquiry.id = item.enquiry_id
        JOIN sales.design_tasks design ON design.enquiry_item_id = item.id
        JOIN core.organizations organization
          ON organization.id = item.organization_id
        WHERE organization.code = $1
        ORDER BY CASE COALESCE(design.design_status, 'Pending Design')
            WHEN 'Changes Required' THEN 0
            WHEN 'Need Clarification' THEN 1
            WHEN 'Pending Design' THEN 2
            ELSE 3
          END,
          enquiry.created_at, item.line_number, item.id
        LIMIT 200
      `,
      [overflowOrganizationCode]
    )
    expect(overflow.rows.map((row) => row.enquiryItemId)).toEqual(
      expected.rows.map((row) => row.id)
    )
  })

  test("batches complete BOM, clarification, and attachment relations", async () => {
    const trackedPool = new Pool({ connectionString })
    const originalQuery = trackedPool.query.bind(trackedPool)
    let statementCount = 0
    trackedPool.query = ((...args: Parameters<typeof trackedPool.query>) => {
      statementCount += 1
      return originalQuery(...args)
    }) as typeof trackedPool.query
    const trackedRepository = createCommercialWorkflowRepository({
      pool: trackedPool,
    })

    try {
      const result = await trackedRepository.listDesignQueueBounded(
        overflowOrganizationCode
      )
      expect(statementCount).toBeLessThanOrEqual(5)
      expect(result.rows).toHaveLength(200)
      expect(result.rows.every((row) => row.bomLines.length === 2)).toBe(true)
      expect(result.rows.every((row) => row.attachments.length === 2)).toBe(
        true
      )
      expect(
        result.rows.some(
          (row) =>
            row.latestClarificationMessage ===
            "Latest bounded Design clarification"
        )
      ).toBe(true)
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
  })

  test("preserves the legacy Design workflow fingerprint", async () => {
    const legacy = await repository.listDesignQueue(exactOrganizationCode)
    const bounded = await repository.listDesignQueueBounded(
      exactOrganizationCode
    )
    const byItemId = <Row extends { enquiryItemId: string }>(rows: Row[]) =>
      [...rows].sort((left, right) =>
        left.enquiryItemId.localeCompare(right.enquiryItemId)
      )
    const withoutAttachments = bounded.rows.map((row) => {
      const { attachments, ...legacyRow } = row
      void attachments
      return legacyRow
    })

    expect(byItemId(withoutAttachments)).toEqual(byItemId(legacy))
  })

  test("searches only active internal portfolio products before the cap", async () => {
    const result = await repository.searchDesignPortfolioProducts(
      exactOrganizationCode,
      "needle"
    )

    expect(result.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: true,
    })
    expect(result.rows[0]?.uid).toBe("NEEDLE")
    expect(result.rows.map((row) => row.uid)).not.toContain("NEEDLE-ARCHIVED")
    expect(result.rows.map((row) => row.uid)).not.toContain("NEEDLE-CUSTOMER")
  })
})
