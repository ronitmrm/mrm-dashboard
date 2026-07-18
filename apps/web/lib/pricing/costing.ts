export type ProductCostingInput = {
  weight100Pcs: number
  casting: number
  machiningCost: number
  washing: number
  checking: number
  marking: number
  plating: number
  annealing: number
  deburring: number
  buffing: number
  sealant: number
  assemblyOperationCost: number
  overheadCost: number
  rejectionPercent: number
  burningLossPercent: number
}

export type QuoteCostingInput = {
  scrapRate: number
  alloyPremium: number
  extCost: number
  forgingCost: number
  packingCost: number
  shippingCost: number
  overheadCost: number
  purchaseTimes: number
  profitPercent: number
  conversionRate: number
  assembledPartInr: number
}

export type CostingResult = {
  piecesPerKg: number
  netRateWithoutAlloy: number
  netRateWithAlloy: number
  scrapRatePerGm: number
  rawMaterialCost: number
  scrapReturn: number
  scrapReturnPriceIncludingBurningLoss: number
  scrapReturnPrice: number
  totalRodsCost: number
  rejectionCost: number
  processCost: number
  totalA: number
  profitB: number
  totalAPlusB: number
  rateInr: number
  totalRateInr: number
  rateUsd: number
}

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0)

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
    quote.shippingCost +
    quote.overheadCost
  const totalA = processCost + totalRodsCost + rejectionCost
  const profitB = totalA * quote.profitPercent
  const totalAPlusB = totalA + profitB
  const rateInr = piecesPerKg > 0 ? totalAPlusB / piecesPerKg : 0
  const totalRateInr = rateInr + quote.assembledPartInr
  const rateUsd =
    quote.conversionRate > 0 ? totalRateInr / quote.conversionRate : 0

  return {
    piecesPerKg: safeNumber(piecesPerKg),
    netRateWithoutAlloy: safeNumber(netRateWithoutAlloy),
    netRateWithAlloy: safeNumber(netRateWithAlloy),
    scrapRatePerGm: safeNumber(scrapRatePerGm),
    rawMaterialCost: safeNumber(rawMaterialCost),
    scrapReturn: safeNumber(scrapReturn),
    scrapReturnPriceIncludingBurningLoss: safeNumber(
      scrapReturnPriceIncludingBurningLoss
    ),
    scrapReturnPrice: safeNumber(scrapReturnPrice),
    totalRodsCost: safeNumber(totalRodsCost),
    rejectionCost: safeNumber(rejectionCost),
    processCost: safeNumber(processCost),
    totalA: safeNumber(totalA),
    profitB: safeNumber(profitB),
    totalAPlusB: safeNumber(totalAPlusB),
    rateInr: safeNumber(rateInr),
    totalRateInr: safeNumber(totalRateInr),
    rateUsd: safeNumber(rateUsd),
  }
}

export function toPercent(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num / 100 : 0
}

export function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  const num = Number(value ?? fallback)
  return Number.isFinite(num) ? num : fallback
}

export function money(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0)
}

export function finalPrice(value: number) {
  return money(value, 4)
}

export function currencyAmount(
  value: number,
  currency: string | null | undefined,
  digits = 4
) {
  const code = currency || "USD"
  return `${code} ${money(value, digits)}`
}
