export const pricingInputFields = {
  weight_100_pcs: {
    label: "Piece Weight (gm)",
    scope: "product",
    positive: true,
  },
  casting: { label: "Blank Piece Weight (gm)", scope: "product" },
  burning_loss_percent: {
    label: "Burning Loss (%)",
    scope: "product",
    percent: true,
  },
  rejection_percent: {
    label: "Rejection (%)",
    scope: "product",
    percent: true,
  },
  direct_purchase_price_per_piece: {
    label: "Direct Purchase (INR/piece)",
    scope: "product",
  },
  alloy_premium: { label: "Alloy Premium (INR/kg)", scope: "product" },
  extrusion_cost: { label: "Extrusion Cost (INR/kg)", scope: "product" },
  forging_cost: { label: "Forging Cost (INR/kg)", scope: "product" },
  machining_cost: { label: "Machining (INR/kg)", scope: "product" },
  washing: { label: "Washing (INR/kg)", scope: "product" },
  checking: { label: "Checking (INR/kg)", scope: "product" },
  marking: { label: "Marking (INR/kg)", scope: "product" },
  plating: { label: "Plating (INR/kg)", scope: "product" },
  annealing: { label: "Annealing (INR/kg)", scope: "product" },
  deburring: { label: "Deburring (INR/kg)", scope: "product" },
  buffing: { label: "Buffing (INR/kg)", scope: "product" },
  sealant: { label: "Sealant (INR/kg)", scope: "product" },
  assembly_operation_cost: { label: "Assembly (INR/kg)", scope: "product" },
  overhead_cost: { label: "Overhead (INR/kg)", scope: "product" },
  scrap_rate: { label: "Scrap Rate (INR/kg)", scope: "customer" },
  packing_cost: { label: "Packing (INR/kg)", scope: "customer" },
  shipping_cost: { label: "Shipping (INR/kg)", scope: "customer" },
  purchase_times: { label: "OR / Purchase Times", scope: "customer" },
  profit_percent: { label: "Profit (%)", scope: "customer", percent: true },
  conversion_rate: {
    label: "FX / Conversion Rate",
    scope: "customer",
    positive: true,
  },
} as const

export type PricingInputField = keyof typeof pricingInputFields
export type PricingInputScope = "product" | "customer"
export type PricingInputValues = Partial<Record<PricingInputField, number>>
export type PricingInputUploadRow = {
  scope: PricingInputScope
  id: string
  version: string
  values: PricingInputValues
}
export type PricingInputTemplateRow = PricingInputUploadRow & {
  uid: string
  description: string
  customer: string
  customerPartCode: string
  packageCustomerCode?: string
  quoteNumber?: string
  itemType: string
  pricingMethod: string
  calculatedPrice: number
}

export const pricingInputEntries = Object.entries(pricingInputFields) as Array<
  [PricingInputField, (typeof pricingInputFields)[PricingInputField]]
>

export function validatePricingInput(
  fieldName: string,
  value: unknown,
  scope: PricingInputScope
) {
  const entry = pricingInputEntries.find(([key]) => key === fieldName)
  if (!entry || entry[1].scope !== scope)
    throw new Error("Unsupported pricing input.")
  const field = entry[1]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field.label} must be a non-negative number.`)
  }
  if ("positive" in field && value <= 0)
    throw new Error(`${field.label} must be greater than zero.`)
  if ("percent" in field && fieldName !== "profit_percent" && value > 1) {
    throw new Error(`${field.label} cannot exceed 100%.`)
  }
  return entry[0]
}
