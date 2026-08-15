"use server"

import { createCommercialCostingRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { optionalText, requiredText } from "@/lib/form-data"

const costingPath = "/commercial/costing"


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
    "pricing.costing.write",
    costingPath,
    (repository, actorUserId) =>
      repository.updateProductCostParameters({
        action:
          requiredText(formData, "action") === "complete"
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
  revalidatePath(costingPath)
  revalidatePath("/commercial/products")
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
    "pricing.costing.write",
    costingPath,
    (repository, actorUserId) =>
      repository.saveQuote({
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
          overheadCost: numberValue(formData, "quote_overhead_cost", 0),
          packingCost: numberValue(formData, "packing_cost", 0),
          profitPercent: numberValue(formData, "profit_percent", 0) / 100,
          purchaseTimes: numberValue(formData, "purchase_times", 1),
          scrapRate: numberValue(formData, "scrap_rate", 0),
          shippingCost: numberValue(formData, "shipping_cost", 0),
        },
        itemId: requiredText(formData, "item_id"),
        packaging: optionalText(formData, "packaging"),
        quantity: numberValue(formData, "quantity", 0),
        shippingTerms: optionalText(formData, "shipping_terms"),
      })
  )
  revalidatePath(costingPath)
  revalidatePath("/commercial/quotes")
}

export async function sendQuoteBackToProductCostingAction(formData: FormData) {
  await withCosting(
    commercialCapabilities.costing.write,
    costingPath,
    (repository, actorUserId) =>
      repository.sendQuoteBackToProductCosting({
        actorUserId,
        enquiryId: requiredText(formData, "enquiry_id"),
        itemId: requiredText(formData, "item_id"),
      })
  )
  revalidatePath(costingPath)
  revalidatePath("/commercial/design")
  revalidatePath("/commercial/quotes")
}

export async function sendQuoteAction(formData: FormData) {
  const quoteItemId = requiredText(formData, "quote_item_id")
  await withCosting(
    commercialCapabilities.quotes.write,
    "/commercial/quotes",
    (repository, actorUserId) =>
      repository.sendQuote({ actorUserId, quoteItemId })
  )
  revalidatePath(costingPath)
  revalidatePath("/commercial/quotes")
  revalidatePath(`/commercial/quotes/${quoteItemId}`)
}
