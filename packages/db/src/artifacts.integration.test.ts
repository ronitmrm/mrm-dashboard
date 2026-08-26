import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import {
  authorizeCommercialAttachmentTarget,
  createCommercialWorkflowRepository,
  type CommercialAttachmentAuthorization,
} from "./commercial-workflow"
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

  failDeletes = false

  constructor(private readonly failUploadNumber?: number) {}

  async delete({ key }: { key: string }) {
    if (this.failDeletes) throw new Error("artifact deletion failed")
    this.deleted.push(key)
  }

  async upload(input: {
    bytes: Buffer
    customId: string
    mediaType: string
    name: string
  }) {
    this.uploads.push(input)
    if (this.uploads.length === this.failUploadNumber) {
      throw new Error("artifact set upload failed")
    }
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
    enquiryId: enquiry.rows[0]!.id,
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

function authorizeTarget(input: CommercialAttachmentAuthorization) {
  return (client: PoolClient, { isRetry }: { isRetry: boolean }) =>
    authorizeCommercialAttachmentTarget(client, input, {
      requireOpenState: !isRetry,
    })
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
      enquiryId: first.enquiryId,
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

  test("keeps Commercial attachment purposes distinct while reusing one physical object", async () => {
    const context = await createCommercialTarget("Commercial purposes")
    const design = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.design_tasks (
          organization_id, enquiry_item_id, status,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, 'In Progress', 'artifact-test', 'design_tasks', $3)
        RETURNING id
      `,
      [context.organizationId, context.target.id, randomUUID()]
    )
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })
    const workflow = createCommercialWorkflowRepository({ connectionString })
    const bytes = Buffer.from("shared-commercial-bytes")
    const clarification = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.clarification_tasks (
          organization_id, enquiry_id, enquiry_item_id, question, status,
          source_stage, target_stage, source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, 'Need replacement', 'Open', 'Technical', 'Sales',
          'artifact-test', 'clarification_tasks', $4)
        RETURNING id
      `,
      [
        context.organizationId,
        context.enquiryId,
        context.target.id,
        randomUUID(),
      ]
    )

    try {
      await expect(
        service.store(
          storeInput(context, {
            authorizeTarget: authorizeTarget({
              clarificationTaskId: clarification.rows[0]!.id,
              enquiryId: context.enquiryId,
              enquiryItemId: context.target.id,
              kind: "sales_clarification",
              organizationId: randomUUID(),
            }),
          })
        )
      ).rejects.toThrow("attachment target was not found")
      expect(provider.uploads).toHaveLength(0)

      const originalDrawing = await service.store(
        storeInput(context, {
          authorizeTarget: authorizeTarget({
            enquiryId: context.enquiryId,
            enquiryItemId: context.target.id,
            kind: "enquiry_item",
            organizationId: context.organizationId,
          }),
          bytes,
          fileName: "original-drawing.pdf",
        })
      )
      await service.store(
        storeInput(context, {
          authorizeTarget: authorizeTarget({
            clarificationTaskId: clarification.rows[0]!.id,
            enquiryId: context.enquiryId,
            enquiryItemId: context.target.id,
            kind: "sales_clarification",
            organizationId: context.organizationId,
          }),
          bytes,
          fileName: "sales-answer.pdf",
          purpose: "sales_clarification",
          supersedesPurposes: ["drawing", "sales_clarification"],
        })
      )
      for (const purpose of [
        "internal_drawing",
        "customer_marked",
        "cad",
      ] as const) {
        await service.store(
          storeInput(context, {
            authorizeTarget: authorizeTarget({
              designId: design.rows[0]!.id,
              enquiryId: context.enquiryId,
              enquiryItemId: context.target.id,
              kind: "design",
              organizationId: context.organizationId,
            }),
            bytes,
            fileName: `${purpose}.pdf`,
            purpose,
            target: {
              id: design.rows[0]!.id,
              schema: "sales",
              table: "design_tasks",
            },
          })
        )
      }

      expect(provider.uploads).toHaveLength(1)
      await expect(
        service.listHistory({
          organizationId: context.organizationId,
          purpose: "drawing",
          target: context.target,
        })
      ).resolves.toMatchObject([
        {
          id: originalDrawing.id,
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      await expect(
        workflow.listAttachments({
          organizationId: context.organizationId,
          purpose: "sales_clarification",
          targetId: context.target.id,
          targetTable: "enquiry_items",
        })
      ).resolves.toMatchObject([
        {
          fileName: "sales-answer.pdf",
          isCurrent: true,
          publicUrl: expect.stringMatching(/^https:\/\/files\.example\.test\//),
          purpose: "sales_clarification",
          version: 2,
        },
      ])
      for (const purpose of [
        "internal_drawing",
        "customer_marked",
        "cad",
      ] as const) {
        await expect(
          workflow.listAttachments({
            organizationId: context.organizationId,
            purpose,
            targetId: design.rows[0]!.id,
            targetTable: "design_tasks",
          })
        ).resolves.toMatchObject([
          {
            fileName: `${purpose}.pdf`,
            isCurrent: true,
            publicUrl: expect.stringMatching(
              /^https:\/\/files\.example\.test\//
            ),
            purpose,
          },
        ])
      }

      const laterDrawing = await service.store(
        storeInput(context, {
          authorizeTarget: authorizeTarget({
            enquiryId: context.enquiryId,
            enquiryItemId: context.target.id,
            kind: "enquiry_item",
            organizationId: context.organizationId,
          }),
          bytes,
          fileName: "later-drawing.pdf",
          supersedesPurposes: ["drawing", "sales_clarification"],
        })
      )
      await expect(
        service.listHistory({
          organizationId: context.organizationId,
          purpose: "sales_clarification",
          target: context.target,
        })
      ).resolves.toMatchObject([
        {
          fileName: "sales-answer.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 2,
        },
      ])
      await expect(
        workflow.getCurrentDrawing({
          enquiryItemId: context.target.id,
          organizationId: context.organizationId,
        })
      ).resolves.toMatchObject({
        fileName: "later-drawing.pdf",
        id: laterDrawing.id,
      })
      expect(laterDrawing).toMatchObject({ version: 3 })

      const concurrentClarification = storeInput(context, {
        authorizeTarget: authorizeTarget({
          clarificationTaskId: clarification.rows[0]!.id,
          enquiryId: context.enquiryId,
          enquiryItemId: context.target.id,
          kind: "sales_clarification",
          organizationId: context.organizationId,
        }),
        bytes: Buffer.from("concurrent-clarification"),
        fileName: "concurrent-clarification.pdf",
        purpose: "sales_clarification",
        supersedesPurposes: ["drawing", "sales_clarification"],
      })
      const [, clarificationArtifact] = await Promise.all([
        service.store(
          storeInput(context, {
            authorizeTarget: authorizeTarget({
              enquiryId: context.enquiryId,
              enquiryItemId: context.target.id,
              kind: "enquiry_item",
              organizationId: context.organizationId,
            }),
            bytes: Buffer.from("concurrent-drawing"),
            fileName: "concurrent-drawing.pdf",
            supersedesPurposes: ["drawing", "sales_clarification"],
          })
        ),
        service.store(concurrentClarification),
      ])
      const drawingFamily = await pool.query<{
        current_count: string
        max_version: number
      }>(
        `
          SELECT count(*) FILTER (WHERE is_current)::text AS current_count,
            max(version)::integer AS max_version
          FROM core.file_links
          WHERE organization_id = $1
            AND target_schema = 'sales' AND target_table = 'enquiry_items'
            AND target_id = $2
            AND purpose = ANY($3::text[])
        `,
        [
          context.organizationId,
          context.target.id,
          ["drawing", "sales_clarification"],
        ]
      )
      expect(drawingFamily.rows[0]).toEqual({
        current_count: "1",
        max_version: 5,
      })
      await pool.query(
        `UPDATE sales.clarification_tasks SET status = 'Resolved' WHERE id = $1`,
        [clarification.rows[0]!.id]
      )
      await expect(
        service.store(concurrentClarification)
      ).resolves.toMatchObject({
        id: clarificationArtifact.id,
        version: clarificationArtifact.version,
      })
      expect(provider.uploads).toHaveLength(3)
    } finally {
      await workflow.close()
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

  test("stores a required artifact set atomically and reuses it on retry", async () => {
    const context = await createCommercialTarget("Required set")
    const failedProvider = new ControllableArtifactProvider(2)
    const failedService = createArtifactService({
      connectionString,
      provider: failedProvider,
    })
    const pdf = storeInput(context, {
      idempotencyKey: `set-pdf:${context.target.id}`,
      purpose: "issued_pdf",
    })
    const workbook = storeInput(context, {
      bytes: Buffer.from("artifact-workbook"),
      fileName: "issued.xlsx",
      idempotencyKey: `set-xlsx:${context.target.id}`,
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      purpose: "issued_xlsx",
    })

    try {
      await expect(failedService.storeSet([pdf, workbook])).rejects.toThrow(
        "artifact set upload failed"
      )
      await expect(
        failedService.listByOrganization({
          organizationId: context.organizationId,
        })
      ).resolves.toEqual([])
      expect(failedProvider.deleted).toHaveLength(1)
    } finally {
      await failedService.close()
    }

    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })
    try {
      const first = await service.storeSet([pdf, workbook])
      const retry = await service.storeSet([pdf, workbook])
      expect(retry.map((artifact) => artifact.id)).toEqual(
        first.map((artifact) => artifact.id)
      )
      expect(provider.uploads).toHaveLength(2)
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

  test("tombstones one logical Artifact without deleting shared bytes", async () => {
    const first = await createCommercialTarget("Delete shared first")
    const secondTarget = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, description, quantity,
          source_system, source_table, source_id
        )
        SELECT organization_id, enquiry_id, 2, 'Shared delete target', 1,
          'artifact-test', 'enquiry_items', $2
        FROM sales.enquiry_items WHERE id = $1
        RETURNING id
      `,
      [first.target.id, randomUUID()]
    )
    const second = {
      enquiryId: first.enquiryId,
      organizationId: first.organizationId,
      target: { ...first.target, id: secondTarget.rows[0]!.id },
    }
    const actor = await pool.query<{ id: string }>(
      `INSERT INTO identity.users (name, email) VALUES ($1, $2) RETURNING id`,
      ["Artifact deleter", `artifact-delete-${randomUUID()}@example.test`]
    )
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })

    try {
      const deleted = await service.store(storeInput(first))
      const survivor = await service.store(
        storeInput(second, { fileName: "shared-copy.pdf" })
      )

      await expect(
        service.delete({
          actorUserId: actor.rows[0]!.id,
          artifactId: deleted.id,
          confirmation: deleted.fileName,
          organizationId: first.organizationId,
          reason: "Customer requested removal",
        })
      ).resolves.toMatchObject({
        artifactId: deleted.id,
        physicalObjectDeleted: false,
      })
      expect(provider.deleted).toEqual([])
      await expect(
        service.getCurrent({
          organizationId: second.organizationId,
          purpose: "drawing",
          target: second.target,
        })
      ).resolves.toMatchObject({
        id: survivor.id,
        publicUrl: survivor.publicUrl,
      })

      const tombstone = await pool.query<{
        deleted_at: Date | null
        deleted_by_user_id: string | null
        deletion_reason: string | null
        is_current: boolean
        lifecycle_state: string
      }>(
        `
          SELECT file.deleted_at, file.deleted_by_user_id,
            file.deletion_reason, file.lifecycle_state, link.is_current
          FROM core.files file
          JOIN core.file_links link ON link.file_id = file.id
          WHERE file.id = $1
        `,
        [deleted.id]
      )
      expect(tombstone.rows[0]).toMatchObject({
        deleted_by_user_id: actor.rows[0]!.id,
        deletion_reason: "Customer requested removal",
        is_current: false,
        lifecycle_state: "deleted",
      })
      expect(tombstone.rows[0]?.deleted_at).toBeInstanceOf(Date)
      const audit = await pool.query<{
        actor_user_id: string | null
        event_type: string
        reason: string | null
        sha256: string
      }>(
        `
          SELECT actor_user_id, event_type, reason, metadata->>'sha256' AS sha256
          FROM audit.events
          WHERE target_schema = 'core' AND target_table = 'files'
            AND target_id = $1 AND event_type = 'artifact.deleted'
        `,
        [deleted.id]
      )
      expect(audit.rows).toEqual([
        {
          actor_user_id: actor.rows[0]!.id,
          event_type: "artifact.deleted",
          reason: "Customer requested removal",
          sha256: deleted.sha256,
        },
      ])
    } finally {
      await service.close()
    }
  })

  test("deletes final physical bytes only after provider success and retries provider failure", async () => {
    const context = await createCommercialTarget("Delete final")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })

    try {
      const artifact = await service.store(storeInput(context))
      provider.failDeletes = true

      await expect(
        service.delete({
          actorUserId: null,
          artifactId: artifact.id,
          confirmation: artifact.fileName,
          organizationId: context.organizationId,
          reason: "Remove obsolete upload",
        })
      ).rejects.toThrow("artifact deletion failed")
      await expect(
        service.getCurrent({
          organizationId: context.organizationId,
          purpose: "drawing",
          target: context.target,
        })
      ).resolves.toMatchObject({
        id: artifact.id,
        publicUrl: artifact.publicUrl,
      })
      const failed = await pool.query<{
        deletion_error: string | null
        lifecycle_state: string
        public_url: string
      }>(
        `SELECT deletion_error, lifecycle_state, public_url
         FROM core.file_objects WHERE provider_key = $1`,
        [artifact.providerKey]
      )
      expect(failed.rows[0]).toMatchObject({
        deletion_error: "artifact deletion failed",
        lifecycle_state: "deletion_failed",
        public_url: artifact.publicUrl,
      })

      provider.failDeletes = false
      await expect(
        service.delete({
          actorUserId: null,
          artifactId: artifact.id,
          confirmation: artifact.fileName,
          organizationId: context.organizationId,
          reason: "Remove obsolete upload",
        })
      ).resolves.toMatchObject({ physicalObjectDeleted: true })
      expect(provider.deleted).toEqual([artifact.providerKey])
      await expect(
        service.getCurrent({
          organizationId: context.organizationId,
          purpose: "drawing",
          target: context.target,
        })
      ).rejects.toThrow("deleted or unavailable")
    } finally {
      await service.close()
    }
  })

  test("requires exact target confirmation and a non-empty deletion reason", async () => {
    const context = await createCommercialTarget("Delete validation")
    const provider = new ControllableArtifactProvider()
    const service = createArtifactService({ connectionString, provider })

    try {
      const artifact = await service.store(storeInput(context))
      await expect(
        service.delete({
          actorUserId: null,
          artifactId: artifact.id,
          confirmation: "wrong-file.pdf",
          organizationId: context.organizationId,
          reason: "Valid reason",
        })
      ).rejects.toThrow("confirmation")
      await expect(
        service.delete({
          actorUserId: null,
          artifactId: artifact.id,
          confirmation: artifact.fileName,
          organizationId: context.organizationId,
          reason: "   ",
        })
      ).rejects.toThrow("reason")
      expect(provider.deleted).toEqual([])
    } finally {
      await service.close()
    }
  })
})
