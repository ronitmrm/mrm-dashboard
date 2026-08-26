import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createArtifactLedgerRepository } from "./artifact-ledger"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })

async function seedOrganization(label: string) {
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name) VALUES ($1, $2) RETURNING id`,
    [`LEDGER-${suffix}`, `${label} Organization`]
  )
  return organization.rows[0]!.id
}

async function seedArtifact(input: {
  byteSize: number
  fileName: string
  lifecycleState?: "current" | "deleted" | "superseded"
  mediaType: string
  organizationId: string
  origin: "generated" | "uploaded"
  physicalObjectId?: string
  purpose: string
  targetId?: string
  targetSchema: string
  targetTable: string
}) {
  const fingerprint = input.fileName.padEnd(64, "0").slice(0, 64)
  const physicalObjectId =
    input.physicalObjectId ??
    (
      await pool.query<{ id: string }>(
        `
          INSERT INTO core.file_objects (
            organization_id, sha256, byte_size, provider, provider_key,
            public_url, lifecycle_state
          ) VALUES ($1, $2, $3, 'uploadthing', $4, $5, $6)
          RETURNING id
        `,
        [
          input.organizationId,
          fingerprint,
          input.byteSize,
          `ledger-${randomUUID()}`,
          `https://files.example.test/${encodeURIComponent(input.fileName)}`,
          input.lifecycleState === "deleted" ? "deleted" : "available",
        ]
      )
    ).rows[0]!.id
  const file = await pool.query<{ id: string }>(
    `
      INSERT INTO core.files (
        organization_id, file_name, media_type, byte_size, sha256, storage_key,
        source_system, source_table, source_id, physical_object_id, origin,
        lifecycle_state, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'artifact-service', 'artifacts', $7, $8,
        $9, $10, '2026-08-20T08:00:00Z', '2026-08-20T09:00:00Z'
      ) RETURNING id
    `,
    [
      input.organizationId,
      input.fileName,
      input.mediaType,
      input.byteSize,
      fingerprint,
      `ledger-${randomUUID()}`,
      randomUUID(),
      physicalObjectId,
      input.origin,
      input.lifecycleState ?? "current",
    ]
  )
  const targetId = input.targetId ?? randomUUID()
  await pool.query(
    `
      INSERT INTO core.file_links (
        organization_id, file_id, target_schema, target_table, target_id,
        purpose, version, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
    `,
    [
      input.organizationId,
      file.rows[0]!.id,
      input.targetSchema,
      input.targetTable,
      targetId,
      input.purpose,
      input.lifecycleState !== "superseded",
    ]
  )
  return { fileId: file.rows[0]!.id, physicalObjectId, targetId }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await pool.end()
})

describe("Administration Artifact ledger", () => {
  test("keeps rows and unique-byte totals Organization-scoped while paginating usages", async () => {
    const organizationId = await seedOrganization("Primary ledger")
    const otherOrganizationId = await seedOrganization("Other ledger")
    const shared = await seedArtifact({
      byteSize: 14,
      fileName: "customer-drawing.pdf",
      mediaType: "application/pdf",
      organizationId,
      origin: "uploaded",
      purpose: "drawing",
      targetSchema: "sales",
      targetTable: "enquiry_items",
    })
    await pool.query(
      `
        INSERT INTO core.file_links (
          organization_id, file_id, target_schema, target_table, target_id,
          purpose, version, is_current
        ) VALUES ($1, $2, 'sales', 'design_tasks', $3, 'customer_marked', 1, true)
      `,
      [organizationId, shared.fileId, randomUUID()]
    )
    await seedArtifact({
      byteSize: 14,
      fileName: "older-drawing.png",
      lifecycleState: "superseded",
      mediaType: "image/png",
      organizationId,
      origin: "uploaded",
      physicalObjectId: shared.physicalObjectId,
      purpose: "drawing",
      targetSchema: "sales",
      targetTable: "enquiry_items",
    })
    await seedArtifact({
      byteSize: 80,
      fileName: "issued-pi.xlsx",
      lifecycleState: "deleted",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      organizationId,
      origin: "generated",
      purpose: "issued_pi_xlsx",
      targetSchema: "sales",
      targetTable: "proforma_invoices",
    })
    await seedArtifact({
      byteSize: 999,
      fileName: "other-organization.pdf",
      mediaType: "application/pdf",
      organizationId: otherOrganizationId,
      origin: "generated",
      purpose: "issued_quote_pdf",
      targetSchema: "sales",
      targetTable: "quote_items",
    })
    const repository = createArtifactLedgerRepository({ connectionString })

    try {
      const firstPage = await repository.list({
        organizationId,
        page: 1,
        pageSize: 2,
      })

      expect(firstPage).toMatchObject({
        page: 1,
        pageSize: 2,
        totalArtifacts: 3,
        totalPages: 2,
        totals: {
          allowanceBytes: 2 * 1024 * 1024 * 1024,
          livePhysicalObjects: 1,
          logicalArtifacts: 3,
          uniqueLiveBytes: 14,
        },
      })
      expect(firstPage.rows).toHaveLength(2)
      expect(firstPage.rows.map(({ fileName }) => fileName)).not.toContain(
        "other-organization.pdf"
      )
      const drawing = firstPage.rows.find(
        ({ fileName }) => fileName === "customer-drawing.pdf"
      )
      expect(drawing).toMatchObject({
        modules: ["commercial"],
        physicalReferenceCount: 2,
        previewKind: "pdf",
        purposes: ["customer_marked", "drawing"],
      })
      expect(drawing?.usages).toHaveLength(2)
    } finally {
      await repository.close()
    }
  })

  test("searches business usages and combines ledger filters server-side", async () => {
    const organizationId = await seedOrganization("Filtered ledger")
    const suffix = randomUUID()
    const customer = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.customers (
          organization_id, customer_uid, company_name,
          source_system, source_table, source_id
        ) VALUES ($1, $2, 'Ledger Search Customer', 'artifact-ledger-test', 'customers', $3)
        RETURNING id
      `,
      [organizationId, `LEDGER-${suffix}`, suffix]
    )
    const enquiry = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiries (
          organization_id, enquiry_number, customer_id, received_on,
          source_system, source_table, source_id
        ) VALUES ($1, 'ENQ-LEDGER-42', $2, '2026-08-20', 'artifact-ledger-test', 'enquiries', $3)
        RETURNING id
      `,
      [organizationId, customer.rows[0]!.id, suffix]
    )
    const item = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, description, quantity,
          source_system, source_table, source_id
        ) VALUES ($1, $2, 1, 'Ledger search line', 1, 'artifact-ledger-test', 'enquiry_items', $3)
        RETURNING id
      `,
      [organizationId, enquiry.rows[0]!.id, suffix]
    )
    await seedArtifact({
      byteSize: 20,
      fileName: "customer-drawing.png",
      mediaType: "image/png",
      organizationId,
      origin: "uploaded",
      purpose: "drawing",
      targetId: item.rows[0]!.id,
      targetSchema: "sales",
      targetTable: "enquiry_items",
    })
    await seedArtifact({
      byteSize: 30,
      fileName: "store-order.pdf",
      mediaType: "application/pdf",
      organizationId,
      origin: "generated",
      purpose: "issued_store_purchase_order_pdf",
      targetSchema: "store",
      targetTable: "purchase_orders",
    })
    const repository = createArtifactLedgerRepository({ connectionString })

    try {
      await expect(
        repository.list({
          dateFrom: "2026-08-20",
          dateTo: "2026-08-20",
          mediaType: "image/png",
          module: "commercial",
          organizationId,
          origin: "uploaded",
          page: 1,
          pageSize: 25,
          purpose: "drawing",
          search: "ENQ-LEDGER-42",
          state: "current",
        })
      ).resolves.toMatchObject({
        totalArtifacts: 1,
        rows: [
          {
            fileName: "customer-drawing.png",
            modules: ["commercial"],
            previewKind: "image",
            usages: [{ businessRecord: "ENQ-LEDGER-42 / line 1" }],
          },
        ],
      })
    } finally {
      await repository.close()
    }
  })

  test("keeps a provider-deletion failure visible without hiding its still-live public URL", async () => {
    const organizationId = await seedOrganization("Failed deletion ledger")
    const artifact = await seedArtifact({
      byteSize: 24,
      fileName: "retry-delete.pdf",
      mediaType: "application/pdf",
      organizationId,
      origin: "uploaded",
      purpose: "drawing",
      targetSchema: "sales",
      targetTable: "enquiry_items",
    })
    await pool.query(
      `
        UPDATE core.file_objects
        SET lifecycle_state = 'deletion_failed', deletion_error = 'provider timeout'
        WHERE id = $1
      `,
      [artifact.physicalObjectId]
    )
    const repository = createArtifactLedgerRepository({ connectionString })

    try {
      await expect(
        repository.list({ organizationId, page: 1, pageSize: 25 })
      ).resolves.toMatchObject({
        rows: [
          {
            fileName: "retry-delete.pdf",
            providerState: "deletion_failed",
            publicUrl: "https://files.example.test/retry-delete.pdf",
          },
        ],
        totals: {
          livePhysicalObjects: 1,
          uniqueLiveBytes: 24,
        },
      })
    } finally {
      await repository.close()
    }
  })

  test("registers separate Artifact read and delete capabilities for administrators", async () => {
    const capability = await pool.query<{
      administrator: boolean
      module: string
    }>(
      `
        SELECT permissions.module,
          EXISTS (
            SELECT 1
            FROM identity.role_permissions
            JOIN identity.roles ON roles.id = role_permissions.role_id
            WHERE role_permissions.permission_id = permissions.id
              AND roles.key = 'administrator'
          ) AS administrator
        FROM identity.permissions AS permissions
        WHERE permissions.key = ANY($1::text[])
      `,
      [["artifacts.read", "artifacts.delete"]]
    )

    expect(capability.rows).toEqual([
      { administrator: true, module: "artifacts" },
      { administrator: true, module: "artifacts" },
    ])
  })
})
