import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createCommercialMasterRepository,
  type CommercialMasterSnapshot,
} from "./commercial-masters"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialMasterRepository({ connectionString })
let actorUserId: string
let organizationId: string
let roundTripOrganizationId: string

const fixture: CommercialMasterSnapshot = {
  applications: [{ name: "Heating", sortOrder: 2 }],
  categories: [{ code: "01", name: "Fittings" }],
  certifications: [{ name: "ROHS", sortOrder: 3 }],
  commercialTerms: [{ active: true, name: "FOB", termType: "incoterms" }],
  customers: [
    {
      companyName: "Fixture Customer",
      country: "India",
      customerUid: "CUST-900",
      defaultBuyerName: "Purchasing",
      defaultCurrency: "USD",
      defaultIncoterms: "FOB",
      defaultPackagingTerms: "Export box",
      defaultPaymentTerms: "Net 30",
      defaultShipmentMode: "Sea",
      email: "sales@example.test",
      phone: null,
      status: "Active",
    },
  ],
  machineTypes: [{ name: "Conventional" }],
  materialGrades: [{ name: "C3604" }],
  materialRates: [
    {
      active: true,
      alloyPremium: 12.5,
      extrusionCost: 8.25,
      grade: "C3604",
      rodType: "SOLID",
    },
  ],
  packagingOptions: [
    {
      active: true,
      costBasis: "Per 100 pcs",
      name: "Export box",
      packingCost: 4.5,
    },
  ],
  processes: [{ name: "Forging" }],
  quoteTerms: [
    {
      active: true,
      label: "Validity",
      sortOrder: 10,
      termKey: "validity",
      value: "Thirty days",
    },
  ],
  rodTypes: [{ name: "SOLID" }],
  shippingTerms: [{ active: true, name: "Air", shippingCost: 7.5 }],
  subcategories: [
    {
      category: "Fittings",
      combinationCode: "101",
      name: "Elbows",
    },
  ],
  websiteFields: [{ fieldType: "material", name: "Brass", sortOrder: 4 }],
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  const organizations = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES
        ($1, 'LM-02 Masters Test'),
        ($2, 'LM-02 Masters Round Trip')
      RETURNING id, code
    `,
    [`LM02-MASTERS-${suffix}`, `LM02-ROUNDTRIP-${suffix}`]
  )
  organizationId = organizations.rows[0]!.id
  roundTripOrganizationId = organizations.rows[1]!.id

  const actor = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (name, email)
      VALUES ('LM-02 Master Actor', $1)
      RETURNING id
    `,
    [`lm02-master-${suffix}@example.test`]
  )
  actorUserId = actor.rows[0]!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("Pricing commercial master maintenance", () => {
  test("bootstraps every source master with defaults, uniqueness, ordering, lookup, activation, and audit", async () => {
    const result = await repository.importSnapshot({
      actorUserId,
      organizationId,
      snapshot: fixture,
    })

    expect(result).toMatchObject({
      errors: [],
      ignored: 0,
    })
    expect(result.created).toBe(15)

    await repository.upsertNamed({
      actorUserId,
      kind: "materialGrade",
      name: " c3604 ",
      organizationId,
    })
    const snapshot = await repository.snapshot(organizationId)
    expect(snapshot).toEqual(fixture)

    await expect(
      repository.listEditableRows({
        kind: "commercial_shipping",
        organizationId,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "commercial_shipping",
        label: "Air",
      }),
    ])

    await expect(
      repository.listEditableRows({
        kind: "commercial_rod_type",
        organizationId,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "commercial_rod_type",
        label: "SOLID",
      }),
    ])

    await expect(
      repository.materialRateFor({
        grade: " c3604 ",
        organizationId,
        rodType: "solid",
      })
    ).resolves.toEqual({
      active: true,
      alloyPremium: 12.5,
      extrusionCost: 8.25,
      grade: "C3604",
      rodType: "SOLID",
    })

    await repository.setActive({
      active: false,
      actorUserId,
      id: (await repository.listEditable(organizationId)).shippingTerms[0]!.id,
      kind: "shippingTerm",
      organizationId,
    })
    expect(
      (await repository.snapshot(organizationId)).shippingTerms[0]
    ).toMatchObject({ active: false, name: "Air" })

    const audit = await pool.query<{
      actor_user_id: string | null
      event_type: string
    }>(
      `
        SELECT actor_user_id, event_type
        FROM audit.events
        WHERE organization_id = $1
          AND event_type LIKE 'commercial_master.%'
      `,
      [organizationId]
    )
    expect(audit.rows.length).toBeGreaterThanOrEqual(17)
    expect(audit.rows.every((row) => row.actor_user_id === actorUserId)).toBe(
      true
    )
  })

  test("imports atomically and round-trips a source fixture without canonical differences", async () => {
    await expect(
      repository.importSnapshot({
        actorUserId,
        organizationId: roundTripOrganizationId,
        snapshot: {
          ...fixture,
          subcategories: [
            ...fixture.subcategories,
            {
              category: "Missing category",
              combinationCode: null,
              name: "Must roll back",
            },
          ],
        },
      })
    ).rejects.toThrow("Sub Categories row 2")

    expect(await repository.snapshot(roundTripOrganizationId)).toEqual({
      applications: [],
      categories: [],
      certifications: [],
      commercialTerms: [],
      customers: [],
      machineTypes: [],
      materialGrades: [],
      materialRates: [],
      packagingOptions: [],
      processes: [],
      quoteTerms: [],
      rodTypes: [],
      shippingTerms: [],
      subcategories: [],
      websiteFields: [],
    })

    await repository.importSnapshot({
      actorUserId,
      organizationId: roundTripOrganizationId,
      snapshot: fixture,
    })
    expect(await repository.snapshot(roundTripOrganizationId)).toEqual(fixture)
  })
})
