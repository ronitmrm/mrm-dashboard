import { randomUUID } from "node:crypto"

import {
  authorizeQuoteArtifactTarget,
  createArtifactService,
  createCommercialCostingRepository,
  migrateDatabase,
  quotePdfArtifactPurpose,
  type ArtifactStorageProvider,
} from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { buildQuotePdf, type QuoteDocument } from "./quote-pdf"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })

class QuoteArtifactProvider implements ArtifactStorageProvider {
  readonly bytesByUrl = new Map<string, Buffer>()
  readonly deleted: string[] = []
  readonly uploads: Array<{ bytes: Buffer; key: string; url: string }> = []

  constructor(
    private readonly options: { failUpload?: boolean; fixedKey?: string } = {}
  ) {}

  async delete({ key }: { key: string }) {
    this.deleted.push(key)
  }

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    if (this.options.failUpload) throw new Error("quote PDF upload failed")
    const key = this.options.fixedKey ?? `issued-quote-${randomUUID()}`
    const url = `https://files.example.test/${key}`
    const bytes = Buffer.from(input.bytes)
    this.uploads.push({ bytes, key, url })
    this.bytesByUrl.set(url, bytes)
    return { key, url }
  }
}

async function createReadyQuote(label: string) {
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`QUOTE-${suffix}`, `${label} Organization`]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, 'quote-issuance-test', 'customers', $4)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`, `${label} Customer`, suffix]
  )
  const enquiry = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on,
        currency, conversion_rate, payment_terms, source_system,
        source_table, source_id
      )
      VALUES (
        $1, $2, $3, '2026-08-22', 'USD', 83.25, 'Net 30',
        'quote-issuance-test', 'enquiries', $4
      )
      RETURNING id
    `,
    [organizationId, `ENQ-${suffix}`, customer.rows[0]!.id, suffix]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'QUOTE', 'Q', $3, 'quote-issuance-test', 'items', $4)
      RETURNING id
    `,
    [organizationId, `Q-${suffix}`, `${label} Product`, suffix]
  )
  const enquiryItem = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 1, $3, $4, 100, $5,
        'quote-issuance-test', 'enquiry_items', $6
      )
      RETURNING id
    `,
    [
      organizationId,
      enquiry.rows[0]!.id,
      `PART-${suffix}`,
      `${label} Part`,
      item.rows[0]!.id,
      suffix,
    ]
  )
  const quote = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id, enquiry_item_id,
        customer_id, item_id, lineage_item_id, customer_part_code, quantity,
        unit_price, currency_code, status, is_active, rate_usd,
        approved_price_usd, total_rate_inr, conversion_rate,
        price_lineage_key, source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 1, $3, $4, $5, $6, $6, $7, 100, 12.5, 'USD',
        'Ready', false, 12.5, 12.5, 1031.25, 83.25, $8,
        'quote-issuance-test', 'quote_items', $9
      )
      RETURNING id
    `,
    [
      organizationId,
      `QT-${suffix}`,
      enquiry.rows[0]!.id,
      enquiryItem.rows[0]!.id,
      customer.rows[0]!.id,
      item.rows[0]!.id,
      `PART-${suffix}`,
      `code:part-${suffix}`,
      suffix,
    ]
  )
  return {
    customerId: customer.rows[0]!.id,
    enquiryId: enquiry.rows[0]!.id,
    organizationId,
    quoteItemId: quote.rows[0]!.id,
  }
}

const fixedMarket = {
  copper: "9,200.00",
  forex: { label: "USD/INR Forex Rate", value: "84.12" },
  zinc: "2,800.00",
}

async function issueQuote(
  context: Awaited<ReturnType<typeof createReadyQuote>>,
  provider: QuoteArtifactProvider
) {
  const repository = createCommercialCostingRepository({ connectionString })
  const artifacts = createArtifactService({ connectionString, provider })
  try {
    return await repository.issueQuote({
      followupDueOn: "2026-09-30",
      quoteItemId: context.quoteItemId,
      storeIssuedPdf: async ({ document, organizationId, quoteItemId }) => {
        const bytes = Buffer.from(
          await buildQuotePdf(document as QuoteDocument, fixedMarket)
        )
        await artifacts.store({
          actorUserId: null,
          authorizeTarget: (client, { isRetry }) =>
            authorizeQuoteArtifactTarget(
              client,
              { organizationId, quoteItemId },
              { requireReadyState: !isRetry }
            ),
          bytes,
          fileName: `${document.enquiryNumber}-Rev-${document.revision}-quote.pdf`,
          idempotencyKey: `issued-quote-pdf:${quoteItemId}`,
          mediaType: "application/pdf",
          organizationId,
          origin: "generated",
          purpose: quotePdfArtifactPurpose,
          target: { id: quoteItemId, schema: "sales", table: "quote_items" },
        })
      },
    })
  } finally {
    await Promise.all([artifacts.close(), repository.close()])
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
}, 180_000)

afterAll(async () => {
  await pool.end()
})

describe("sent Quote PDF issuance", () => {
  test("keeps a draft live and fails closed when upload or metadata storage fails", async () => {
    const draft = await createReadyQuote("Draft preview")
    await pool.query(
      "UPDATE sales.quote_items SET status = 'Draft' WHERE id = $1",
      [draft.quoteItemId]
    )
    const uploadFailure = await createReadyQuote("Upload failure")
    const uploadProvider = new QuoteArtifactProvider({ failUpload: true })
    const draftRepository = createCommercialCostingRepository({
      connectionString,
    })
    try {
      await expect(
        draftRepository.getQuoteDocument(draft.enquiryId)
      ).resolves.toMatchObject({ revision: 1 })
      await expect(
        draftRepository.getQuotePdfArtifact(draft.enquiryId)
      ).resolves.toBeNull()
      await expect(
        draftRepository.getQuotePdfArtifact(uploadFailure.enquiryId)
      ).resolves.toBeNull()
      await expect(issueQuote(uploadFailure, uploadProvider)).rejects.toThrow(
        "quote PDF upload failed"
      )
      await expect(
        draftRepository.getQuote(uploadFailure.quoteItemId)
      ).resolves.toMatchObject({ status: "Ready" })
      await expect(
        draftRepository.getQuotePdfArtifact(uploadFailure.enquiryId)
      ).resolves.toBeNull()

      const fixedKey = `metadata-conflict-${randomUUID()}`
      const metadataProvider = new QuoteArtifactProvider({ fixedKey })
      const metadataFailure = await createReadyQuote("Metadata failure")
      await pool.query(
        `
          INSERT INTO core.file_objects (
            organization_id, sha256, byte_size, provider, provider_key, public_url
          )
          VALUES ($1, repeat('0', 64), 1, 'uploadthing', $2, $3)
        `,
        [
          metadataFailure.organizationId,
          fixedKey,
          `https://files.example.test/${fixedKey}`,
        ]
      )
      await expect(
        issueQuote(metadataFailure, metadataProvider)
      ).rejects.toThrow()
      await expect(
        draftRepository.getQuote(metadataFailure.quoteItemId)
      ).resolves.toMatchObject({ status: "Ready" })
      await expect(
        draftRepository.getQuotePdfArtifact(metadataFailure.enquiryId)
      ).resolves.toBeNull()
    } finally {
      await draftRepository.close()
    }
  }, 60_000)

  test("serializes concurrent retries into one logical link and one upload", async () => {
    const context = await createReadyQuote("Concurrent")
    const provider = new QuoteArtifactProvider()

    const [first, second] = await Promise.all([
      issueQuote(context, provider),
      issueQuote(context, provider),
    ])

    expect(first).toMatchObject({ status: "Sent" })
    expect(second).toMatchObject({ id: first.id, status: "Sent" })
    expect(provider.uploads).toHaveLength(1)
    const artifacts = createArtifactService({ connectionString })
    try {
      await expect(
        artifacts.listHistory({
          organizationId: context.organizationId,
          purpose: quotePdfArtifactPurpose,
          target: {
            id: context.quoteItemId,
            schema: "sales",
            table: "quote_items",
          },
        })
      ).resolves.toHaveLength(1)
    } finally {
      await artifacts.close()
    }
  }, 30_000)

  test("serves immutable stored bytes after live Quote and master data change", async () => {
    const context = await createReadyQuote("Immutable")
    const provider = new QuoteArtifactProvider()
    const sent = await issueQuote(context, provider)
    expect(sent.status).toBe("Sent")
    const repository = createCommercialCostingRepository({ connectionString })
    try {
      const issued = await repository.getQuotePdfArtifact(context.enquiryId)
      expect(issued).not.toBeNull()
      const originalBytes = provider.bytesByUrl.get(issued!.publicUrl)
      expect(originalBytes?.subarray(0, 4).toString()).toBe("%PDF")

      await pool.query(
        "UPDATE core.organizations SET name = 'Changed Organization' WHERE id = $1",
        [context.organizationId]
      )
      await pool.query(
        "UPDATE sales.customers SET company_name = 'Changed Customer' WHERE id = $1",
        [context.customerId]
      )
      await pool.query(
        "UPDATE sales.enquiries SET payment_terms = 'Changed Terms' WHERE id = $1",
        [context.enquiryId]
      )
      await pool.query(
        `UPDATE sales.quote_items
         SET status = 'Superseded', is_active = false
         WHERE id = $1`,
        [context.quoteItemId]
      )
      await expect(
        pool.query(
          "UPDATE sales.quote_items SET unit_price = 999 WHERE id = $1",
          [context.quoteItemId]
        )
      ).rejects.toThrow("Sent quote history is immutable")

      const liveDocument = await repository.getQuoteDocument(context.enquiryId)
      expect(liveDocument).toMatchObject({
        companyName: "Changed Customer",
        paymentTerms: "Changed Terms",
      })
      expect(liveDocument.lines[0]).toMatchObject({ price: 12.5 })
      const historical = await repository.getQuotePdfArtifact(context.enquiryId)
      expect(historical).toEqual(issued)
      expect(provider.bytesByUrl.get(historical!.publicUrl)).toEqual(
        originalBytes
      )
      expect(provider.uploads).toHaveLength(1)
    } finally {
      await repository.close()
    }
  }, 30_000)

  test("returns an unavailable tombstone instead of regenerating a deleted sent Quote", async () => {
    const context = await createReadyQuote("Deleted immutable")
    const provider = new QuoteArtifactProvider()
    await issueQuote(context, provider)
    const repository = createCommercialCostingRepository({ connectionString })
    const artifacts = createArtifactService({ connectionString, provider })

    try {
      const issued = await repository.getQuotePdfArtifact(context.enquiryId)
      const [logical] = await artifacts.listHistory({
        organizationId: context.organizationId,
        purpose: quotePdfArtifactPurpose,
        target: {
          id: context.quoteItemId,
          schema: "sales",
          table: "quote_items",
        },
      })
      expect(issued).toMatchObject({ available: true })
      await artifacts.delete({
        actorUserId: null,
        artifactId: logical!.id,
        confirmation: logical!.fileName,
        organizationId: context.organizationId,
        reason: "Customer requested official-document removal",
      })

      await expect(
        repository.getQuotePdfArtifact(context.enquiryId)
      ).resolves.toMatchObject({
        available: false,
        fileName: logical!.fileName,
        publicUrl: issued!.publicUrl,
      })
      expect(provider.uploads).toHaveLength(1)
    } finally {
      await Promise.all([artifacts.close(), repository.close()])
    }
  }, 30_000)
})
