export type ProductCostingInput = {
  annealing: number
  assemblyOperationCost: number
  buffing: number
  burningLossPercent: number
  casting: number
  checking: number
  deburring: number
  machiningCost: number
  marking: number
  overheadCost: number
  plating: number
  rejectionPercent: number
  sealant: number
  washing: number
  weight100Pcs: number
}

export type QuoteCostingInput = {
  alloyPremium: number
  assembledPartInr: number
  conversionRate: number
  extCost: number
  forgingCost: number
  packingCost: number
  profitPercent: number
  purchaseTimes: number
  scrapRate: number
  shippingCost: number
}

export type ProductProcessCostInput = Pick<
  ProductCostingInput,
  | "annealing"
  | "assemblyOperationCost"
  | "buffing"
  | "checking"
  | "deburring"
  | "machiningCost"
  | "marking"
  | "overheadCost"
  | "plating"
  | "sealant"
  | "washing"
  | "weight100Pcs"
>

export type ProductBaseCostInput = ProductProcessCostInput & {
  componentCostPerPiece: number
  directPurchasePricePerPiece?: number
  isBomParent: boolean
  pricingMethod: string
}

export type PackageQuoteCostingInput = Pick<
  QuoteCostingInput,
  "conversionRate" | "packingCost" | "profitPercent" | "shippingCost"
>

export type CostingResult = {
  netRateWithAlloy: number
  netRateWithoutAlloy: number
  piecesPerKg: number
  processCost: number
  profitB: number
  rateInr: number
  rateUsd: number
  rawMaterialCost: number
  rejectionCost: number
  scrapRatePerGm: number
  scrapReturn: number
  scrapReturnPrice: number
  scrapReturnPriceIncludingBurningLoss: number
  totalA: number
  totalAPlusB: number
  totalRateInr: number
  totalRodsCost: number
}

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0)

export type BomPieceWeightComponent = {
  components?: readonly BomPieceWeightComponent[]
  pieceWeightGrams: number
  quantity: number
}

export function calculateBomPieceWeight(
  components: readonly BomPieceWeightComponent[]
): number {
  return safeNumber(
    components.reduce((total, component) => {
      const unitWeight = component.components?.length
        ? calculateBomPieceWeight(component.components)
        : safeNumber(component.pieceWeightGrams)
      return total + safeNumber(component.quantity) * unitWeight
    }, 0)
  )
}

export function isForgingCostApplicable(productType?: string | null) {
  const normalized = productType?.trim().toLowerCase()
  return (
    normalized === "casting" ||
    normalized === "forging" ||
    normalized === "forged"
  )
}

export function calculateProductProcessCost(product: ProductProcessCostInput) {
  const piecesPerKg = product.weight100Pcs > 0 ? 1000 / product.weight100Pcs : 0
  const processCostPerKg =
    product.machiningCost +
    product.washing +
    product.checking +
    product.marking +
    product.plating +
    product.annealing +
    product.deburring +
    product.buffing +
    product.sealant +
    product.assemblyOperationCost +
    product.overheadCost
  const processCostPerPiece =
    piecesPerKg > 0 ? processCostPerKg / piecesPerKg : 0

  return {
    piecesPerKg: safeNumber(piecesPerKg),
    processCostPerKg: safeNumber(processCostPerKg),
    processCostPerPiece: safeNumber(processCostPerPiece),
  }
}

export function calculateProductBaseCost(product: ProductBaseCostInput) {
  if (product.pricingMethod.trim().toLowerCase() === "direct purchase") {
    return safeNumber(product.directPurchasePricePerPiece ?? 0)
  }
  const processCost = calculateProductProcessCost(product).processCostPerPiece
  return safeNumber(
    processCost + (product.isBomParent ? product.componentCostPerPiece : 0)
  )
}

export type StoredProductCostingInput = {
  baseCostPerPiece: number
  conversionRate: number
  packingCostPerKg: number
  piecesPerKg: number
  profitPercent: number
  rejectionPercent: number
  shippingCostPerKg: number
}

export function calculateStoredProductCosting(
  input: StoredProductCostingInput
) {
  const packingCostPerPiece =
    input.piecesPerKg > 0 ? input.packingCostPerKg / input.piecesPerKg : 0
  const shippingCostPerPiece =
    input.piecesPerKg > 0 ? input.shippingCostPerKg / input.piecesPerKg : 0
  const rejectionCost = input.baseCostPerPiece * input.rejectionPercent
  const totalA =
    input.baseCostPerPiece +
    rejectionCost +
    packingCostPerPiece +
    shippingCostPerPiece
  const profitB = totalA * input.profitPercent
  const totalAPlusB = totalA + profitB
  const rateUsd =
    input.conversionRate > 0 ? totalAPlusB / input.conversionRate : 0

  return {
    baseCostPerPiece: safeNumber(input.baseCostPerPiece),
    packingCostPerPiece: safeNumber(packingCostPerPiece),
    piecesPerKg: safeNumber(input.piecesPerKg),
    profitB: safeNumber(profitB),
    rateInr: safeNumber(totalAPlusB),
    rateUsd: safeNumber(rateUsd),
    rejectionCost: safeNumber(rejectionCost),
    shippingCostPerPiece: safeNumber(shippingCostPerPiece),
    totalA: safeNumber(totalA),
    totalAPlusB: safeNumber(totalAPlusB),
  }
}

export function calculateStoredProductRevisionCosting(
  input: StoredProductCostingInput & { targetPriceUsd?: number }
) {
  const current = calculateStoredProductCosting(input)
  const profitPercent =
    input.targetPriceUsd !== undefined && current.totalA > 0
      ? (input.targetPriceUsd * input.conversionRate - current.totalA) /
        current.totalA
      : input.profitPercent
  const revised = calculateStoredProductCosting({
    ...input,
    profitPercent,
  })

  return {
    ...revised,
    profitPercent: safeNumber(profitPercent),
  }
}

export type PackageRevisionCostingFromBaseInput = {
  childQuoteTotal: number
  conversionRate: number
  packingCostPerKg: number
  piecesPerKg: number
  processCostPerPiece: number
  profitPercent: number
  rejectionPercent: number
  shippingCostPerKg: number
  targetPriceUsd?: number
}

export function calculatePackageRevisionCostingFromBase(
  input: PackageRevisionCostingFromBaseInput
) {
  const parentPackingCostPerPiece =
    input.piecesPerKg > 0 ? input.packingCostPerKg / input.piecesPerKg : 0
  const parentShippingCostPerPiece =
    input.piecesPerKg > 0 ? input.shippingCostPerKg / input.piecesPerKg : 0
  const rejectionCost = input.processCostPerPiece * input.rejectionPercent
  const totalA =
    input.processCostPerPiece +
    rejectionCost +
    parentPackingCostPerPiece +
    parentShippingCostPerPiece
  const profitPercent =
    input.targetPriceUsd !== undefined && totalA > 0
      ? (input.targetPriceUsd * input.conversionRate -
          input.childQuoteTotal -
          totalA) /
        totalA
      : input.profitPercent
  const profitB = totalA * profitPercent
  const totalAPlusB = totalA + profitB
  const totalRateInr = input.childQuoteTotal + totalAPlusB
  const rateUsd =
    input.conversionRate > 0 ? totalRateInr / input.conversionRate : 0

  return {
    childQuoteTotal: safeNumber(input.childQuoteTotal),
    packageProcessCostPerPiece: safeNumber(input.processCostPerPiece),
    parentPackingCostPerPiece: safeNumber(parentPackingCostPerPiece),
    parentShippingCostPerPiece: safeNumber(parentShippingCostPerPiece),
    piecesPerKg: safeNumber(input.piecesPerKg),
    processCostPerKg: safeNumber(
      input.processCostPerPiece * input.piecesPerKg
    ),
    profitB: safeNumber(profitB),
    profitPercent: safeNumber(profitPercent),
    rateInr: safeNumber(totalAPlusB),
    rateUsd: safeNumber(rateUsd),
    rejectionCost: safeNumber(rejectionCost),
    totalA: safeNumber(totalA),
    totalAPlusB: safeNumber(totalAPlusB),
    totalRateInr: safeNumber(totalRateInr),
  }
}

export function calculatePackageCosting(
  product: ProductProcessCostInput &
    Pick<ProductCostingInput, "rejectionPercent">,
  quote: PackageQuoteCostingInput,
  childQuoteTotal: number
) {
  const process = calculateProductProcessCost(product)
  const calculated = calculatePackageRevisionCostingFromBase({
    childQuoteTotal,
    conversionRate: quote.conversionRate,
    packingCostPerKg: quote.packingCost,
    piecesPerKg: process.piecesPerKg,
    processCostPerPiece: process.processCostPerPiece,
    profitPercent: quote.profitPercent,
    rejectionPercent: product.rejectionPercent,
    shippingCostPerKg: quote.shippingCost,
  })

  return {
    ...calculated,
    processCostPerKg: process.processCostPerKg,
  }
}

export function calculateCosting(
  product: ProductCostingInput,
  quote: QuoteCostingInput
): CostingResult {
  const piecesPerKg = product.weight100Pcs > 0 ? 1000 / product.weight100Pcs : 0
  const blankToFinishedWeightRatio =
    product.weight100Pcs > 0 ? product.casting / product.weight100Pcs : 0
  const netRateWithoutAlloy =
    quote.scrapRate + quote.extCost + quote.forgingCost
  const netRateWithAlloy =
    quote.scrapRate + quote.alloyPremium + quote.extCost + quote.forgingCost
  const scrapRatePerGm = netRateWithoutAlloy / 1000
  const rawMaterialCost =
    quote.purchaseTimes * netRateWithAlloy +
    (blankToFinishedWeightRatio - quote.purchaseTimes) * netRateWithoutAlloy
  const scrapReturn = blankToFinishedWeightRatio - 1
  const scrapReturnPriceIncludingBurningLoss =
    quote.scrapRate * (1 - product.burningLossPercent)
  const scrapReturnPrice = scrapReturn * scrapReturnPriceIncludingBurningLoss
  const totalRodsCost = rawMaterialCost - scrapReturnPrice
  const rejectionCost = totalRodsCost * product.rejectionPercent
  const processCost =
    product.machiningCost +
    product.washing +
    product.checking +
    product.marking +
    product.plating +
    product.annealing +
    product.deburring +
    product.buffing +
    product.sealant +
    product.assemblyOperationCost +
    product.overheadCost +
    quote.packingCost +
    quote.shippingCost
  const totalA = processCost + totalRodsCost + rejectionCost
  const profitB = totalA * quote.profitPercent
  const totalAPlusB = totalA + profitB
  const rateInr = piecesPerKg > 0 ? totalAPlusB / piecesPerKg : 0
  const totalRateInr = rateInr + quote.assembledPartInr
  const rateUsd =
    quote.conversionRate > 0 ? totalRateInr / quote.conversionRate : 0

  return {
    netRateWithAlloy: safeNumber(netRateWithAlloy),
    netRateWithoutAlloy: safeNumber(netRateWithoutAlloy),
    piecesPerKg: safeNumber(piecesPerKg),
    processCost: safeNumber(processCost),
    profitB: safeNumber(profitB),
    rateInr: safeNumber(rateInr),
    rateUsd: safeNumber(rateUsd),
    rawMaterialCost: safeNumber(rawMaterialCost),
    rejectionCost: safeNumber(rejectionCost),
    scrapRatePerGm: safeNumber(scrapRatePerGm),
    scrapReturn: safeNumber(scrapReturn),
    scrapReturnPrice: safeNumber(scrapReturnPrice),
    scrapReturnPriceIncludingBurningLoss: safeNumber(
      scrapReturnPriceIncludingBurningLoss
    ),
    totalA: safeNumber(totalA),
    totalAPlusB: safeNumber(totalAPlusB),
    totalRateInr: safeNumber(totalRateInr),
    totalRodsCost: safeNumber(totalRodsCost),
  }
}
