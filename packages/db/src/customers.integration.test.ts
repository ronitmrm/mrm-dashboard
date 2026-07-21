import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCustomerRepository } from "./customers"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCustomerRepository({ connectionString })
let actorUserId: string
let createdCustomerId: string
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'LM-02 Customer Test')
      RETURNING id
    `,
    [`LM02-CUSTOMERS-${suffix}`]
  )
  organizationId = organization.rows[0]!.id

  const actor = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (name, email)
      VALUES ('LM-02 Customer Actor', $1)
      RETURNING id
    `,
    [`lm02-customer-${suffix}@example.test`]
  )
  actorUserId = actor.rows[0]!.id

  await pool.query(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES
        ($1, '41', 'Existing Numeric Customer', 'test', 'customers', $2),
        ($1, 'LEGACY', 'Existing Named Customer', 'test', 'customers', $3)
    `,
    [organizationId, randomUUID(), randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO core.number_sequences (
        organization_id, key, current_value, source_system, source_table,
        source_id
      )
      VALUES ($1, 'CUSTOMER_UID', 5, 'test', 'counters', $2)
    `,
    [organizationId, randomUUID()]
  )
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("Pricing customer maintenance", () => {
  test("creates the next source-compatible customer UID with actor audit evidence", async () => {
    const customer = await repository.createManaged({
      actorUserId,
      companyName: "  Acme Brass  ",
      country: "",
      email: "",
      organizationId,
      phone: "",
      status: "",
    })
    createdCustomerId = customer.id

    expect(customer).toMatchObject({
      companyName: "Acme Brass",
      country: null,
      createdByUserId: actorUserId,
      customerUid: "42",
      email: null,
      organizationId,
      phone: null,
      sourceSystem: "mrm-dashboard",
      sourceTable: "customers",
      status: "Active",
      updatedByUserId: actorUserId,
    })

    const sequence = await pool.query<{ current_value: string }>(
      `
        SELECT current_value::text
        FROM core.number_sequences
        WHERE organization_id = $1 AND key = 'CUSTOMER_UID'
      `,
      [organizationId]
    )
    expect(sequence.rows[0]?.current_value).toBe("42")

    const audit = await pool.query<{
      actor_user_id: string | null
      event_type: string
      target_id: string
    }>(
      `
        SELECT actor_user_id, event_type, target_id
        FROM audit.events
        WHERE organization_id = $1
          AND event_type = 'customer.created'
      `,
      [organizationId]
    )
    expect(audit.rows).toEqual([
      {
        actor_user_id: actorUserId,
        event_type: "customer.created",
        target_id: customer.id,
      },
    ])
  })

  test("updates only source-editable customer fields with before and after audit evidence", async () => {
    await pool.query(
      `
        UPDATE sales.customers
        SET contact_name = 'Keep Contact', notes = 'Keep Notes'
        WHERE id = $1
      `,
      [createdCustomerId]
    )

    const customer = await repository.updateManaged({
      actorUserId,
      companyName: "  Acme Brass Updated  ",
      country: "  India  ",
      customerId: createdCustomerId,
      email: "  sales@acme.test  ",
      organizationId,
      phone: "  +91 555 0100  ",
      status: "  Inactive  ",
    })

    expect(customer).toMatchObject({
      companyName: "Acme Brass Updated",
      contactName: "Keep Contact",
      country: "India",
      customerUid: "42",
      email: "sales@acme.test",
      notes: "Keep Notes",
      phone: "+91 555 0100",
      rowVersion: 2,
      status: "Inactive",
      updatedByUserId: actorUserId,
    })

    const audit = await pool.query<{
      actor_user_id: string | null
      metadata: {
        after: Record<string, unknown>
        before: Record<string, unknown>
      }
    }>(
      `
        SELECT actor_user_id, metadata
        FROM audit.events
        WHERE organization_id = $1
          AND event_type = 'customer.updated'
          AND target_id = $2
      `,
      [organizationId, createdCustomerId]
    )
    expect(audit.rows).toEqual([
      {
        actor_user_id: actorUserId,
        metadata: {
          after: {
            companyName: "Acme Brass Updated",
            country: "India",
            email: "sales@acme.test",
            phone: "+91 555 0100",
            status: "Inactive",
          },
          before: {
            companyName: "Acme Brass",
            country: null,
            email: null,
            phone: null,
            status: "Active",
          },
        },
      },
    ])
  })
})
