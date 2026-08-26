import { randomUUID } from "node:crypto"

import {
  authorizeProformaInvoiceArtifactTarget,
  createArtifactService,
  createCommercialOrdersRepository,
  migrateDatabase,
  proformaInvoicePdfArtifactPurpose,
  proformaInvoiceXlsxArtifactPurpose,
  type ArtifactStorageProvider,
} from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import {
  buildProformaInvoicePdf,
  buildProformaInvoiceWorkbook,
} from "../../app/commercial/orders/order-artifacts"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })

class PiArtifactProvider implements ArtifactStorageProvider {
  readonly bytesByUrl = new Map<string, Buffer>()
  readonly deleted: string[] = []
  readonly uploads: Array<{ mediaType: string; url: string }> = []

  constructor(private readonly failMediaType?: string) {}

  async delete({ key }: { key: string }) {
    this.deleted.push(key)
  }

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    if (input.mediaType === this.failMediaType) {
      throw new Error(`PI ${input.mediaType} upload failed`)
    }
    const key = `issued-pi-${randomUUID()}`
    const url = `https://files.example.test/${key}`
    this.uploads.push({ mediaType: input.mediaType, url })
    this.bytesByUrl.set(url, Buffer.from(input.bytes))
    return { key, url }
  }
}

async function createDraftPi(label: string) {
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ($1, $2) RETURNING id",
    [`PI-${suffix}`, `${label} Organization`]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      ) VALUES ($1, $2, $3, 'pi-issuance-test', 'customers', $4)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`, `${label} Customer`, suffix]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      ) VALUES ($1, $2, 'QUOTE', 'Q', $3, 'pi-issuance-test', 'items', $4)
      RETURNING id
    `,
    [organizationId, `Q-${suffix}`, `${label} Part`, suffix]
  )
  const quote = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, customer_id, item_id,
        lineage_item_id, customer_part_code, quantity, unit_price,
        currency_code, status, is_active, sent_at, rate_usd,
        approved_price_usd, total_rate_inr, conversion_rate,
        price_lineage_key, source_system, source_table, source_id
      ) VALUES (
        $1, $2, 1, $3, $4, $4, $5, 2, 12.5, 'USD', 'Sent', true, now(),
        12.5, 12.5, 1000, 80, $6,
        'pi-issuance-test', 'quote_items', $7
      ) RETURNING id
    `,
    [
      organizationId,
      `QT-${suffix}`,
      customer.rows[0]!.id,
      item.rows[0]!.id,
      `PART-${suffix}`,
      `code:part-${suffix}`,
      suffix,
    ]
  )
  const repository = createCommercialOrdersRepository({ connectionString })
  const order = await repository.createPurchaseOrder({
    customerId: customer.rows[0]!.id,
    organizationId,
    poDate: "2026-08-23",
    poNumber: `PO-${suffix}`,
  })
  await repository.addPurchaseOrderLine({
    customerPartCode: `PART-${suffix}`,
    currencyCode: "USD",
    lineNumber: 1,
    poPrice: 12.5,
    purchaseOrderId: order.id,
    quantity: 2,
  })
  const invoice = await repository.generateProformaInvoice({
    purchaseOrderId: order.id,
  })
  await repository.close()
  return {
    customerId: customer.rows[0]!.id,
    invoiceId: invoice.id,
    label,
    organizationId,
    purchaseOrderId: order.id,
    quoteItemId: quote.rows[0]!.id,
  }
}

async function issuePi(
  context: Awaited<ReturnType<typeof createDraftPi>>,
  provider: PiArtifactProvider
) {
  const repository = createCommercialOrdersRepository({ connectionString })
  const artifacts = createArtifactService({ connectionString, provider })
  try {
    return await repository.markProformaInvoiceSent({
      proformaInvoiceId: context.invoiceId,
      storeIssuedSet: async ({ document, organizationId }) => {
        const workbook = XLSX.write(buildProformaInvoiceWorkbook(document), {
          bookType: "xlsx",
          type: "buffer",
        }) as Buffer
        const target = {
          id: context.invoiceId,
          schema: "sales",
          table: "proforma_invoices",
        }
        const authorizeTarget = (
          client: Parameters<typeof authorizeProformaInvoiceArtifactTarget>[0],
          { isRetry }: { isRetry: boolean }
        ) =>
          authorizeProformaInvoiceArtifactTarget(
            client,
            { organizationId, proformaInvoiceId: context.invoiceId },
            { requireDraftState: !isRetry }
          )
        await artifacts.storeSet([
          {
            actorUserId: null,
            authorizeTarget,
            bytes: Buffer.from(await buildProformaInvoicePdf(document)),
            fileName: `${document.invoices[0]!.invoiceNumber}-pi.pdf`,
            idempotencyKey: `issued-pi-pdf:${context.invoiceId}`,
            mediaType: "application/pdf",
            organizationId,
            origin: "generated",
            purpose: proformaInvoicePdfArtifactPurpose,
            target,
          },
          {
            actorUserId: null,
            authorizeTarget,
            bytes: workbook,
            fileName: `${document.invoices[0]!.invoiceNumber}-pi.xlsx`,
            idempotencyKey: `issued-pi-xlsx:${context.invoiceId}`,
            mediaType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            organizationId,
            origin: "generated",
            purpose: proformaInvoiceXlsxArtifactPurpose,
            target,
          },
        ])
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

describe("sent PI document-set issuance", () => {
  test("keeps previews live and leaves no partial set when either upload fails", async () => {
    const draft = await createDraftPi("Draft preview")
    const reader = createCommercialOrdersRepository({ connectionString })
    try {
      const document = await reader.getPurchaseOrder(draft.purchaseOrderId)
      await expect(buildProformaInvoicePdf(document)).resolves.toBeInstanceOf(
        Uint8Array
      )
      expect(buildProformaInvoiceWorkbook(document).SheetNames).toEqual([
        "PI Summary",
        "PI Lines",
      ])
      await expect(
        reader.getProformaInvoiceArtifact(
          draft.invoiceId,
          proformaInvoicePdfArtifactPurpose
        )
      ).resolves.toBeNull()

      for (const mediaType of [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ]) {
        const context = await createDraftPi(`Failure ${mediaType}`)
        const provider = new PiArtifactProvider(mediaType)
        await expect(issuePi(context, provider)).rejects.toThrow("upload failed")
        const order = await reader.getPurchaseOrder(context.purchaseOrderId)
        expect(order.invoices[0]).toMatchObject({ status: "Draft" })
        await expect(
          Promise.all([
            reader.getProformaInvoiceArtifact(
              context.invoiceId,
              proformaInvoicePdfArtifactPurpose
            ),
            reader.getProformaInvoiceArtifact(
              context.invoiceId,
              proformaInvoiceXlsxArtifactPurpose
            ),
          ])
        ).resolves.toEqual([null, null])
        expect(provider.deleted).toHaveLength(
          mediaType === "application/pdf" ? 0 : 1
        )
      }
    } finally {
      await reader.close()
    }
  }, 60_000)

  test("retries once and preserves both files through source changes and approval", async () => {
    const context = await createDraftPi("Immutable")
    const provider = new PiArtifactProvider()
    const [first, retry] = await Promise.all([
      issuePi(context, provider),
      issuePi(context, provider),
    ])
    expect(first).toMatchObject({ status: "Sent" })
    expect(retry).toMatchObject({ id: first.id, status: "Sent" })
    expect(provider.uploads).toHaveLength(2)

    const repository = createCommercialOrdersRepository({ connectionString })
    try {
      const issuedPdf = await repository.getProformaInvoiceArtifact(
        context.invoiceId,
        proformaInvoicePdfArtifactPurpose
      )
      const issuedXlsx = await repository.getProformaInvoiceArtifact(
        context.invoiceId,
        proformaInvoiceXlsxArtifactPurpose
      )
      const pdfBytes = provider.bytesByUrl.get(issuedPdf!.publicUrl)!
      const xlsxBytes = provider.bytesByUrl.get(issuedXlsx!.publicUrl)!
      expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF")
      const workbook = XLSX.read(xlsxBytes)
      expect(
        XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["PI Summary"]!, {
          header: 1,
        })
      ).toContainEqual(["Customer", "Immutable Customer"])

      await pool.query(
        "UPDATE sales.customers SET company_name = 'Changed Customer' WHERE id = $1",
        [context.customerId]
      )
      await pool.query(
        "UPDATE sales.purchase_order_lines SET pi_price = 999 WHERE purchase_order_id = $1",
        [context.purchaseOrderId]
      )
      await repository.approveProformaInvoice({
        proformaInvoiceId: context.invoiceId,
      })
      const live = await repository.getPurchaseOrder(context.purchaseOrderId)
      expect(live).toMatchObject({ companyName: "Changed Customer" })
      expect(live.lines[0]).toMatchObject({ piPrice: 999 })
      await expect(
        repository.getProformaInvoiceArtifact(
          context.invoiceId,
          proformaInvoicePdfArtifactPurpose
        )
      ).resolves.toEqual(issuedPdf)
      await expect(
        repository.getProformaInvoiceArtifact(
          context.invoiceId,
          proformaInvoiceXlsxArtifactPurpose
        )
      ).resolves.toEqual(issuedXlsx)
      expect(provider.bytesByUrl.get(issuedPdf!.publicUrl)).toEqual(pdfBytes)
      expect(provider.bytesByUrl.get(issuedXlsx!.publicUrl)).toEqual(xlsxBytes)
      expect(provider.uploads).toHaveLength(2)
    } finally {
      await repository.close()
    }
  }, 60_000)
})
