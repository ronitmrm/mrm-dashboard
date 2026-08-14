"use server"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { createCommercialOrdersRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { validateUserAttachment } from "@/lib/user-attachment-security"

const ordersPath = "/commercial/orders"

function requiredText(formData: FormData, name: string) {
  const value = formData.get(name)
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function optionalText(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(formData: FormData, name: string) {
  const value = Number(requiredText(formData, name))
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

async function withOrders<T>(
  capability: string,
  returnPath: string,
  operation: (
    repository: ReturnType<typeof createCommercialOrdersRepository>,
    actorUserId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, returnPath)
  const repository = createCommercialOrdersRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(repository, session.user.id)
  } finally {
    await repository.close()
  }
}

function normalizedRecord(record: Record<string, unknown>) {
  return new Map(
    Object.entries(record).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]+/g, ""),
      value,
    ])
  )
}

function valueFor(
  record: Map<string, unknown>,
  aliases: string[],
  fallback?: unknown
) {
  for (const alias of aliases) {
    const value = record.get(alias)
    if (value !== undefined && value !== null && String(value).trim()) {
      return value
    }
  }
  return fallback
}

export async function createPurchaseOrderAction(formData: FormData) {
  const order = await withOrders(
    commercialCapabilities.purchaseOrders.write,
    ordersPath,
    (repository, actorUserId) =>
      repository.createPurchaseOrder({
        actorUserId,
        currencyCode: requiredText(formData, "currency_code"),
        customerId: requiredText(formData, "customer_id"),
        notes: optionalText(formData, "notes"),
        organizationId: requiredText(formData, "organization_id"),
        poDate: requiredText(formData, "po_date"),
        poNumber: requiredText(formData, "po_number"),
      })
  )
  redirect(`${ordersPath}/${order.id}`)
}

export async function addPurchaseOrderLineAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.addPurchaseOrderLine({
        actorUserId,
        currencyCode: requiredText(formData, "currency_code"),
        customerPartCode: requiredText(formData, "customer_part_code"),
        description: optionalText(formData, "description"),
        lineNumber: numberValue(formData, "line_number"),
        poPrice: numberValue(formData, "po_price"),
        purchaseOrderId,
        quantity: numberValue(formData, "quantity"),
      })
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function importPurchaseOrderWorkbookAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  const upload = formData.get("workbook")
  if (!(upload instanceof File) || upload.size === 0) {
    throw new Error("workbook is required")
  }
  if (upload.size > 5 * 1024 * 1024) {
    throw new Error("PO workbook must be 5 MB or smaller")
  }
  const workbook = XLSX.read(await upload.arrayBuffer(), { type: "array" })
  const firstSheet = workbook.SheetNames[0]
  const sheet = firstSheet ? workbook.Sheets[firstSheet] : undefined
  if (!sheet) {
    throw new Error("PO workbook does not contain a worksheet")
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  })
  const rows = rawRows.map((raw, index) => {
    const row = normalizedRecord(raw)
    return {
      currencyCode: String(
        valueFor(row, ["currency", "currencycode"], "USD")
      ).trim(),
      customerPartCode: String(
        valueFor(row, [
          "customerpartcode",
          "customercode",
          "partnumber",
          "partno",
          "itemcode",
          "productcode",
        ])
      ).trim(),
      description: String(
        valueFor(row, ["description", "itemdescription", "partdescription"], "")
      ).trim(),
      lineNumber: Number(
        valueFor(row, ["linenumber", "line", "srno", "sno"], index + 1)
      ),
      poPrice: Number(valueFor(row, ["poprice", "unitprice", "price", "rate"])),
      quantity: Number(
        valueFor(row, ["quantity", "qty", "orderquantity", "orderqty"])
      ),
    }
  })
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.importPurchaseOrderLines({
        actorUserId,
        purchaseOrderId,
        rows,
      })
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function uploadPurchaseOrderFileAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  const upload = formData.get("po_file")
  if (!(upload instanceof File) || upload.size === 0) {
    throw new Error("PO source file is required.")
  }
  if (upload.size > 25 * 1024 * 1024) {
    throw new Error("PO source file must be 25 MB or smaller.")
  }
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    async (repository, actorUserId) => {
      const bytes = Buffer.from(await upload.arrayBuffer())
      const { fileName, mediaType } = validateUserAttachment({
        bytes,
        fileName: upload.name,
        purpose: "purchase-order",
      })
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const sourceId = randomUUID()
      const storageKey = path.posix.join(
        "attachments",
        "purchase-orders",
        purchaseOrderId,
        sourceId,
        fileName
      )
      const storageRoot =
        process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
      const filePath = path.join(
        /*turbopackIgnore: true*/ storageRoot,
        ...storageKey.split("/")
      )
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes, { flag: "wx" })
      try {
        await repository.recordPurchaseOrderFile({
          actorUserId,
          byteSize: bytes.byteLength,
          fileName,
          mediaType,
          purchaseOrderId,
          sha256,
          sourceId,
          storageKey,
        })
      } catch (error) {
        await unlink(filePath).catch(() => undefined)
        throw error
      }
    }
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function decidePurchaseOrderLinePriceAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  const decision = requiredText(formData, "decision")
  if (!["Accept PO Price", "Keep Our Price"].includes(decision)) {
    throw new Error("Unsupported price decision")
  }
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.decidePurchaseOrderLinePrice({
        actorUserId,
        comment: optionalText(formData, "comment"),
        decision: decision as "Accept PO Price" | "Keep Our Price",
        purchaseOrderLineId: requiredText(formData, "purchase_order_line_id"),
      })
  )
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function createPoQuoteRequestAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.createQuoteRequestFromPurchaseOrderLine({
        actorUserId,
        purchaseOrderLineId: requiredText(formData, "purchase_order_line_id"),
      })
  )
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
  revalidatePath("/commercial/enquiries")
}

export async function generateProformaInvoiceAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.generateProformaInvoice({
        actorUserId,
        purchaseOrderId,
      })
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function markProformaInvoiceSentAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.markProformaInvoiceSent({
        actorUserId,
        proformaInvoiceId: requiredText(formData, "proforma_invoice_id"),
      })
  )
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}

export async function approveProformaInvoiceAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.approveProformaInvoice({
        actorUserId,
        proformaInvoiceId: requiredText(formData, "proforma_invoice_id"),
      })
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
  revalidatePath("/commercial/products")
  revalidatePath("/commercial/quotes")
}

export async function cancelPurchaseOrderAction(formData: FormData) {
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  await withOrders(
    commercialCapabilities.purchaseOrders.write,
    `${ordersPath}/${purchaseOrderId}`,
    (repository, actorUserId) =>
      repository.cancelPurchaseOrder({
        actorUserId,
        purchaseOrderId,
        reason: optionalText(formData, "reason"),
      })
  )
  revalidatePath(ordersPath)
  revalidatePath(`${ordersPath}/${purchaseOrderId}`)
}
