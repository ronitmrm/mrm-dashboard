// Shared read-only columns for both customer revision workbenches.
// Product costing inputs prefer the saved quote snapshot; legacy gaps use the Product master.
const fields = {
  Grade: { sql: "grade.name", format: "text" },
  Size: {
    sql: "COALESCE(NULLIF(btrim(profile.size), ''), NULLIF(btrim(item.source_payload ->> 'productSize'), ''), NULLIF(btrim(design.internal_part_size), ''))",
    format: "text",
  },
  "UID Kind": { sql: "item.uid_kind", format: "text" },
  "Product Status": { sql: "item.lifecycle_status", format: "text" },
  "Rod Size": { sql: "item.rod_size", format: "text" },
  "Die Code": { sql: "item.die_code", format: "text" },
  "Rod Type": { sql: "rod.name", format: "text" },
  "Production Type": { sql: "machine.name", format: "text" },
  "List / Package": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'itemType', item.item_type::text)",
    format: "text",
  },
  "Product Type": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'productionType', item.production_type::text)",
    format: "text",
  },
  "Pricing Method": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'pricingMethod', item.pricing_method::text)",
    format: "text",
  },
  "1 Piece Weight (gm)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'weight100Pcs', item.weight_100_pcs::text)",
    format: "number",
  },
  "Pcs/Kg": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'piecesPerKg', item.pieces_per_kg::text)",
    format: "number",
  },
  "Blank Piece Weight (gm)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'casting', item.casting::text)",
    format: "number",
  },
  "Rejection %": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'rejectionPercent', item.rejection_percent::text)",
    format: "percent",
  },
  "Burning Loss %": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'burningLossPercent', item.burning_loss_percent::text)",
    format: "percent",
  },
  "Product Base (INR/pc)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'productCostInr', item.product_cost_inr::text)",
    format: "number",
  },
  "Direct Purchase (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'directPurchasePricePerKg', item.direct_purchase_price_per_kg::text)",
    format: "number",
  },
  "Direct Purchase (INR/pc)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'directPurchasePricePerPiece', item.direct_purchase_price_per_piece::text)",
    format: "number",
  },
  "Alloy Premium (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'alloyPremium', item.alloy_premium::text)",
    format: "number",
  },
  "Extrusion (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'extrusionCost', item.extrusion_cost::text)",
    format: "number",
  },
  "Forging (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'forgingCost', item.forging_cost::text)",
    format: "number",
  },
  "M/C (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'machiningCost', item.machining_cost::text)",
    format: "number",
  },
  "M/C (INR/pc)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'machiningPricePerPiece', item.machining_price_per_piece::text)",
    format: "number",
  },
  "Washing (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'washing', item.washing::text)",
    format: "number",
  },
  "Checking (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'checking', item.checking::text)",
    format: "number",
  },
  "Marking (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'marking', item.marking::text)",
    format: "number",
  },
  "Plating (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'plating', item.plating::text)",
    format: "number",
  },
  "Annealing (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'annealing', item.annealing::text)",
    format: "number",
  },
  "Deburring (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'deburring', item.deburring::text)",
    format: "number",
  },
  "Buffing (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'buffing', item.buffing::text)",
    format: "number",
  },
  "Sealant (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'sealant', item.sealant::text)",
    format: "number",
  },
  "Assembly (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'assemblyOperationCost', item.assembly_operation_cost::text)",
    format: "number",
  },
  "Overhead (INR/kg)": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'overheadCost', item.overhead_cost::text)",
    format: "number",
  },
  "Product Remarks": {
    sql: "COALESCE(snapshot.product_snapshot ->> 'remarks', item.remarks::text)",
    format: "text",
  },
  "Quote Number": { sql: "quote.quote_number", format: "text" },
  "Price Revision": { sql: "quote.revision", format: "number" },
  "Quote Status": { sql: "quote.status", format: "text" },
  Quantity: { sql: "quote.quantity", format: "number" },
  Currency: { sql: "quote.currency_code", format: "text" },
  Packaging: { sql: "quote.packaging", format: "text" },
  "Shipping Terms": { sql: "quote.shipping_terms", format: "text" },
  "Scrap (INR/kg)": { sql: "quote.scrap_rate", format: "number" },
  "Packing (INR/kg)": { sql: "quote.packing_cost", format: "number" },
  "Shipping (INR/kg)": { sql: "quote.shipping_cost", format: "number" },
  "OR / Purchase Times": { sql: "quote.purchase_times", format: "number" },
  "Profit %": { sql: "quote.profit_percent", format: "percent" },
  "FX / Conversion Rate": { sql: "quote.conversion_rate", format: "number" },
  "Total Rate (INR/pc)": { sql: "quote.total_rate_inr", format: "number" },
} as const

export type CustomerRevisionParameters = Record<
  keyof typeof fields,
  string | number | null
>

export const customerRevisionParameterColumns = Object.entries(fields).map(
  ([label, field]) => ({
    label: label as keyof typeof fields,
    format: field.format,
  })
)

export const customerRevisionParametersSql = `jsonb_build_object(${Object.entries(
  fields
)
  .map(([label, field]) => `'${label}', ${field.sql}`)
  .join(", ")} )`

export const customerRevisionParameterJoins = `
  LEFT JOIN sales.quote_product_snapshots snapshot ON snapshot.quote_item_id = quote.id
  LEFT JOIN catalog.material_grades grade ON grade.id = item.material_grade_id
  LEFT JOIN catalog.rod_types rod ON rod.id = item.rod_type_id
  LEFT JOIN catalog.machine_types machine ON machine.id = item.machine_type_id
`
