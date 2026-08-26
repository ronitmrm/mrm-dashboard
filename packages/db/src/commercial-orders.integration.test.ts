import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import {
  authorizeCommercialOrderArtifactTarget,
  authorizeProformaInvoiceArtifactTarget,
  createCommercialOrdersRepository,
  proformaInvoicePdfArtifactPurpose,
  proformaInvoiceXlsxArtifactPurpose,
} from "./commercial-orders"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialOrdersRepository({ connectionString })
const artifactReader = createArtifactService({ connectionString })
let customerId: string
let organizationId: string

class PurchaseOrderArtifactProvider implements ArtifactStorageProvider {
  readonly uploads: Buffer[] = []

  async delete() {}

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    this.uploads.push(input.bytes)
    const key = `po-source-${randomUUID()}`
    return {
      key,
      url: `https://files.example.test/${key}`,
    }
  }
}

async function markProformaInvoiceSent(proformaInvoiceId: string) {
  const artifacts = createArtifactService({
    connectionString,
    provider: new PurchaseOrderArtifactProvider(),
  })
  try {
    return await repository.markProformaInvoiceSent({
      proformaInvoiceId,
      storeIssuedSet: async () => {
        const target = {
          id: proformaInvoiceId,
          schema: "sales",
          table: "proforma_invoices",
        }
        const authorizeTarget = (client: Parameters<
          typeof authorizeProformaInvoiceArtifactTarget
        >[0], { isRetry }: { isRetry: boolean }) =>
          authorizeProformaInvoiceArtifactTarget(
            client,
            { organizationId, proformaInvoiceId },
            { requireDraftState: !isRetry }
          )
        await artifacts.storeSet([
          {
            actorUserId: null,
            authorizeTarget,
            bytes: Buffer.from(`test PI PDF ${proformaInvoiceId}`),
            fileName: "test-pi.pdf",
            idempotencyKey: `issued-pi-pdf:${proformaInvoiceId}`,
            mediaType: "application/pdf",
            organizationId,
            origin: "generated",
            purpose: proformaInvoicePdfArtifactPurpose,
            target,
          },
          {
            actorUserId: null,
            authorizeTarget,
            bytes: Buffer.from(`test PI workbook ${proformaInvoiceId}`),
            fileName: "test-pi.xlsx",
            idempotencyKey: `issued-pi-xlsx:${proformaInvoiceId}`,
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
    await artifacts.close()
  }
}

async function createItem(uid: string, uidKind = "INTERNAL") {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, 'Q', $2, 'test', 'items', $4)
      RETURNING id
    `,
    [organizationId, uid, uidKind, randomUUID()]
  )
  return result.rows[0]!.id
}

async function createSentQuote(input: {
  customerPartCode: string
  itemId: string
  price: number
  revision?: number
  sent?: boolean
}) {
  const suffix = randomUUID()
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, customer_id, item_id,
        lineage_item_id, customer_part_code, quantity, unit_price,
        currency_code, status, is_active, sent_at, rate_usd,
        approved_price_usd, total_rate_inr, conversion_rate,
        price_lineage_key, source_system, source_table, source_id
      )
      VALUES (
        $1, $2, $9, $3, $4, $4, $5, 1, $6, 'USD', $10, true,
        $11, $6, $6, $6::numeric * 80, 80, $7, 'test', 'quote_items', $8
      )
      RETURNING id
    `,
    [
      organizationId,
      `QT-${suffix}`,
      customerId,
      input.itemId,
      input.customerPartCode,
      input.price,
      `code:${input.customerPartCode.toLowerCase()}`,
      suffix,
      input.revision ?? 1,
      input.sent === false ? "Draft" : "Sent",
      input.sent === false ? null : new Date(),
    ]
  )
  return result.rows[0]!.id
}

async function linkQuotedChild(input: {
  childItemId: string
  childQuoteItemId: string
  parentQuoteItemId: string
}) {
  const snapshot = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_product_snapshots (
        organization_id, quote_item_id, item_uid, description, item_type,
        calculation_version, source_system, source_table, source_id
      )
      SELECT $1, quote.id, item.uid, item.description, 'Package', 'test-v1',
        'test', 'quote_product_snapshots', $3
      FROM sales.quote_items quote
      JOIN catalog.items item ON item.id = quote.item_id
      WHERE quote.id = $2
      RETURNING id
    `,
    [organizationId, input.parentQuoteItemId, randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_package_components (
        organization_id, quote_product_snapshot_id, component_item_id,
        component_uid, description, quantity, child_quote_item_id,
        source_system, source_table, source_id
      )
      SELECT $1, $2, item.id, item.uid, item.description, 1, $3,
        'test', 'quote_package_components', $4
      FROM catalog.items item
      WHERE item.id = $5
    `,
    [
      organizationId,
      snapshot.rows[0]!.id,
      input.childQuoteItemId,
      randomUUID(),
      input.childItemId,
    ]
  )
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'MRM Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
  )
  organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, status,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'PO Contract Customer', 'Active', 'test', 'customers', $3)
      RETURNING id
    `,
    [organizationId, `PO-${randomUUID()}`, randomUUID()]
  )
  customerId = customer.rows[0]!.id
})

afterAll(async () => {
  await artifactReader.close()
  await repository.close()
  await pool.end()
})

describe("commercial purchase orders and proforma invoices", () => {
  test("uses the source ranked first match across code and item candidates", async () => {
    const code = `AMB-${randomUUID()}`
    const olderQuoteId = await createSentQuote({
      customerPartCode: code,
      itemId: await createItem(`M-${randomUUID()}`),
      price: 10,
      revision: 1,
    })
    const latestQuoteId = await createSentQuote({
      customerPartCode: `OTHER-${randomUUID()}`,
      itemId: await createItem(code),
      price: 10,
      revision: 2,
    })

    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-21",
      poNumber: `PO-${randomUUID()}`,
    })
    const line = await repository.addPurchaseOrderLine({
      customerPartCode: code,
      currencyCode: "USD",
      description: "Ambiguous customer code",
      lineNumber: 1,
      poPrice: 10,
      purchaseOrderId: order.id,
      quantity: 100,
    })

    expect(line).toMatchObject({
      matchStatus: "Matched",
      quoteItemId: olderQuoteId,
    })
    expect(line.matchEvidence.candidateLineageCount).toBe(2)
    expect(line.matchEvidence.candidateQuoteCount).toBe(2)
    expect(line.matchEvidence.matchedBy).toBe("Customer Part Code")
    expect(line.quoteItemId).not.toBe(latestQuoteId)
  })

  test("approves a PI atomically against its historical quote and converts Q to M/P", async () => {
    const code = `ORDER-${randomUUID()}`
    const oldUid = `Q-${randomUUID()}`
    const itemId = await createItem(oldUid, "QUOTE")
    const quoteItemId = await createSentQuote({
      customerPartCode: code,
      itemId,
      price: 12.5,
    })
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-21",
      poNumber: `PO-${randomUUID()}`,
    })
    const line = await repository.addPurchaseOrderLine({
      customerPartCode: code,
      currencyCode: "USD",
      lineNumber: 1,
      poPrice: 12.5,
      purchaseOrderId: order.id,
      quantity: 50,
    })
    expect(line).toMatchObject({ decision: "Matched", matchStatus: "Matched" })

    const invoice = await repository.generateProformaInvoice({
      actorUserId: null,
      purchaseOrderId: order.id,
    })
    expect(invoice).toMatchObject({ status: "Draft", totalAmount: 625 })
    await markProformaInvoiceSent(invoice.id)
    await expect(
      pool.query(
        "UPDATE sales.proforma_invoice_lines SET unit_price = unit_price + 1 WHERE proforma_invoice_id = $1",
        [invoice.id]
      )
    ).rejects.toThrow("immutable")
    const approved = await repository.approveProformaInvoice({
      actorUserId: null,
      proformaInvoiceId: invoice.id,
    })
    expect(approved.status).toBe("Approved")

    const state = await pool.query<{
      converted_from_quote_uid: string
      is_active: boolean
      lifecycle_status: string
      ordered_at: Date
      status: string
      uid: string
      uid_kind: string
    }>(
      `
        SELECT item.uid, item.uid_kind, item.lifecycle_status,
          item.converted_from_quote_uid, quote.status, quote.is_active,
          quote.ordered_at
        FROM catalog.items item
        JOIN sales.quote_items quote ON quote.item_id = item.id
        WHERE quote.id = $1
      `,
      [quoteItemId]
    )
    expect(state.rows[0]).toMatchObject({
      converted_from_quote_uid: oldUid,
      is_active: true,
      lifecycle_status: "P",
      status: "Accepted",
      uid_kind: "INTERNAL",
    })
    expect(state.rows[0]!.uid).toMatch(/^M\d+$/)
    expect(state.rows[0]!.ordered_at).toBeInstanceOf(Date)
    const sideEffects = await pool.query<{
      drawing_count: string
      website_count: string
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM catalog.drawings
            WHERE item_id = $1 AND revision = '0') AS drawing_count,
          (SELECT count(*)::text FROM catalog.website_product_profiles
            WHERE item_id = $1
              AND source_payload ->> 'websiteStatus' = 'In Progress')
            AS website_count
      `,
      [itemId]
    )
    expect(sideEffects.rows[0]).toEqual({
      drawing_count: "1",
      website_count: "1",
    })
    await expect(
      repository.cancelPurchaseOrder({ purchaseOrderId: order.id })
    ).rejects.toThrow("approved")
  })

  test("recursively converts quoted package children and creates atomic order artifacts", async () => {
    const rootItemId = await createItem(`Q-${randomUUID()}`, "QUOTE")
    const childItemId = await createItem(`Q-${randomUUID()}`, "QUOTE")
    const grandchildItemId = await createItem(`Q-${randomUUID()}`, "QUOTE")
    const adjacentItemId = await createItem(`M-${randomUUID()}`)
    const rootCode = `TREE-${randomUUID()}`
    const rootQuoteItemId = await createSentQuote({
      customerPartCode: rootCode,
      itemId: rootItemId,
      price: 25,
      sent: false,
    })
    const childQuoteItemId = await createSentQuote({
      customerPartCode: `CHILD-${randomUUID()}`,
      itemId: childItemId,
      price: 10,
      sent: false,
    })
    const grandchildQuoteItemId = await createSentQuote({
      customerPartCode: `GRAND-${randomUUID()}`,
      itemId: grandchildItemId,
      price: 5,
      sent: false,
    })
    await linkQuotedChild({
      childItemId,
      childQuoteItemId,
      parentQuoteItemId: rootQuoteItemId,
    })
    await linkQuotedChild({
      childItemId: grandchildItemId,
      childQuoteItemId: grandchildQuoteItemId,
      parentQuoteItemId: childQuoteItemId,
    })
    await pool.query(
      `
        UPDATE sales.quote_items
        SET status = 'Sent', sent_at = now(), is_active = true
        WHERE id = ANY($1::uuid[])
      `,
      [[rootQuoteItemId, childQuoteItemId, grandchildQuoteItemId]]
    )
    await pool.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, 1, 'test', 'bom_lines', $4)
      `,
      [organizationId, rootItemId, adjacentItemId, randomUUID()]
    )
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-22",
      poNumber: `PO-${randomUUID()}`,
    })
    await repository.addPurchaseOrderLine({
      customerPartCode: rootCode,
      lineNumber: 1,
      poPrice: 25,
      purchaseOrderId: order.id,
      quantity: 2,
    })
    const invoice = await repository.generateProformaInvoice({
      purchaseOrderId: order.id,
    })
    await markProformaInvoiceSent(invoice.id)
    await repository.approveProformaInvoice({
      proformaInvoiceId: invoice.id,
    })

    const items = await pool.query<{
      id: string
      lifecycle_status: string
      uid_kind: string
    }>(
      `
        SELECT id, uid_kind, lifecycle_status
        FROM catalog.items
        WHERE id = ANY($1::uuid[])
        ORDER BY id
      `,
      [[rootItemId, childItemId, grandchildItemId]]
    )
    expect(items.rows).toHaveLength(3)
    expect(items.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lifecycle_status: "P",
          uid_kind: "INTERNAL",
        }),
        expect.objectContaining({
          lifecycle_status: "P",
          uid_kind: "INTERNAL",
        }),
        expect.objectContaining({
          lifecycle_status: "P",
          uid_kind: "INTERNAL",
        }),
      ])
    )
    const artifacts = await pool.query<{
      drawing_count: string
      ordered_website_count: string
      related_is_active: string
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM catalog.drawings
            WHERE item_id = ANY($1::uuid[])) AS drawing_count,
          (SELECT count(*)::text FROM catalog.website_product_profiles
            WHERE item_id = ANY($1::uuid[])
              AND source_payload ->> 'isActive' = 'true')
            AS ordered_website_count,
          (SELECT source_payload ->> 'isActive'
            FROM catalog.website_product_profiles
            WHERE item_id = $2) AS related_is_active
      `,
      [[rootItemId, childItemId, grandchildItemId], adjacentItemId]
    )
    expect(artifacts.rows[0]).toEqual({
      drawing_count: "3",
      ordered_website_count: "3",
      related_is_active: "false",
    })
    const orderedAudit = await pool.query(
      `
        SELECT id FROM audit.events
        WHERE target_id = $1 AND event_type = 'quote_item.ordered'
      `,
      [rootQuoteItemId]
    )
    expect(orderedAudit.rowCount).toBe(1)
  })

  test("retains deduplicated, versioned PO sources and exposes the newest file", async () => {
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-22",
      poNumber: `PO-${randomUUID()}`,
    })
    const provider = new PurchaseOrderArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })
    const target = { id: order.id, schema: "sales", table: "purchase_orders" }
    const firstBytes = Buffer.from(`first customer purchase order ${order.id}`)
    const newestBytes = Buffer.from(
      `revised customer purchase order ${order.id}`
    )
    const authorizeTarget =
      (isRetry: boolean) =>
      (client: Parameters<typeof authorizeCommercialOrderArtifactTarget>[0]) =>
        authorizeCommercialOrderArtifactTarget(
          client,
          { organizationId, purchaseOrderId: order.id },
          { requireOpenState: !isRetry }
        )

    try {
      const first = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client, { isRetry }) =>
          authorizeTarget(isRetry)(client),
        bytes: firstBytes,
        fileName: "customer-po-v1.pdf",
        idempotencyKey: `po-source:${order.id}:v1`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "source_po",
        target,
      })
      const repeated = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client, { isRetry }) =>
          authorizeTarget(isRetry)(client),
        bytes: firstBytes,
        fileName: "customer-po-copy.pdf",
        idempotencyKey: `po-source:${order.id}:copy`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "source_po",
        target,
      })
      const newest = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client, { isRetry }) =>
          authorizeTarget(isRetry)(client),
        bytes: newestBytes,
        fileName: "customer-po-v2.pdf",
        idempotencyKey: `po-source:${order.id}:v2`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "source_po",
        target,
      })

      expect(first.providerKey).toBe(repeated.providerKey)
      expect(provider.uploads).toHaveLength(2)
      expect(
        await artifacts.listHistory({
          organizationId,
          purpose: "source_po",
          target,
        })
      ).toMatchObject([
        { fileName: "customer-po-v2.pdf", isCurrent: true, version: 3 },
        {
          fileName: "customer-po-copy.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 2,
        },
        {
          fileName: "customer-po-v1.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      await expect(
        repository.getPurchaseOrderFile(order.id)
      ).resolves.toMatchObject({
        byteSize: newestBytes.byteLength,
        fileName: "customer-po-v2.pdf",
        mediaType: "application/pdf",
        publicUrl: newest.publicUrl,
      })
      expect((await repository.getPurchaseOrder(order.id)).fileName).toBe(
        "customer-po-v2.pdf"
      )
    } finally {
      await artifacts.close()
    }
  })

  test("keeps legacy local PO source metadata downloadable", async () => {
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-22",
      poNumber: `PO-${randomUUID()}`,
    })
    const sourceId = randomUUID()
    const storageKey = `attachments/purchase-orders/${order.id}/${sourceId}/legacy-po.pdf`
    await repository.recordPurchaseOrderFile({
      byteSize: 12,
      fileName: "legacy-po.pdf",
      mediaType: "application/pdf",
      purchaseOrderId: order.id,
      sha256: "abc123",
      sourceId,
      storageKey,
    })

    await expect(repository.getPurchaseOrderFile(order.id)).resolves.toEqual({
      byteSize: 12,
      fileName: "legacy-po.pdf",
      mediaType: "application/pdf",
      publicUrl: null,
      sha256: "abc123",
      storageKey,
    })
  })

  test("keeps our price or creates a visible costing revision request", async () => {
    const code = `DIFF-${randomUUID()}`
    const itemId = await createItem(`M-${randomUUID()}`)
    const priorQuoteId = await createSentQuote({
      customerPartCode: code,
      itemId,
      price: 10,
    })
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-21",
      poNumber: `PO-${randomUUID()}`,
    })
    const keepLine = await repository.addPurchaseOrderLine({
      customerPartCode: code,
      currencyCode: "USD",
      lineNumber: 1,
      poPrice: 12,
      purchaseOrderId: order.id,
      quantity: 1,
    })
    const kept = await repository.decidePurchaseOrderLinePrice({
      decision: "Keep Our Price",
      purchaseOrderLineId: keepLine.id,
    })
    expect(kept).toMatchObject({ decision: "Keep Our Price", piPrice: 10 })

    const reviseLine = await repository.addPurchaseOrderLine({
      customerPartCode: code,
      currencyCode: "USD",
      lineNumber: 2,
      poPrice: 12,
      purchaseOrderId: order.id,
      quantity: 1,
    })
    const revision = await repository.decidePurchaseOrderLinePrice({
      decision: "Accept PO Price",
      purchaseOrderLineId: reviseLine.id,
    })
    expect(revision).toMatchObject({
      decision: "Accept PO Price",
      matchStatus: "Pending Costing Revision",
      piPrice: null,
    })
    const requests = await pool.query<{ id: string }>(
      "SELECT id FROM sales.quote_revision_requests WHERE purchase_order_line_id = $1 AND status = 'Open'",
      [reviseLine.id]
    )
    expect(requests.rowCount).toBe(1)
    await expect(
      repository.generateProformaInvoice({ purchaseOrderId: order.id })
    ).rejects.toThrow("completed")

    await pool.query(
      `
        UPDATE sales.quote_items
        SET status = 'Superseded', is_active = false,
          updated_at = now(), row_version = row_version + 1
        WHERE id = $1
      `,
      [priorQuoteId]
    )
    const replacementQuoteId = await createSentQuote({
      customerPartCode: code,
      itemId,
      price: 12,
      revision: 2,
    })
    await expect(
      repository.listResolvableQuoteRevisionRequestIds(replacementQuoteId)
    ).resolves.toEqual([requests.rows[0]!.id])
    const resolved = await repository.resolveQuoteRevisionRequest({
      quoteRevisionRequestId: requests.rows[0]!.id,
      replacementQuoteItemId: replacementQuoteId,
    })
    expect(resolved).toMatchObject({
      decision: "Matched",
      matchStatus: "Matched",
      piPrice: 12,
      quoteItemId: replacementQuoteId,
    })
  })

  test("imports lines atomically and reuses one quote-request enquiry", async () => {
    const artifactCountBefore = (
      await artifactReader.listByOrganization({ organizationId })
    ).length
    const order = await repository.createPurchaseOrder({
      customerId,
      organizationId,
      poDate: "2026-07-21",
      poNumber: `PO-${randomUUID()}`,
    })
    await expect(
      repository.importPurchaseOrderLines({
        purchaseOrderId: order.id,
        rows: [
          {
            customerPartCode: "UNKNOWN-A",
            lineNumber: 1,
            poPrice: 3,
            quantity: 10,
          },
          {
            customerPartCode: "",
            lineNumber: 2,
            poPrice: 3,
            quantity: 10,
          },
        ],
      })
    ).rejects.toThrow("requires")
    expect((await repository.getPurchaseOrder(order.id)).lines).toHaveLength(0)

    const [line] = await repository.importPurchaseOrderLines({
      purchaseOrderId: order.id,
      rows: [
        {
          customerPartCode: `UNKNOWN-${randomUUID()}`,
          description: "A genuinely new product",
          lineNumber: 1,
          poPrice: 3,
          quantity: 10,
        },
      ],
    })
    expect(line).toMatchObject({ matchStatus: "Unmatched" })
    const first = await repository.createQuoteRequestFromPurchaseOrderLine({
      purchaseOrderLineId: line!.id,
    })
    const second = await repository.createQuoteRequestFromPurchaseOrderLine({
      purchaseOrderLineId: line!.id,
    })
    expect(second).toEqual(first)
    expect(
      (await repository.getPurchaseOrder(order.id)).lines[0]
    ).toMatchObject({ matchStatus: "Quote Required" })
    const artifactCountAfter = (
      await artifactReader.listByOrganization({ organizationId })
    ).length
    expect(artifactCountAfter).toBe(artifactCountBefore)
  })

  test("exports every purchase-order report row across stable batches", async () => {
    const canonical = await repository.listPurchaseOrderReportRows("MRMPL")
    const exported = await repository.listPurchaseOrderReportRowsForExport(
      "MRMPL",
      {},
      1
    )

    expect(exported).toEqual(canonical)
    expect(exported.length).toBeGreaterThan(1)
  })
})
