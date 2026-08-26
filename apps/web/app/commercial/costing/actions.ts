"use server"

import {
  authorizeQuoteArtifactTarget,
  createArtifactService,
  createCommercialCostingRepository,
  createCommercialOrdersRepository,
  createCommercialWorkflowRepository,
  quotePdfArtifactPurpose,
} from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { optionalText, requiredText } from "@/lib/form-data"
import { buildQuotePdf, loadQuoteMarketContext } from "@/lib/pricing/quote-pdf"
import { createUploadThingArtifactProvider } from "@/lib/uploadthing-artifact-provider"

const customerCostingPath = "/commercial/customer-costing"
const productCostingPath = "/commercial/product-costing"

function numberValue(formData: FormData, name: string, fallback?: number) {
  const raw = optionalText(formData, name)
  if (raw === undefined && fallback !== undefined) {
    return fallback
  }
  const value = Number(raw)
  if (raw === undefined || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

function optionalNumber(formData: FormData, name: string) {
  const raw = optionalText(formData, name)
  if (raw === undefined) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

function repeatedText(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
}

function repeatedNumbers(formData: FormData, name: string) {
  return repeatedText(formData, name).map((raw) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must contain only numbers`)
    }
    return value
  })
}

async function withCosting<T>(
  capability: string,
  returnPath: string,
  operation: (
    repository: ReturnType<typeof createCommercialCostingRepository>,
    actorUserId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, returnPath)
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(repository, session.user.id)
  } finally {
    await repository.close()
  }
}

export async function updateProductCostingAction(formData: FormData) {
  await withCosting(
    commercialTaskCapabilities.updateProductCosting,
    productCostingPath,
    (repository, actorUserId) =>
      repository.updateProductCostParameters({
        action:
          optionalText(formData, "action") === "complete"
            ? "complete"
            : "in_progress",
        actorUserId,
        alloyPremium: optionalNumber(formData, "alloy_premium"),
        annealing: numberValue(formData, "annealing", 0),
        assemblyOperationCost: numberValue(
          formData,
          "assembly_operation_cost",
          0
        ),
        buffing: numberValue(formData, "buffing", 0),
        burningLossPercent:
          numberValue(formData, "burning_loss_percent", 0) / 100,
        checking: numberValue(formData, "checking", 0),
        deburring: numberValue(formData, "deburring", 0),
        directPurchasePricePerKg: numberValue(
          formData,
          "direct_purchase_price_per_kg",
          0
        ),
        extrusionCost: optionalNumber(formData, "extrusion_cost"),
        forgingCost: numberValue(formData, "forging_cost", 0),
        itemId: requiredText(formData, "item_id"),
        machineTypeId: optionalText(formData, "machine_type_id") ?? null,
        machiningCost: numberValue(formData, "machining_cost", 0),
        marking: numberValue(formData, "marking", 0),
        overheadCost: numberValue(formData, "overhead_cost", 0),
        piecesPerKg: optionalNumber(formData, "pieces_per_kg"),
        plating: numberValue(formData, "plating", 0),
        pricingMethod:
          requiredText(formData, "pricing_method") === "Direct Purchase"
            ? "Direct Purchase"
            : "Derived",
        rejectionPercent: numberValue(formData, "rejection_percent", 0) / 100,
        remarks: optionalText(formData, "remarks"),
        sealant: numberValue(formData, "sealant", 0),
        washing: numberValue(formData, "washing", 0),
        weight100Pcs: numberValue(formData, "weight_100_pcs", 0),
      })
  )
  revalidatePath(productCostingPath)
  revalidatePath(customerCostingPath)
  revalidatePath("/commercial/pricing")
}

export async function requestProductCostingDesignClarificationAction(
  formData: FormData
) {
  const session = await requireCapability(
    commercialTaskCapabilities.requestProductCostingClarification,
    productCostingPath
  )
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.requestDesignClarification({
      actorUserId: session.user.id,
      direction: "Product Costing to Design",
      enquiryItemId: requiredText(formData, "enquiry_item_id"),
      message: requiredText(formData, "message"),
    })
  } finally {
    await repository.close()
  }
  revalidatePath(productCostingPath)
  revalidatePath("/commercial/design")
}

export async function saveQuoteAction(formData: FormData) {
  const childIds = repeatedText(formData, "child_item_id")
  const childScrapRates = repeatedNumbers(formData, "child_scrap_rate")
  const childPurchaseTimes = repeatedNumbers(formData, "child_purchase_times")
  const childProfitPercents = repeatedNumbers(formData, "child_profit_percent")
  if (
    ![childScrapRates, childPurchaseTimes, childProfitPercents].every(
      (values) => values.length === childIds.length
    )
  ) {
    throw new Error("Child quote inputs are incomplete")
  }
  const assemblyIds = repeatedText(formData, "assembly_item_id")
  const assemblyProfitPercents = repeatedNumbers(
    formData,
    "assembly_profit_percent"
  )
  if (assemblyIds.length !== assemblyProfitPercents.length) {
    throw new Error("Assembly quote inputs are incomplete")
  }

  await withCosting(
    commercialTaskCapabilities.saveQuote,
    customerCostingPath,
    (repository, actorUserId) =>
      repository.saveQuote({
        action:
          optionalText(formData, "action") === "complete"
            ? "complete"
            : "in_progress",
        actorUserId,
        assemblyProfitPercents: assemblyIds.map((itemId, index) => ({
          itemId,
          profitPercent: (assemblyProfitPercents[index] ?? 0) / 100,
        })),
        childInputs: childIds.map((itemId, index) => ({
          itemId,
          profitPercent: (childProfitPercents[index] ?? 0) / 100,
          purchaseTimes: childPurchaseTimes[index] ?? 1,
          scrapRate: childScrapRates[index] ?? 0,
        })),
        customerPartCode: optionalText(formData, "customer_part_code"),
        enquiryItemId: requiredText(formData, "enquiry_item_id"),
        inputs: {
          conversionRate: numberValue(formData, "conversion_rate", 1),
          packingCost: numberValue(formData, "packing_cost", 0),
          profitPercent: numberValue(formData, "profit_percent", 0) / 100,
          purchaseTimes: numberValue(formData, "purchase_times", 1),
          scrapRate: numberValue(formData, "scrap_rate", 0),
          shippingCost: numberValue(formData, "shipping_cost", 0),
        },
        itemId: requiredText(formData, "item_id"),
        packaging: optionalText(formData, "packaging"),
        quantity: numberValue(formData, "quantity", 0),
        quoteRevisionRequestId: optionalText(
          formData,
          "quote_revision_request_id"
        ),
        shippingTerms: optionalText(formData, "shipping_terms"),
      })
  )
  revalidatePath(customerCostingPath)
  revalidatePath("/commercial/quotes")
}

export async function sendQuoteBackToProductCostingAction(formData: FormData) {
  await withCosting(
    commercialTaskCapabilities.sendQuoteBackToCosting,
    customerCostingPath,
    (repository, actorUserId) =>
      repository.sendQuoteBackToProductCosting({
        actorUserId,
        enquiryId: requiredText(formData, "enquiry_id"),
        itemId: requiredText(formData, "item_id"),
      })
  )
  revalidatePath(productCostingPath)
  revalidatePath(customerCostingPath)
  revalidatePath("/commercial/design")
  revalidatePath("/commercial/quotes")
}

export async function sendQuoteAction(formData: FormData) {
  const quoteItemId = requiredText(formData, "quote_item_id")
  const followupDueOn = requiredText(formData, "followup_due_on")
  const session = await requireCapability(
    commercialTaskCapabilities.sendQuote,
    "/commercial/quotes"
  )
  const environment = readAuthEnvironment()
  const costing = createCommercialCostingRepository({
    connectionString: environment.connectionString,
  })
  const orders = createCommercialOrdersRepository({
    connectionString: environment.connectionString,
  })
  const artifacts = createArtifactService({
    connectionString: environment.connectionString,
    provider: createUploadThingArtifactProvider(),
  })
  try {
    await costing.issueQuote({
      actorUserId: session.user.id,
      followupDueOn,
      quoteItemId,
      storeIssuedPdf: async ({ document, organizationId }) => {
        const market = await loadQuoteMarketContext({
          currency: document.currency,
          fallbackRate: document.conversionRate,
        })
        const bytes = Buffer.from(await buildQuotePdf(document, market))
        const safeEnquiryNumber = document.enquiryNumber
          .replace(/[^A-Za-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
        await artifacts.store({
          actorUserId: session.user.id,
          authorizeTarget: (client, { isRetry }) =>
            authorizeQuoteArtifactTarget(
              client,
              { organizationId, quoteItemId },
              {
                actorUserId: session.user.id,
                requireReadyState: !isRetry,
              }
            ),
          bytes,
          fileName: `${safeEnquiryNumber || "quote"}-Rev-${document.revision}-quote.pdf`,
          idempotencyKey: `issued-quote-pdf:${quoteItemId}`,
          mediaType: "application/pdf",
          organizationId,
          origin: "generated",
          purpose: quotePdfArtifactPurpose,
          target: { id: quoteItemId, schema: "sales", table: "quote_items" },
        })
      },
    })
    const requestIds =
      await orders.listResolvableQuoteRevisionRequestIds(quoteItemId)
    for (const quoteRevisionRequestId of requestIds) {
      await orders.resolveQuoteRevisionRequest({
        actorUserId: session.user.id,
        quoteRevisionRequestId,
        replacementQuoteItemId: quoteItemId,
      })
    }
  } finally {
    await Promise.all([artifacts.close(), costing.close(), orders.close()])
  }
  revalidatePath(customerCostingPath)
  revalidatePath("/commercial/quotes")
  revalidatePath(`/commercial/quotes/${quoteItemId}`)
  revalidatePath("/commercial/sales")
}
