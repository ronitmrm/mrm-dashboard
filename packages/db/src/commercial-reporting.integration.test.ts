import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCommercialReportingRepository } from "./commercial-reporting"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialReportingRepository({ connectionString })
let actorUserId: string
let customerId: string
let organizationId: string

async function createItem(input: {
  description: string
  productionType?: string
  uid: string
}) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        production_type, source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'P', $3, $4, 'test', 'items', $5)
      RETURNING id
    `,
    [
      organizationId,
      input.uid,
      input.description,
      input.productionType ?? "Machining",
      randomUUID(),
    ]
  )
  return result.rows[0]!.id
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'LM-08 Commercial Reporting')
      RETURNING id
    `,
    [`LM08-${suffix}`]
  )
  organizationId = organization.rows[0]!.id
  const actor = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (name, email)
      VALUES ('LM-08 Actor', $1)
      RETURNING id
    `,
    [`lm08-${suffix}@example.test`]
  )
  actorUserId = actor.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, status,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'LM-08 Customer', 'Active', 'test', 'customers', $3)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`, randomUUID()]
  )
  customerId = customer.rows[0]!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("commercial drawing, website, and analytics parity", () => {
  test("maintains drawing revisions and all archived laminated quantities", async () => {
    const itemId = await createItem({
      description: "Drawing fixture",
      uid: `M-${randomUUID()}`,
    })
    const inserted = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.drawings (
          organization_id, item_id, revision, drawing_number, status,
          effective_at, source_system, source_table, source_id
        )
        VALUES ($1, $2, '0', 'DWG-OLD', 'current', DATE '2026-07-01',
          'test', 'drawing_history', $3)
        RETURNING id
      `,
      [organizationId, itemId, randomUUID()]
    )

    await repository.updateDrawingHistory({
      actorUserId,
      buffoliLaminatedQuantity: 12,
      cncLaminatedQuantity: 34,
      conventionalLaminatedQuantity: 23,
      drawingId: inserted.rows[0]!.id,
      drawingNumber: "DWG-NEW",
      organizationId,
      remarks: "Released to production",
      revision: "1",
      revisionDate: "2026-07-22",
    })

    await expect(
      repository.listDrawingHistory({ organizationId })
    ).resolves.toEqual([
      expect.objectContaining({
        buffoliLaminatedQuantity: 12,
        cncLaminatedQuantity: 34,
        conventionalLaminatedQuantity: 23,
        drawingNumber: "DWG-NEW",
        itemDescription: "Drawing fixture",
        remarks: "Released to production",
        revision: "1",
        revisionDate: "2026-07-22",
      }),
    ])
    await expect(
      repository.updateDrawingHistory({
        actorUserId,
        buffoliLaminatedQuantity: -1,
        cncLaminatedQuantity: 0,
        conventionalLaminatedQuantity: 0,
        drawingId: inserted.rows[0]!.id,
        drawingNumber: "DWG-NEW",
        organizationId,
        revision: "2",
        revisionDate: "2026-07-22",
      })
    ).rejects.toThrow("Laminated quantities cannot be negative")
  })

  test("derives website code, product description, construction, thread standard, assemblies, and completion", async () => {
    const category = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.item_categories (
          organization_id, name, code, source_system, source_table, source_id
        )
        VALUES ($1, 'Fittings', '01', 'test', 'design_categories', $2)
        RETURNING id
      `,
      [organizationId, randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO catalog.item_subcategories (
          organization_id, category_id, name, combination_code,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, 'Elbows', '101', 'test', 'design_subcategories', $3)
      `,
      [organizationId, category.rows[0]!.id, randomUUID()]
    )
    const parentId = await createItem({
      description: "Parent fitting",
      productionType: "Forging",
      uid: `M-${randomUUID()}`,
    })
    const childId = await createItem({
      description: "Child fitting",
      uid: `M-${randomUUID()}`,
    })
    const profiles = await pool.query<{ id: string; item_id: string }>(
      `
        INSERT INTO catalog.website_product_profiles (
          organization_id, item_id, title, published, source_system,
          source_table, source_id, source_payload
        )
        VALUES
          ($1, $2, 'Parent fitting', false, 'test', 'website_product_entries', $4,
            '{"websiteStatus":"In Progress","isActive":true}'::jsonb),
          ($1, $3, 'Child fitting', false, 'test', 'website_product_entries', $5,
            '{"websiteStatus":"In Progress","isActive":false}'::jsonb)
        RETURNING id, item_id
      `,
      [organizationId, parentId, childId, randomUUID(), randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity,
          source_system, source_table, source_id, sequence
        )
        VALUES ($1, $2, $3, 1, 'test', 'bom_lines', $4, 1)
      `,
      [organizationId, parentId, childId, randomUUID()]
    )
    const childProfile = profiles.rows.find((row) => row.item_id === childId)!
    const parentProfile = profiles.rows.find((row) => row.item_id === parentId)!

    const completeFields = {
      additionalNotes: "Catalog approved",
      applications: "Heating",
      category: "Fittings",
      certifications: "ROHS",
      connections: "NPT",
      description: "A complete catalog description",
      dimensions: "10 x 20 mm",
      drawingCategory: "Production",
      finishPlating: "Nickel",
      grade: "C3604",
      material: "Brass",
      pressure: "10 bar",
      sealant: "PTFE",
      size: "1/2 in",
      subCategory: "Elbows",
      temperature: "120 C",
      threadSize1: "1/2 NPT",
    }
    await repository.updateWebsiteProduct({
      ...completeFields,
      actorUserId,
      isActive: false,
      organizationId,
      profileId: childProfile.id,
    })
    const parent = await repository.updateWebsiteProduct({
      ...completeFields,
      actorUserId,
      isActive: true,
      organizationId,
      profileId: parentProfile.id,
    })

    expect(parent).toMatchObject({
      assemblyCode1: "01-101-001",
      assemblyUid1: expect.any(String),
      finalAssembliesCode: "01-101-001",
      isActive: true,
      materialConstruction: "Forging",
      partCode: "01-101-002",
      productDescription: "1/2 in X Elbows",
      threadStandard: "ANSI/ASME B1.20.1",
      websiteStatus: "Completed",
    })
    const listedParent = (
      await repository.listWebsiteProducts({ organizationId })
    ).find((row) => row.profileId === parentProfile.id)
    expect(listedParent).toMatchObject({
      partCode: "01-101-002",
      websiteStatus: "Completed",
    })
  })

  test("exports complete drawing and website histories across batches", async () => {
    const drawingCanonical = await repository.listDrawingHistory({
      organizationId,
    })
    const drawingExport = await repository.listDrawingHistoryForExport(
      { organizationId },
      1
    )
    const websiteCanonical = await repository.listWebsiteProducts({
      organizationId,
    })
    const websiteExport = await repository.listWebsiteProductsForExport(
      { organizationId },
      1
    )

    expect(drawingExport).toEqual(drawingCanonical)
    expect(websiteExport).toEqual(websiteCanonical)
    expect(websiteExport.length).toBeGreaterThan(1)
  })

  test("reconciles source headline counts and five dashboard analytic datasets", async () => {
    const suffix = randomUUID()
    const itemId = await createItem({
      description: "Dashboard fixture",
      uid: `M-${suffix}`,
    })
    const enquiry = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiries (
          organization_id, enquiry_number, customer_id, received_on, status,
          technical_handover_status, source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, CURRENT_DATE - 3, 'Open', 'Draft',
          'test', 'enquiries', $4)
        RETURNING id
      `,
      [organizationId, `ENQ-${suffix}`, customerId, randomUUID()]
    )
    const enquiryItem = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, description, item_id,
          technical_review_status, source_system, source_table, source_id
        )
        VALUES ($1, $2, 1, 'Dashboard fixture', $3, 'Pending Review',
          'test', 'enquiry_items', $4)
        RETURNING id
      `,
      [organizationId, enquiry.rows[0]!.id, itemId, randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO sales.followups (
          organization_id, enquiry_id, due_on, status, note,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, CURRENT_DATE, 'Pending', 'Due now', 'test', 'followups', $3)
      `,
      [organizationId, enquiry.rows[0]!.id, randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO sales.quote_items (
          organization_id, quote_number, enquiry_item_id, customer_id,
          item_id, lineage_item_id, customer_part_code, quantity, unit_price,
          status, is_active, sent_at, source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, $4, $5, $5, 'DASH-001', 10, 5,
          'Sent', true, CURRENT_TIMESTAMP, 'test', 'quote_items', $6)
      `,
      [
        organizationId,
        `QT-${suffix}`,
        enquiryItem.rows[0]!.id,
        customerId,
        itemId,
        randomUUID(),
      ]
    )

    const dashboard = await repository.dashboard({ organizationId })
    expect(dashboard.stats).toMatchObject({
      customers: 1,
      enquiries: 1,
      monthlyQuoted: 1,
      ordered: 0,
      pendingFollowups: 1,
      quoted: 1,
    })
    expect(dashboard.monthlyQuotedItems).toHaveLength(6)
    expect(dashboard.monthlyQuotedItems.at(-1)?.count).toBe(1)
    expect(
      dashboard.workflowLoad.find((row) => row.label === "Sales Pending Work")
        ?.count
    ).toBe(2)
    expect(dashboard.quoteMix).toContainEqual({
      count: 1,
      label: "Quoted Items",
    })
    expect(dashboard.materialLeadTimes[0]).toMatchObject({ quotedItems: 1 })
    expect(dashboard.customerPareto).toEqual([
      { count: 1, cumulativePercent: 100, customer: "LM-08 Customer" },
    ])
  })
})
