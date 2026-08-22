import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })

class ControllableArtifactProvider implements ArtifactStorageProvider {
  readonly deleted: string[] = []
  readonly uploads: Array<{
    bytes: Buffer
    customId: string
    mediaType: string
    name: string
  }> = []

  async delete({ key }: { key: string }) {
    this.deleted.push(key)
  }

  async upload(input: {
    bytes: Buffer
    customId: string
    mediaType: string
    name: string
  }) {
    this.uploads.push(input)
    const key = `${randomUUID()}-${this.uploads.length}`
    return { key, url: `https://files.example.test/${key}` }
  }
}

async function createCommercialTarget(label: string) {
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name) VALUES ($1, $2) RETURNING id`,
    [`ART-${suffix}`, `${label} Organization`]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, 'artifact-test', 'customers', $4)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`, `${label} Customer`, suffix]
  )
  const enquiry = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, '2026-08-22', 'artifact-test', 'enquiries', $4)
      RETURNING id
    `,
    [organizationId, `E-${suffix}`, customer.rows[0]!.id, suffix]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, description, quantity,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 1, $3, 1, 'artifact-test', 'enquiry_items', $4)
      RETURNING id
    `,
    [organizationId, enquiry.rows[0]!.id, `${label} drawing target`, suffix]
  )
  return {
    organizationId,
    target: { id: item.rows[0]!.id, schema: "sales", table: "enquiry_items" },
  }
}

function storeInput(
  context: Awaited<ReturnType<typeof createCommercialTarget>>,
  overrides: Partial<
    Parameters<ReturnType<typeof createArtifactService>["store"]>[0]
  > = {}
) {
  return {
    actorUserId: null,
    bytes: Buffer.from("artifact-alpha"),
    fileName: "customer-drawing.pdf",
    idempotencyKey: randomUUID(),
    mediaType: "application/pdf",
    organizationId: context.organizationId,
    origin: "uploaded" as const,
    purpose: "drawing",
    target: context.target,
    ...overrides,
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await pool.end()
})

describe("Artifact service", () => {
  test("stores canonical logical and physical metadata for a Commercial Enquiry drawing", async () => {
    const context = await createCommercialTarget("First")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })
    const bytes = Buffer.from("artifact-alpha")

    try {
      const artifact = await service.store(storeInput(context, { bytes }))

      expect(artifact).toMatchObject({
        byteSize: 14,
        fileName: "customer-drawing.pdf",
        isCurrent: true,
        lifecycleState: "current",
        mediaType: "application/pdf",
        origin: "uploaded",
        sha256:
          "361ed25c3e60cacb463301889b040c27ae41ddea7a6445ee82a2221b64c3a35f",
        version: 1,
      })
      expect(artifact.publicUrl).toMatch(/^https:\/\/files\.example\.test\//)
      expect(provider.uploads).toHaveLength(1)
      expect(provider.uploads[0]?.bytes.equals(bytes)).toBe(true)
    } finally {
      await service.close()
    }
  })

  test("deduplicates exact bytes within an Organization but keeps separate logical Artifacts", async () => {
    const first = await createCommercialTarget("Dedupe")
    const secondTarget = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, description, quantity,
          source_system, source_table, source_id
        )
        SELECT organization_id, enquiry_id, 2, 'Second drawing target', 1,
          'artifact-test', 'enquiry_items', $2
        FROM sales.enquiry_items WHERE id = $1
        RETURNING id
      `,
      [first.target.id, randomUUID()]
    )
    const second = {
      organizationId: first.organizationId,
      target: { ...first.target, id: secondTarget.rows[0]!.id },
    }
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })

    try {
      const one = await service.store(storeInput(first))
      const two = await service.store(
        storeInput(second, { fileName: "copy.pdf" })
      )
      expect(one.id).not.toBe(two.id)
      expect(one.providerKey).toBe(two.providerKey)
      expect(provider.uploads).toHaveLength(1)
    } finally {
      await service.close()
    }
  })

  test("does not deduplicate identical bytes across Organizations", async () => {
    const first = await createCommercialTarget("Org A")
    const second = await createCommercialTarget("Org B")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })

    try {
      const [one, two] = await Promise.all([
        service.store(storeInput(first)),
        service.store(storeInput(second)),
      ])
      expect(one.providerKey).not.toBe(two.providerKey)
      expect(provider.uploads).toHaveLength(2)
    } finally {
      await service.close()
    }
  })

  test("concurrent retries converge on one physical object and one logical link", async () => {
    const context = await createCommercialTarget("Retry")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })
    const retryInput = storeInput(context, { idempotencyKey: randomUUID() })

    try {
      const [one, two] = await Promise.all([
        service.store(retryInput),
        service.store(retryInput),
      ])
      expect(one.id).toBe(two.id)
      expect(provider.uploads).toHaveLength(1)
      const history = await service.listHistory({
        organizationId: context.organizationId,
        purpose: "drawing",
        target: context.target,
      })
      expect(history).toHaveLength(1)
    } finally {
      await service.close()
    }
  })

  test("replaces the current drawing, retains superseded history, and rejects unavailable bytes", async () => {
    const context = await createCommercialTarget("History")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })
    const workflow = createCommercialWorkflowRepository({ connectionString })

    try {
      const first = await service.store(storeInput(context))
      const second = await service.store(
        storeInput(context, {
          bytes: Buffer.from("artifact-beta"),
          fileName: "revised-drawing.pdf",
        })
      )

      expect(
        (
          await service.getCurrent({
            organizationId: context.organizationId,
            purpose: "drawing",
            target: context.target,
          })
        ).id
      ).toBe(second.id)
      expect(
        await service.listHistory({
          organizationId: context.organizationId,
          purpose: "drawing",
          target: context.target,
        })
      ).toMatchObject([
        {
          id: second.id,
          isCurrent: true,
          lifecycleState: "current",
          version: 2,
        },
        {
          id: first.id,
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      await expect(
        workflow.getCurrentDrawing({
          enquiryItemId: context.target.id,
          organizationId: context.organizationId,
        })
      ).resolves.toMatchObject({
        id: second.id,
        publicUrl: second.publicUrl,
      })
      await expect(
        workflow.listDrawingHistory({
          enquiryItemId: context.target.id,
          organizationId: context.organizationId,
        })
      ).resolves.toMatchObject([
        { id: second.id, isCurrent: true, version: 2 },
        { id: first.id, isCurrent: false, version: 1 },
      ])

      await pool.query(
        `UPDATE core.file_objects SET lifecycle_state = 'deleted' WHERE provider_key = $1`,
        [second.providerKey]
      )
      await expect(
        service.getCurrent({
          organizationId: context.organizationId,
          purpose: "drawing",
          target: context.target,
        })
      ).rejects.toThrow("deleted or unavailable")
      await expect(
        workflow.getCurrentDrawing({
          enquiryItemId: context.target.id,
          organizationId: context.organizationId,
        })
      ).rejects.toThrow("deleted or unavailable")
    } finally {
      await workflow.close()
      await service.close()
    }
  })
})
