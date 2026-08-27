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

export function isForgingCostApplicable(productionType?: string | null) {
  const normalized = productionType?.trim().toLowerCase()
  return normalized === "casting" || normalized === "forging"
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

export function calculatePackageCosting(
  product: ProductProcessCostInput &
    Pick<ProductCostingInput, "rejectionPercent">,
  quote: PackageQuoteCostingInput,
  childQuoteTotal: number
) {
  const process = calculateProductProcessCost(product)
  const parentPackingCostPerPiece =
    process.piecesPerKg > 0 ? quote.packingCost / process.piecesPerKg : 0
  const parentShippingCostPerPiece =
    process.piecesPerKg > 0 ? quote.shippingCost / process.piecesPerKg : 0
  const rejectionCost = process.processCostPerPiece * product.rejectionPercent
  const totalA =
    process.processCostPerPiece +
    rejectionCost +
    parentPackingCostPerPiece +
    parentShippingCostPerPiece
  const profitB = totalA * quote.profitPercent
  const totalAPlusB = totalA + profitB
  const totalRateInr = childQuoteTotal + totalAPlusB
  const rateUsd =
    quote.conversionRate > 0 ? totalRateInr / quote.conversionRate : 0

  return {
    childQuoteTotal: safeNumber(childQuoteTotal),
    packageProcessCostPerPiece: process.processCostPerPiece,
    parentPackingCostPerPiece: safeNumber(parentPackingCostPerPiece),
    parentShippingCostPerPiece: safeNumber(parentShippingCostPerPiece),
    piecesPerKg: process.piecesPerKg,
    processCostPerKg: process.processCostPerKg,
    profitB: safeNumber(profitB),
    rateInr: safeNumber(totalAPlusB),
    rateUsd: safeNumber(rateUsd),
    rejectionCost: safeNumber(rejectionCost),
    totalA: safeNumber(totalA),
    totalAPlusB: safeNumber(totalAPlusB),
    totalRateInr: safeNumber(totalRateInr),
  }
}

export function calculateCosting(
  product: ProductCostingInput,
  quote: QuoteCostingInput
): CostingResult {
  const piecesPerKg = product.weight100Pcs > 0 ? 1000 / product.weight100Pcs : 0
  const netRateWithoutAlloy =
    quote.scrapRate + quote.extCost + quote.forgingCost
  const netRateWithAlloy =
    quote.scrapRate + quote.alloyPremium + quote.extCost + quote.forgingCost
  const scrapRatePerGm = netRateWithoutAlloy / 1000
  const rawMaterialCost =
    quote.purchaseTimes * netRateWithAlloy +
    (product.casting - quote.purchaseTimes) * netRateWithoutAlloy
  const scrapReturn = product.casting - 1
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
