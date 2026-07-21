import {
  calculateCosting,
  type CostingResult,
  type ProductCostingInput,
  type QuoteCostingInput,
} from "@workspace/db/pricing-calculation"

export { calculateCosting }
export type { CostingResult, ProductCostingInput, QuoteCostingInput }

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
