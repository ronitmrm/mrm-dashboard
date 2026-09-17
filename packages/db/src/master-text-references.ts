import type { PoolClient } from "pg"

type TextReference = {
  table: string
  column: string
  key?: string
  list?: boolean
  condition?: string
}

// These are current selections stored by name. Issued documents, price snapshots
// and production/inspection evidence deliberately do not belong in this list.
const productReferences = {
  commercial_machine_type: [
    { table: "catalog.machines", column: "source_payload", key: "machineType" },
    { table: "manufacturing.operation_setups", column: "source_payload", key: "machineType" },
  ],
  commercial_rod_size: [
    { table: "catalog.items", column: "rod_size" },
    { table: "sales.design_bom_lines", column: "rod_size" },
    { table: "sales.design_tasks", column: "internal_part_size" },
    { table: "catalog.website_product_profiles", column: "size" },
  ],
  commercial_material_grade: [{ table: "sales.design_bom_lines", column: "grade" }],
  commercial_rod_type: [{ table: "sales.design_bom_lines", column: "rod_type" }],
  commercial_process: [
    { table: "sales.design_tasks", column: "manufacturing_process" },
    { table: "sales.design_bom_lines", column: "manufacturing_process" },
  ],
  commercial_category: [
    { table: "catalog.items", column: "source_payload", key: "category" },
    { table: "sales.design_tasks", column: "internal_part_category" },
    { table: "catalog.website_product_profiles", column: "category" },
  ],
  commercial_subcategory: [
    { table: "catalog.items", column: "source_payload", key: "subcategory",
      condition: "lower(btrim(source_payload->>'category')) = lower(btrim($4))" },
    { table: "sales.design_tasks", column: "internal_part_sub_category",
      condition: "lower(btrim(internal_part_category)) = lower(btrim($4))" },
    { table: "catalog.website_product_profiles", column: "sub_category",
      condition: "lower(btrim(category)) = lower(btrim($4))" },
  ],
  commercial_application: [{ table: "catalog.website_product_profiles", column: "applications", list: true }],
  commercial_certification: [{ table: "catalog.website_product_profiles", column: "certifications", list: true }],
  commercial_packaging: [{ table: "sales.quote_items", column: "packaging", condition: "sent_at IS NULL" }],
  commercial_shipping: [{ table: "sales.quote_items", column: "shipping_terms", condition: "sent_at IS NULL" }],
} satisfies Record<string, TextReference[]>

const commercialTermColumns: Record<string, { enquiry: string; customer?: string }> = {
  buyer: { enquiry: "buyer_name", customer: "default_buyer_name" },
  incoterms: { enquiry: "incoterms", customer: "default_incoterms" },
  payment_terms: { enquiry: "payment_terms", customer: "default_payment_terms" },
  shipment_mode: { enquiry: "shipment_mode", customer: "default_shipment_mode" },
  packaging_terms: { enquiry: "packaging_terms", customer: "default_packaging_terms" },
  currency: { enquiry: "currency", customer: "default_currency" },
  brass_material_specs: { enquiry: "brass_material_specs" },
  reports: { enquiry: "reports" },
  taxes_and_duties: { enquiry: "taxes_and_duties" },
}

export async function masterTextReferences(
  client: PoolClient,
  kind: string,
  source: Record<string, unknown>
) {
  let references: TextReference[] = kind in productReferences
    ? productReferences[kind as keyof typeof productReferences] : []
  if (kind === "commercial_website_field" &&
      ["material", "connections", "pressure", "temperature", "sealant"].includes(String(source.field_key))) {
    references = [{ table: "catalog.website_product_profiles", column: String(source.field_key) }]
  }
  if (kind === "commercial_commercial_term") {
    const columns = commercialTermColumns[String(source.term_type)]
    if (columns) references = [
      { table: "sales.enquiries", column: columns.enquiry },
      ...(columns.customer ? [{ table: "sales.customers", column: columns.customer }] : []),
    ]
  }
  const category = kind === "commercial_subcategory"
    ? (await client.query<{ name: string }>("SELECT name FROM catalog.item_categories WHERE id = $1", [source.category_id])).rows[0]?.name
    : null
  return { references, category: category ?? null, name: String(source.option_value ?? source.name ?? "") }
}

export async function applyMasterTextReferences(
  client: PoolClient,
  organizationId: string,
  links: Awaited<ReturnType<typeof masterTextReferences>>,
  replacementName?: string
) {
  let usageCount = 0
  for (const reference of links.references) {
    // Table/column/key identifiers come exclusively from the allowlist above.
    const value = reference.key
      ? `COALESCE(${reference.column}->'payload'->>'${reference.key}', ${reference.column}->>'${reference.key}')` : reference.column
    const parentCondition = replacementName === undefined
      ? reference.condition?.replaceAll("$4", "$3") : reference.condition
    const matches = reference.list
      ? `EXISTS (SELECT 1 FROM unnest(string_to_array(${value}, ';')) entry WHERE lower(btrim(entry)) = lower(btrim($2)))`
      : `lower(btrim(${value})) = lower(btrim($2))`
    const condition = `organization_id = $1 AND ${matches}
      ${parentCondition ? `AND (${parentCondition})` : ""}`
    const values = [organizationId, links.name,
      ...(replacementName === undefined ? [] : [replacementName]),
      ...(reference.condition?.includes("$4") ? [links.category] : [])]
    if (replacementName === undefined) {
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${reference.table} WHERE ${condition}`, values
      )
      usageCount += Number(count.rows[0]?.count ?? 0)
    } else {
      const next = reference.list
        ? `(SELECT string_agg(token, '; ' ORDER BY first_position) FROM (
             SELECT CASE WHEN lower(btrim(entry)) = lower(btrim($2)) THEN $3 ELSE btrim(entry) END AS token,
               min(position) AS first_position
             FROM unnest(string_to_array(${value}, ';')) WITH ORDINALITY AS tokens(entry, position)
             WHERE btrim(entry) <> '' GROUP BY 1
           ) selected)`
        : reference.key
        ? `CASE WHEN jsonb_typeof(${reference.column}->'payload') = 'object'
             THEN jsonb_set(${reference.column}, '{payload,${reference.key}}', to_jsonb($3::text))
             ELSE jsonb_set(${reference.column}, '{${reference.key}}', to_jsonb($3::text)) END` : "$3"
      await client.query(
        `UPDATE ${reference.table} SET ${reference.column} = ${next}, updated_at = now(), row_version = row_version + 1
         WHERE ${condition}`, values
      )
    }
  }
  return usageCount
}
