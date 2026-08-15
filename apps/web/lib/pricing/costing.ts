export { calculateCosting } from "@workspace/db/pricing-calculation"

export function money(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0)
}
