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

let customerId: string
let organizationCode: string
let organizationId: string
let salespersonAId: string
let salespersonBId: string
let technicalUserId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  organizationCode = `SALES-OWNER-${suffix}`
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name) VALUES ($1, $1) RETURNING id`,
    [organizationCode]
  )
  organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      ) VALUES ($1, $2, 'Ownership Customer', 'test', 'customers', $2)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`]
  )
  customerId = customer.rows[0]!.id
  const users = await pool.query<{ id: string; name: string }>(
    `
      INSERT INTO identity.users (name, email)
      VALUES
        ('Salesperson A', $1),
        ('Salesperson B', $2),
        ('Technical Reviewer', $3)
      RETURNING id, name
    `,
    [
      `sales-a-${suffix}@example.test`,
      `sales-b-${suffix}@example.test`,
      `technical-${suffix}@example.test`,
    ]
  )
  salespersonAId = users.rows.find(({ name }) => name === "Salesperson A")!.id
  salespersonBId = users.rows.find(({ name }) => name === "Salesperson B")!.id
  technicalUserId = users.rows.find(
    ({ name }) => name === "Technical Reviewer"
  )!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("originating salesperson ownership", () => {
  test("isolates Sales work while Technical Review remains shared", async () => {
    const createOwnedEnquiry = async (actorUserId: string, part: string) => {
      const enquiry = await repository.createEnquiry({
        actorUserId,
        commercialTerms: {
          conversionRate: 1,
          currency: "USD",
          incoterms: "FOB",
          packagingTerms: "Export",
          paymentTerms: "Net 30",
          shipmentMode: "Sea",
        },
        customerId,
        organizationId,
        receivedOn: "2026-08-22",
      })
      const line = await repository.addEnquiryItem({
        actorUserId,
        customerPartCode: part,
        description: `${part} description`,
        enquiryId: enquiry.id,
        organizationId,
        quantity: 1,
      })
      await repository.handOverToTechnicalReview(enquiry.id, actorUserId)
      return { enquiry, line }
    }

    const ownedByA = await createOwnedEnquiry(salespersonAId, "OWNER-A")
    const ownedByB = await createOwnedEnquiry(salespersonBId, "OWNER-B")
    const salespersonAScope = {
      originatingSalespersonUserId: salespersonAId,
    }
    const salespersonBScope = {
      originatingSalespersonUserId: salespersonBId,
    }

    await expect(
      repository.listEnquiriesBounded(organizationCode, 200, salespersonAScope)
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ id: ownedByA.enquiry.id })],
    })
    await expect(
      repository.getEnquiry(ownedByA.enquiry.id, salespersonBScope)
    ).rejects.toThrow("ENQ was not found")
    await expect(
      repository.listEnquirySpreadsheetBounded(
        organizationCode,
        200,
        salespersonAScope
      )
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ enquiryId: ownedByA.enquiry.id })],
    })
    await expect(
      repository.addEnquiryItem({
        actorUserId: salespersonBId,
        customerPartCode: "OWNER-B-BYPASS",
        description: "Must not be added",
        enquiryId: ownedByA.enquiry.id,
        organizationId,
        quantity: 1,
      })
    ).rejects.toThrow("ENQ was not found")

    const technicalQueue =
      await repository.listTechnicalReviewQueue(organizationCode)
    expect(technicalQueue.map(({ enquiryId }) => enquiryId)).toEqual(
      expect.arrayContaining([ownedByA.enquiry.id, ownedByB.enquiry.id])
    )

    await repository.updateTechnicalReview({
      actorUserId: technicalUserId,
      checklist: {},
      enquiryItemId: ownedByA.line.id,
      missingInformation: "Please confirm the drawing revision.",
      status: "Need Clarification",
    })

    const salespersonAClarifications =
      await repository.listSalesClarificationQueueBounded(
        organizationCode,
        200,
        salespersonAScope
      )
    expect(salespersonAClarifications).toMatchObject({
      rows: [
        expect.objectContaining({
          enquiryId: ownedByA.enquiry.id,
          enquiryItemId: ownedByA.line.id,
        }),
      ],
    })
    await expect(
      repository.listSalesClarificationQueueBounded(
        organizationCode,
        200,
        salespersonBScope
      )
    ).resolves.toMatchObject({ rows: [] })
    await expect(
      repository.completeSalesClarification({
        actorUserId: salespersonBId,
        clarificationTaskId:
          salespersonAClarifications.rows[0]!.clarificationTaskId,
        enquiryItemId: ownedByA.line.id,
        response: "Attempted by the wrong salesperson",
      })
    ).rejects.toThrow("Sales clarification task is required")
  })
})
