// Current screens resolve codes through permanent IDs. Saved source payloads
// and issued snapshots retain their original evidence after a rename.
const sourceLinks = [
  ["work_orders", "manufacturing.work_orders record", "record.item_id"],
  [
    "raw_material_receipts",
    "manufacturing.raw_material_receipts record JOIN manufacturing.work_orders work_order ON work_order.organization_id = record.organization_id AND lower(work_order.job_card_number) = lower(record.job_card_number)",
    "work_order.item_id",
  ],
  ["route_options", "manufacturing.route_options record", "record.item_id"],
  [
    "operation_setups",
    "manufacturing.operation_setups record JOIN manufacturing.route_options route ON route.id = record.route_option_id",
    "route.item_id",
  ],
  [
    "operation_cycle_standards",
    "manufacturing.operation_cycle_standards record JOIN manufacturing.operation_setups setup ON setup.id = record.operation_setup_id JOIN manufacturing.route_options route ON route.id = setup.route_option_id",
    "route.item_id",
  ],
  [
    "operation_tooling",
    "manufacturing.operation_tooling record JOIN manufacturing.operation_setups setup ON setup.id = record.operation_setup_id JOIN manufacturing.route_options route ON route.id = setup.route_option_id",
    "route.item_id",
  ],
  [
    "parameter_definitions",
    "quality.parameter_definitions record",
    "record.item_id",
  ],
] as const

export const currentPartSourceJoins = `
  LEFT JOIN LATERAL (
    ${sourceLinks
      .map(
        ([table, from, itemId]) => `
      SELECT ${itemId} AS item_id FROM ${from}
      WHERE source.source_table = '${table}' AND record.organization_id = $1
        AND record.source_id = source.source_id
    `
      )
      .join(" UNION ALL ")}
  ) part_link ON true
  LEFT JOIN catalog.items current_part
    ON current_part.id = part_link.item_id AND current_part.organization_id = $1
`

const payload =
  "CASE WHEN jsonb_typeof(source.source_payload->'payload') = 'object' THEN source.source_payload->'payload' ELSE source.source_payload END"
const correctedPayload = `(${payload}) || jsonb_strip_nulls(jsonb_build_object(
  'partNo', CASE WHEN (${payload}) ? 'partNo' THEN current_part.uid END,
  'partCode', CASE WHEN (${payload}) ? 'partCode' THEN current_part.uid END
))`

export const currentPartSourcePayload = `CASE
  WHEN current_part.id IS NULL THEN source.source_payload
  WHEN jsonb_typeof(source.source_payload->'payload') = 'object'
    THEN jsonb_set(source.source_payload, '{payload}', ${correctedPayload})
  ELSE ${correctedPayload} END`
