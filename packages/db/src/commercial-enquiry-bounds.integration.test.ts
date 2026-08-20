import { createHash, randomUUID } from "node:crypto"

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
let exportOrganizationCode: string
let lineExportEnquiryId: string
let statusOrganizationCode: string

async function createOrganization(code: string, name: string) {
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [code, name]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $3, 'test', 'commercial_enquiry_bounds', $4)
      RETURNING id
    `,
    [organizationId, `C-${code}`, `${name} customer`, randomUUID()]
  )
  return { customerId: customer.rows[0]!.id, organizationId }
}

async function seedEnquiries(input: {
  count: number
  customerId: string
  organizationId: string
  prefix: string
}) {
  await pool.query(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on, status,
        source_system, source_table, source_id, created_at,
        technical_handover_status, source, priority
      )
      SELECT $1, $4 || '-' || lpad(value::text, 4, '0'), $2,
        DATE '2026-01-01' + (value - 1), 'Open', 'test',
        'commercial_enquiry_bounds', $3 || ':enquiry:' || value::text,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        'Handed Over', 'Email', 'Normal'
      FROM generate_series(1, $5) value
    `,
    [
      input.organizationId,
      input.customerId,
      randomUUID(),
      input.prefix,
      input.count,
    ]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, source_system, source_table, source_id,
        technical_review_status
      )
      SELECT enquiry.organization_id, enquiry.id, 1,
        'PART-' || enquiry.enquiry_number,
        'Bounded line ' || enquiry.enquiry_number, 1, 'test',
        'commercial_enquiry_bounds', $1 || ':item:' || enquiry.id::text,
        'Pending Review'
      FROM sales.enquiries enquiry
      WHERE enquiry.organization_id = $2
        AND enquiry.source_table = 'commercial_enquiry_bounds'
    `,
    [randomUUID(), input.organizationId]
  )
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  emptyOrganizationCode = `ENQ-EMPTY-${suffix}`
  exactOrganizationCode = `ENQ-EXACT-${suffix}`
  exportOrganizationCode = `ENQ-EXPORT-${suffix}`
  statusOrganizationCode = `ENQ-STATUS-${suffix}`

  await createOrganization(emptyOrganizationCode, "Empty enquiries")
  const exact = await createOrganization(
    exactOrganizationCode,
    "Exact enquiries"
  )
  const overflow = await createOrganization(
    exportOrganizationCode,
    "Export enquiries"
  )
  const lineExport = await createOrganization(
    `ENQ-LINES-${suffix}`,
    "Line export enquiry"
  )
  const statuses = await createOrganization(
    statusOrganizationCode,
    "Excel view statuses"
  )

  await seedEnquiries({
    count: 200,
    customerId: exact.customerId,
    organizationId: exact.organizationId,
    prefix: "EXACT",
  })
  await seedEnquiries({
    count: 501,
    customerId: overflow.customerId,
    organizationId: overflow.organizationId,
    prefix: "EXPORT",
  })
  await seedEnquiries({
    count: 10,
    customerId: statuses.customerId,
    organizationId: statuses.organizationId,
    prefix: "STATUS",
  })

  await pool.query(
    `
      UPDATE sales.enquiries
      SET technical_handover_status = 'Draft'
      WHERE organization_id = $1 AND enquiry_number = 'STATUS-0001';

      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, source_system, source_table, source_id
      )
      SELECT enquiry.organization_id, enquiry.id, item.id,
        'Sales must confirm the requirement.', 'Open', 'Technical Review',
        'Sales', 'test', 'commercial_enquiry_bounds', $2
      FROM sales.enquiries enquiry
      JOIN sales.enquiry_items item ON item.enquiry_id = enquiry.id
      WHERE enquiry.organization_id = $1
        AND enquiry.enquiry_number = 'STATUS-0002';

      INSERT INTO catalog.items (
        organization_id, uid, lifecycle_status, description,
        source_system, source_table, source_id
      )
      SELECT $1, 'STATUS-P-' || value::text,
        CASE WHEN value = 3 THEN 'P' ELSE 'Q' END,
        'Excel status product ' || value::text,
        'test', 'commercial_enquiry_bounds', $2 || ':product:' || value::text
      FROM generate_series(3, 6) value;

      INSERT INTO sales.quote_items (
        organization_id, quote_number, enquiry_id, enquiry_item_id,
        customer_id, item_id, lineage_item_id, customer_part_code,
        quantity, unit_price, status, is_active, sent_at,
        source_system, source_table, source_id
      )
      SELECT enquiry.organization_id, 'STATUS-Q-' || value::text,
        enquiry.id, enquiry_item.id, enquiry.customer_id, product.id,
        product.id, enquiry_item.customer_part_code, 1, 1,
        CASE value
          WHEN 4 THEN 'Superseded'
          WHEN 5 THEN 'Sent'
          ELSE 'Draft'
        END,
        false,
        CASE WHEN value = 5 THEN TIMESTAMPTZ '2026-01-05 10:00:00+00' END,
        'test', 'commercial_enquiry_bounds', $2 || ':quote:' || value::text
      FROM generate_series(3, 6) value
      JOIN sales.enquiries enquiry
        ON enquiry.organization_id = $1
        AND enquiry.enquiry_number = 'STATUS-' || lpad(value::text, 4, '0')
      JOIN sales.enquiry_items enquiry_item
        ON enquiry_item.enquiry_id = enquiry.id
      JOIN catalog.items product
        ON product.organization_id = $1
        AND product.uid = 'STATUS-P-' || value::text;

      UPDATE sales.enquiry_items
      SET technical_review_status = 'Not Feasible'
      WHERE enquiry_id = (
        SELECT id FROM sales.enquiries
        WHERE organization_id = $1 AND enquiry_number = 'STATUS-0007'
      );

      UPDATE sales.enquiry_items item
      SET technical_review_status = 'Feasible'
      FROM sales.enquiries enquiry
      WHERE enquiry.id = item.enquiry_id
        AND enquiry.organization_id = $1
        AND enquiry.enquiry_number IN ('STATUS-0008', 'STATUS-0009');

      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        next_stage_status, source_system, source_table, source_id
      )
      SELECT enquiry.organization_id, enquiry_item.id, 'Pending',
        CASE WHEN value = 9 THEN 'Design In Progress' ELSE 'Pending Design' END,
        CASE WHEN value = 8 THEN 'Product Costing' ELSE 'Not Started' END,
        'test', 'commercial_enquiry_bounds', $2 || ':design:' || value::text
      FROM generate_series(8, 9) value
      JOIN sales.enquiries enquiry
        ON enquiry.organization_id = $1
        AND enquiry.enquiry_number = 'STATUS-' || lpad(value::text, 4, '0')
      JOIN sales.enquiry_items enquiry_item
        ON enquiry_item.enquiry_id = enquiry.id;
    `,
    [statuses.organizationId, randomUUID()]
  )

  await pool.query(
    `
      INSERT INTO sales.followups (
        organization_id, enquiry_id, due_on, note, source_system,
        source_table, source_id
      )
      SELECT organization_id, id, DATE '2026-01-01', 'Newest follow-up',
        'test', 'commercial_enquiry_bounds', $1
      FROM sales.enquiries
      WHERE organization_id = $2 AND enquiry_number = 'EXPORT-0501'
    `,
    [randomUUID(), overflow.organizationId]
  )

  const lineHeader = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on, status,
        source_system, source_table, source_id, source, priority
      )
      VALUES ($1, 'LINES-0001', $2, DATE '2026-01-01', 'Open', 'test',
        'commercial_enquiry_bounds', $3, 'Email', 'Normal')
      RETURNING id
    `,
    [lineExport.organizationId, lineExport.customerId, randomUUID()]
  )
  lineExportEnquiryId = lineHeader.rows[0]!.id
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, source_system, source_table, source_id
      )
      SELECT $1, $2, value, 'LINE-' || lpad(value::text, 4, '0'),
        'Export line ' || value::text, value, 'test',
        'commercial_enquiry_bounds', $3 || ':line:' || value::text
      FROM generate_series(1, 501) value
    `,
    [lineExport.organizationId, lineExportEnquiryId, randomUUID()]
  )
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("bounded enquiry repositories", () => {
  test("reports zero, exact-cap, and cap-plus-one enquiry coverage", async () => {
    await expect(
      repository.listEnquiriesBounded(emptyOrganizationCode)
    ).resolves.toEqual({
      coverage: { limit: 200, returned: 0, truncated: false },
      rows: [],
    })

    const exact = await repository.listEnquiriesBounded(exactOrganizationCode)
    expect(exact.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: false,
    })

    const overflow = await repository.listEnquiriesBounded(
      exportOrganizationCode
    )
    expect(overflow.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: true,
    })
    expect(overflow.rows[0]).toMatchObject({
      enquiryNumber: "EXPORT-0501",
      itemCount: 1,
      nextFollowupDue: "2026-01-01",
    })
    expect(overflow.rows.at(-1)?.enquiryNumber).toBe("EXPORT-0302")
    expect(Buffer.byteLength(JSON.stringify(overflow))).toBeLessThan(
      1024 * 1024
    )
  })

  test("batches all enquiry relations within six statements", async () => {
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
      const result = await trackedRepository.listEnquiriesBounded(
        exportOrganizationCode
      )
      expect(result.rows).toHaveLength(200)
      expect(statementCount).toBeLessThanOrEqual(6)
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
  })

  test("reports exact technical-review coverage in business order", async () => {
    const exact = await repository.listTechnicalReviewQueueBounded(
      exactOrganizationCode
    )
    expect(exact.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: false,
    })

    const overflow = await repository.listTechnicalReviewQueueBounded(
      exportOrganizationCode
    )
    expect(overflow.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: true,
    })
    expect(overflow.rows[0]?.enquiryNumber).toBe("EXPORT-0501")
    expect(overflow.rows.at(-1)?.enquiryNumber).toBe("EXPORT-0302")
  })

  test("bounds the enquiry Excel view by line in stable business order", async () => {
    const exact = await repository.listEnquirySpreadsheetBounded(
      exactOrganizationCode
    )
    expect(exact.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: false,
    })
    expect(exact.rows[0]).toMatchObject({
      currentStatus: "Technical Review",
      enquiryNumber: "EXACT-0200",
      lineNumber: 1,
      quotePdfStatus: "Not Sent",
    })

    const overflow = await repository.listEnquirySpreadsheetBounded(
      exportOrganizationCode
    )
    expect(overflow.coverage).toEqual({
      limit: 200,
      returned: 200,
      truncated: true,
    })
    expect(overflow.rows[0]?.enquiryNumber).toBe("EXPORT-0501")
    expect(overflow.rows.at(-1)?.enquiryNumber).toBe("EXPORT-0302")
    expect(Buffer.byteLength(JSON.stringify(overflow))).toBeLessThan(
      1024 * 1024
    )
  })

  test("preserves the Pricing workflow-status precedence in Excel View", async () => {
    const result = await repository.listEnquirySpreadsheetBounded(
      statusOrganizationCode
    )
    const statusByEnquiry = Object.fromEntries(
      result.rows.map((row) => [row.enquiryNumber, row.currentStatus])
    )

    expect(statusByEnquiry).toMatchObject({
      "STATUS-0001": "With Sales",
      "STATUS-0002": "With Sales",
      "STATUS-0003": "Ordered / P",
      "STATUS-0004": "Revision Given",
      "STATUS-0005": "Quote Sent",
      "STATUS-0006": "Ready To Send",
      "STATUS-0007": "Cannot Quote",
      "STATUS-0008": "Product Costing",
      "STATUS-0009": "Design",
      "STATUS-0010": "Technical Review",
    })
    expect(
      result.rows.find((row) => row.enquiryNumber === "STATUS-0003")
    ).toMatchObject({
      designPartNumber: "STATUS-P-3",
      quotePdfStatus: "Order Received",
    })
    expect(
      result.rows.find((row) => row.enquiryNumber === "STATUS-0005")
    ).toMatchObject({ quotePdfStatus: "PDF Sent" })
  })

  test("loads a focused technical review beyond the bounded queue", async () => {
    const oldest = await pool.query<{ id: string }>(
      `
        SELECT item.id
        FROM sales.enquiry_items item
        JOIN sales.enquiries enquiry ON enquiry.id = item.enquiry_id
        JOIN core.organizations organization
          ON organization.id = enquiry.organization_id
        WHERE organization.code = $1
        ORDER BY enquiry.created_at, item.line_number, item.id
        LIMIT 1
      `,
      [exportOrganizationCode]
    )
    const enquiryItemId = oldest.rows[0]!.id

    await expect(
      repository.getTechnicalReviewItem(exportOrganizationCode, enquiryItemId)
    ).resolves.toMatchObject({
      enquiryItemId,
      enquiryNumber: "EXPORT-0001",
      technicalReviewStatus: "Pending Review",
    })
    await expect(
      repository.getTechnicalReviewItem(emptyOrganizationCode, enquiryItemId)
    ).resolves.toBeNull()
  })

  test("summarizes the complete technical-review queue beyond the row cap", async () => {
    await expect(
      repository.getTechnicalReviewQueueSummary(exactOrganizationCode)
    ).resolves.toEqual({
      needClarification: 0,
      openReviewTasks: 200,
      pendingReview: 200,
    })
    await expect(
      repository.getTechnicalReviewQueueSummary(exportOrganizationCode)
    ).resolves.toEqual({
      needClarification: 0,
      openReviewTasks: 501,
      pendingReview: 501,
    })
  })
})

describe("exhaustive enquiry exports", () => {
  test("reads the complete register in stable 500-row keyset batches", async () => {
    const first = await repository.listEnquiriesForExport(
      exportOrganizationCode
    )
    const second = await repository.listEnquiriesForExport(
      exportOrganizationCode
    )

    expect(first).toHaveLength(501)
    expect(first[0]?.enquiryNumber).toBe("EXPORT-0501")
    expect(first.at(-1)?.enquiryNumber).toBe("EXPORT-0001")
    expect(second).toEqual(first)
    expect(
      createHash("sha256")
        .update(first.map((row) => row.enquiryNumber).join("\n"))
        .digest("hex")
    ).toBe("9d1979b0ebac928e9c56e616fb793235035ffd646612d10564fccbe8e48e1bd9")
  })

  test("reads every selected-enquiry line across keyset batches", async () => {
    const result =
      await repository.getEnquiryLinesForExport(lineExportEnquiryId)

    expect(result.enquiry.enquiryNumber).toBe("LINES-0001")
    expect(result.items).toHaveLength(501)
    expect(result.items[0]?.lineNumber).toBe(1)
    expect(result.items.at(-1)?.lineNumber).toBe(501)
    expect(
      createHash("sha256")
        .update(result.items.map((row) => row.customerPartCode).join("\n"))
        .digest("hex")
    ).toBe("5231db93dd1191eb4a055375a352107cd967a7ec033304adde1eb9473a87fee4")
  })
})
