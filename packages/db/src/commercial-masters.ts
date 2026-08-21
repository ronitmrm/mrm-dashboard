import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export const websiteFieldTypes = [
  "material",
  "connections",
  "pressure",
  "temperature",
  "sealant",
] as const

export const commercialTermTypes = [
  "buyer",
  "incoterms",
  "payment_terms",
  "shipment_mode",
  "packaging_terms",
  "currency",
] as const

export type WebsiteFieldType = (typeof websiteFieldTypes)[number]
export type CommercialTermType = (typeof commercialTermTypes)[number]

export const editableCommercialMasterKinds = [
  "commercial_application",
  "commercial_category",
  "commercial_certification",
  "commercial_commercial_term",
  "commercial_machine_type",
  "commercial_material_grade",
  "commercial_material_rate",
  "commercial_packaging",
  "commercial_process",
  "commercial_quote_term",
  "commercial_rod_type",
  "commercial_shipping",
  "commercial_subcategory",
  "commercial_website_field",
] as const

export type EditableCommercialMasterKind =
  (typeof editableCommercialMasterKinds)[number]

type ActiveNamedValue = {
  active: boolean
  name: string
}

export type CommercialMasterSnapshot = {
  applications: Array<{ name: string; sortOrder: number }>
  categories: Array<{ code: string | null; name: string }>
  certifications: Array<{ name: string; sortOrder: number }>
  commercialTerms: Array<ActiveNamedValue & { termType: CommercialTermType }>
  customers: Array<{
    companyName: string
    country: string | null
    customerUid: string
    defaultBuyerName: string | null
    defaultCurrency: string | null
    defaultIncoterms: string | null
    defaultPackagingTerms: string | null
    defaultPaymentTerms: string | null
    defaultShipmentMode: string | null
    email: string | null
    phone: string | null
    status: string
  }>
  machineTypes: Array<{ name: string }>
  materialGrades: Array<{ name: string }>
  materialRates: Array<{
    active: boolean
    alloyPremium: number
    extrusionCost: number
    grade: string
    rodType: string
  }>
  packagingOptions: Array<
    ActiveNamedValue & {
      costBasis: string
      packingCost: number
    }
  >
  processes: Array<{ name: string }>
  quoteTerms: Array<{
    active: boolean
    label: string
    sortOrder: number
    termKey: string
    value: string
  }>
  rodTypes: Array<{ name: string }>
  shippingTerms: Array<
    ActiveNamedValue & {
      shippingCost: number
    }
  >
  subcategories: Array<{
    category: string
    combinationCode: string | null
    name: string
  }>
  websiteFields: Array<{
    fieldType: WebsiteFieldType
    name: string
    sortOrder: number
  }>
}

type NamedKind =
  | "application"
  | "category"
  | "certification"
  | "machineType"
  | "materialGrade"
  | "process"
  | "rodType"
  | "websiteField"

type ActiveKind =
  | "commercialTerm"
  | "materialRate"
  | "packagingOption"
  | "quoteTerm"
  | "shippingTerm"

type MutationContext = {
  actorUserId?: string | null
  organizationId: string
}

type MutationResult = {
  id: string
  inserted: boolean
}

function text(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }
  return normalized
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function number(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

async function audit(
  client: PoolClient,
  input: MutationContext & {
    action: "created" | "updated" | "ignored"
    kind: string
    metadata?: Record<string, unknown>
    targetId: string
    targetSchema: string
    targetTable: string
  }
) {
  await client.query(
    `
      INSERT INTO audit.events (
        organization_id, event_type, target_schema, target_table,
        target_id, actor_user_id, metadata, source_system, source_table,
        source_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'mrm-dashboard',
        'commercial_master_events', $8)
    `,
    [
      input.organizationId,
      `commercial_master.${input.action}`,
      input.targetSchema,
      input.targetTable,
      input.targetId,
      input.actorUserId ?? null,
      { kind: input.kind, ...input.metadata },
      randomUUID(),
    ]
  )
}

async function nextSortOrder(
  client: PoolClient,
  table: string,
  organizationId: string,
  fieldType?: string
) {
  const values: unknown[] = [organizationId]
  const fieldClause = fieldType ? " AND field_key = $2" : ""
  if (fieldType) values.push(fieldType)
  const result = await client.query<{ next_order: number }>(
    `SELECT COALESCE(MAX(${
      table === "catalog.website_field_options" ? "sequence" : "sort_order"
    }), 0) + 1 AS next_order
     FROM ${table}
     WHERE organization_id = $1${fieldClause}`,
    values
  )
  return result.rows[0]!.next_order
}

async function upsertNamedClient(
  client: PoolClient,
  input: MutationContext & {
    code?: string | null
    fieldType?: WebsiteFieldType
    kind: NamedKind
    name: string
    sortOrder?: number | null
  }
): Promise<MutationResult> {
  const name = text(input.name, "Master value")
  const sourceId = randomUUID()
  let result
  const targetSchema = "catalog"
  let targetTable = ""

  if (input.kind === "category") {
    targetTable = "item_categories"
    result = await client.query<MutationResult>(
      `
        INSERT INTO catalog.item_categories (
          organization_id, name, code, created_by_user_id,
          updated_by_user_id, source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, $4, $4, 'mrm-dashboard',
          'design_categories', $5)
        ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
          code = COALESCE(EXCLUDED.code, catalog.item_categories.code),
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now(),
          row_version = catalog.item_categories.row_version + 1
        RETURNING id, (xmax = 0) AS inserted
      `,
      [
        input.organizationId,
        name,
        optionalText(input.code),
        input.actorUserId ?? null,
        sourceId,
      ]
    )
  } else if (input.kind === "application" || input.kind === "certification") {
    targetTable =
      input.kind === "application"
        ? "website_applications"
        : "website_certifications"
    const table = `catalog.${targetTable}`
    const sortOrder =
      input.sortOrder && input.sortOrder > 0
        ? input.sortOrder
        : await nextSortOrder(client, table, input.organizationId)
    result = await client.query<MutationResult>(
      `
        INSERT INTO ${table} (
          organization_id, name, sort_order, created_by_user_id,
          updated_by_user_id, source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, $4, $4, 'mrm-dashboard', $5, $6)
        ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
          sort_order = EXCLUDED.sort_order,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now(),
          row_version = ${table}.row_version + 1
        RETURNING id, (xmax = 0) AS inserted
      `,
      [
        input.organizationId,
        name,
        sortOrder,
        input.actorUserId ?? null,
        targetTable,
        sourceId,
      ]
    )
  } else if (input.kind === "websiteField") {
    targetTable = "website_field_options"
    if (!input.fieldType || !websiteFieldTypes.includes(input.fieldType)) {
      throw new Error("Website field master is invalid.")
    }
    const sortOrder =
      input.sortOrder && input.sortOrder > 0
        ? input.sortOrder
        : await nextSortOrder(
            client,
            "catalog.website_field_options",
            input.organizationId,
            input.fieldType
          )
    result = await client.query<MutationResult>(
      `
        INSERT INTO catalog.website_field_options (
          organization_id, field_key, option_value, label, sequence,
          created_by_user_id, updated_by_user_id, source_system,
          source_table, source_id
        )
        VALUES ($1, $2, $3, $3, $4, $5, $5, 'mrm-dashboard',
          'website_field_options', $6)
        ON CONFLICT (organization_id, field_key, option_value) DO UPDATE SET
          label = EXCLUDED.label,
          sequence = EXCLUDED.sequence,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now(),
          row_version = catalog.website_field_options.row_version + 1
        RETURNING id, (xmax = 0) AS inserted
      `,
      [
        input.organizationId,
        input.fieldType,
        name,
        sortOrder,
        input.actorUserId ?? null,
        sourceId,
      ]
    )
  } else {
    const specs = {
      machineType: {
        sourceTable: "product_machine_types",
        table: "catalog.machine_types",
      },
      materialGrade: {
        sourceTable: "product_grades",
        table: "catalog.material_grades",
      },
      process: {
        sourceTable: "design_processes",
        table: "catalog.design_processes",
      },
      rodType: {
        sourceTable: "product_rod_types",
        table: "catalog.rod_types",
      },
    } as const
    const spec = specs[input.kind]
    targetTable = spec.table.split(".")[1]!
    result = await client.query<MutationResult>(
      `
        INSERT INTO ${spec.table} (
          organization_id, name, created_by_user_id, updated_by_user_id,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, $3, 'mrm-dashboard', $4, $5)
        ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now(),
          row_version = ${spec.table}.row_version + 1
        RETURNING id, (xmax = 0) AS inserted
      `,
      [
        input.organizationId,
        name,
        input.actorUserId ?? null,
        spec.sourceTable,
        sourceId,
      ]
    )
  }

  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "ignored",
    kind: input.kind,
    targetId: row.id,
    targetSchema,
    targetTable,
  })
  return row
}

async function upsertSubcategoryClient(
  client: PoolClient,
  input: MutationContext & {
    category: string
    combinationCode?: string | null
    name: string
    rowNumber?: number
  }
) {
  const categoryName = text(input.category, "Category")
  const name = text(input.name, "Sub category")
  const category = await client.query<{ id: string }>(
    `
      SELECT id FROM catalog.item_categories
      WHERE organization_id = $1 AND lower(name) = lower($2)
    `,
    [input.organizationId, categoryName]
  )
  if (!category.rows[0]) {
    const prefix = input.rowNumber
      ? `Sub Categories row ${input.rowNumber}: `
      : ""
    throw new Error(`${prefix}category "${categoryName}" was not found.`)
  }
  const result = await client.query<MutationResult>(
    `
      INSERT INTO catalog.item_subcategories (
        organization_id, category_id, name, combination_code,
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $3, $4, $5, $5, 'mrm-dashboard',
        'design_subcategories', $6)
      ON CONFLICT (category_id, lower(name)) DO UPDATE SET
        combination_code = COALESCE(
          EXCLUDED.combination_code,
          catalog.item_subcategories.combination_code
        ),
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = catalog.item_subcategories.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      category.rows[0].id,
      name,
      optionalText(input.combinationCode),
      input.actorUserId ?? null,
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: "subcategory",
    targetId: row.id,
    targetSchema: "catalog",
    targetTable: "item_subcategories",
  })
  return row
}

async function resolveGradeAndRod(
  client: PoolClient,
  organizationId: string,
  grade: string,
  rodType: string,
  rowNumber?: number
) {
  const result = await client.query<{
    grade_id: string | null
    rod_type_id: string | null
  }>(
    `
      SELECT
        (SELECT id FROM catalog.material_grades
         WHERE organization_id = $1 AND lower(name) = lower($2)) grade_id,
        (SELECT id FROM catalog.rod_types
         WHERE organization_id = $1 AND lower(name) = lower($3)) rod_type_id
    `,
    [organizationId, grade, rodType]
  )
  const ids = result.rows[0]!
  if (!ids.grade_id || !ids.rod_type_id) {
    const prefix = rowNumber ? `Material Rates row ${rowNumber}: ` : ""
    throw new Error(
      `${prefix}grade "${grade}" and rod type "${rodType}" must exist.`
    )
  }
  return { gradeId: ids.grade_id, rodTypeId: ids.rod_type_id }
}

async function upsertMaterialRateClient(
  client: PoolClient,
  input: MutationContext & {
    active?: boolean
    alloyPremium?: number | null
    extrusionCost?: number | null
    grade: string
    rodType: string
    rowNumber?: number
  }
) {
  const grade = text(input.grade, "Grade")
  const rodType = text(input.rodType, "Rod type")
  const ids = await resolveGradeAndRod(
    client,
    input.organizationId,
    grade,
    rodType,
    input.rowNumber
  )
  const result = await client.query<MutationResult>(
    `
      INSERT INTO sales.material_rates (
        organization_id, material_grade_id, rod_type_id, effective_on,
        rate_per_kg, currency_code, active, alloy_premium, extrusion_cost,
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $3, DATE '1970-01-01', 0, 'INR', $4, $5, $6,
        $7, $7, 'mrm-dashboard', 'quote_material_rates', $8)
      ON CONFLICT (
        organization_id, material_grade_id, rod_type_id
      ) DO UPDATE SET
        active = EXCLUDED.active,
        alloy_premium = EXCLUDED.alloy_premium,
        extrusion_cost = EXCLUDED.extrusion_cost,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = sales.material_rates.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      ids.gradeId,
      ids.rodTypeId,
      input.active ?? true,
      Math.max(0, number(input.alloyPremium)),
      Math.max(0, number(input.extrusionCost)),
      input.actorUserId ?? null,
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: "materialRate",
    targetId: row.id,
    targetSchema: "sales",
    targetTable: "material_rates",
  })
  return row
}

async function upsertCostOptionClient(
  client: PoolClient,
  input: MutationContext & {
    active?: boolean
    amount?: number | null
    kind: "packagingOption" | "shippingTerm"
    name: string
  }
) {
  const name = text(input.name, "Master value")
  const packaging = input.kind === "packagingOption"
  const table = packaging ? "packaging_options" : "shipping_terms"
  const extraColumns = packaging ? ", cost_basis" : ""
  const extraValues = packaging ? ", 'Per 100 pcs'" : ""
  const extraUpdate = packaging ? ", cost_basis = EXCLUDED.cost_basis" : ""
  const result = await client.query<MutationResult>(
    `
      INSERT INTO sales.${table} (
        organization_id, name, amount, active${extraColumns},
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $3, $4${extraValues}, $5, $5, 'mrm-dashboard',
        $6, $7)
      ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
        amount = EXCLUDED.amount,
        active = EXCLUDED.active${extraUpdate},
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = sales.${table}.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      name,
      Math.max(0, number(input.amount)),
      input.active ?? true,
      input.actorUserId ?? null,
      packaging ? "quote_packaging_options" : "quote_shipping_terms",
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: input.kind,
    targetId: row.id,
    targetSchema: "sales",
    targetTable: table,
  })
  return row
}

async function upsertCommercialTermClient(
  client: PoolClient,
  input: MutationContext & {
    active?: boolean
    name: string
    termType: CommercialTermType
  }
) {
  const name = text(input.name, "Commercial term value")
  if (!commercialTermTypes.includes(input.termType)) {
    throw new Error("Unknown commercial term type.")
  }
  const result = await client.query<MutationResult>(
    `
      INSERT INTO sales.commercial_terms (
        organization_id, name, value, active, term_type,
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $2, $3, $4, $5, $5, 'mrm-dashboard',
        'quote_commercial_terms', $6)
      ON CONFLICT (organization_id, term_type, lower(name)) DO UPDATE SET
        value = EXCLUDED.value,
        active = EXCLUDED.active,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = sales.commercial_terms.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      name,
      input.active ?? true,
      input.termType,
      input.actorUserId ?? null,
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: "commercialTerm",
    targetId: row.id,
    targetSchema: "sales",
    targetTable: "commercial_terms",
  })
  return row
}

async function upsertQuoteTermClient(
  client: PoolClient,
  input: MutationContext & {
    active?: boolean
    label: string
    sortOrder?: number | null
    termKey: string
    value: string
  }
) {
  const termKey = text(input.termKey, "Quote term key")
  const label = text(input.label, "Quote term label")
  const value = text(input.value, "Quote term value")
  const result = await client.query<MutationResult>(
    `
      INSERT INTO sales.quote_term_templates (
        organization_id, term_key, label, value, sort_order, active,
        created_by_user_id, updated_by_user_id, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'mrm-dashboard',
        'quote_terms', $8)
      ON CONFLICT (organization_id, lower(term_key)) DO UPDATE SET
        label = EXCLUDED.label,
        value = EXCLUDED.value,
        sort_order = EXCLUDED.sort_order,
        active = EXCLUDED.active,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = sales.quote_term_templates.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      termKey,
      label,
      value,
      input.sortOrder && input.sortOrder > 0 ? input.sortOrder : 100,
      input.active ?? true,
      input.actorUserId ?? null,
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: "quoteTerm",
    targetId: row.id,
    targetSchema: "sales",
    targetTable: "quote_term_templates",
  })
  return row
}

async function upsertCustomerClient(
  client: PoolClient,
  input: MutationContext & CommercialMasterSnapshot["customers"][number]
) {
  const companyName = text(input.companyName, "Company name")
  let customerUid = input.customerUid.trim()
  if (!customerUid) {
    const sequence = await client.query<{ value: string }>(
      `
        INSERT INTO core.number_sequences (
          organization_id, key, current_value, source_system,
          source_table, source_id
        )
        VALUES ($1, 'CUSTOMER_UID', 1, 'mrm-dashboard', 'customers',
          'CUSTOMER_UID')
        ON CONFLICT (organization_id, key) DO UPDATE SET
          current_value = core.number_sequences.current_value + 1,
          updated_at = now()
        RETURNING current_value::text AS value
      `,
      [input.organizationId]
    )
    customerUid = `CUST-${sequence.rows[0]!.value}`
  }
  const result = await client.query<MutationResult>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, status, email,
        phone, country, default_buyer_name, default_incoterms,
        default_payment_terms, default_shipment_mode,
        default_packaging_terms, default_currency, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $14, 'mrm-dashboard', 'customers', $15)
      ON CONFLICT (organization_id, lower(customer_uid)) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        default_buyer_name = COALESCE(
          EXCLUDED.default_buyer_name,
          sales.customers.default_buyer_name
        ),
        default_incoterms = COALESCE(
          EXCLUDED.default_incoterms,
          sales.customers.default_incoterms
        ),
        default_payment_terms = COALESCE(
          EXCLUDED.default_payment_terms,
          sales.customers.default_payment_terms
        ),
        default_shipment_mode = COALESCE(
          EXCLUDED.default_shipment_mode,
          sales.customers.default_shipment_mode
        ),
        default_packaging_terms = COALESCE(
          EXCLUDED.default_packaging_terms,
          sales.customers.default_packaging_terms
        ),
        default_currency = COALESCE(
          EXCLUDED.default_currency,
          sales.customers.default_currency
        ),
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = sales.customers.row_version + 1
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      input.organizationId,
      customerUid,
      companyName,
      input.status.trim() || "Active",
      optionalText(input.email),
      optionalText(input.phone),
      optionalText(input.country),
      optionalText(input.defaultBuyerName),
      optionalText(input.defaultIncoterms),
      optionalText(input.defaultPaymentTerms),
      optionalText(input.defaultShipmentMode),
      optionalText(input.defaultPackagingTerms),
      optionalText(input.defaultCurrency),
      input.actorUserId ?? null,
      randomUUID(),
    ]
  )
  const row = result.rows[0]!
  await audit(client, {
    ...input,
    action: row.inserted ? "created" : "updated",
    kind: "customer",
    targetId: row.id,
    targetSchema: "sales",
    targetTable: "customers",
  })
  return row
}

export function createCommercialMasterRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  const editableQueries = {
    commercial_application:
      "SELECT id, 'commercial_application' kind, name label FROM catalog.website_applications WHERE organization_id = $1",
    commercial_category:
      "SELECT id, 'commercial_category' kind, name label FROM catalog.item_categories WHERE organization_id = $1",
    commercial_certification:
      "SELECT id, 'commercial_certification' kind, name label FROM catalog.website_certifications WHERE organization_id = $1",
    commercial_commercial_term:
      "SELECT id, 'commercial_commercial_term' kind, name label FROM sales.commercial_terms WHERE organization_id = $1",
    commercial_machine_type:
      "SELECT id, 'commercial_machine_type' kind, name label FROM catalog.machine_types WHERE organization_id = $1",
    commercial_material_grade:
      "SELECT id, 'commercial_material_grade' kind, name label FROM catalog.material_grades WHERE organization_id = $1",
    commercial_material_rate: `
      SELECT rate.id, 'commercial_material_rate' kind,
        grade.name || ' / ' || rod.name label
      FROM sales.material_rates rate
      JOIN catalog.material_grades grade ON grade.id = rate.material_grade_id
      JOIN catalog.rod_types rod ON rod.id = rate.rod_type_id
      WHERE rate.organization_id = $1`,
    commercial_packaging:
      "SELECT id, 'commercial_packaging' kind, name label FROM sales.packaging_options WHERE organization_id = $1",
    commercial_process:
      "SELECT id, 'commercial_process' kind, name label FROM catalog.design_processes WHERE organization_id = $1",
    commercial_quote_term:
      "SELECT id, 'commercial_quote_term' kind, label FROM sales.quote_term_templates WHERE organization_id = $1",
    commercial_rod_type:
      "SELECT id, 'commercial_rod_type' kind, name label FROM catalog.rod_types WHERE organization_id = $1",
    commercial_shipping:
      "SELECT id, 'commercial_shipping' kind, name label FROM sales.shipping_terms WHERE organization_id = $1",
    commercial_subcategory:
      "SELECT id, 'commercial_subcategory' kind, name label FROM catalog.item_subcategories WHERE organization_id = $1",
    commercial_website_field:
      "SELECT id, 'commercial_website_field' kind, option_value label FROM catalog.website_field_options WHERE organization_id = $1",
  } as const satisfies Record<EditableCommercialMasterKind, string>

  async function snapshot(organizationId: string) {
    return transaction(pool, async (client) => {
      await client.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
      )
      const applications = await client.query(
        `SELECT name, sort_order FROM catalog.website_applications WHERE organization_id = $1 ORDER BY sort_order, lower(name)`,
        [organizationId]
      )
      const categories = await client.query(
        `SELECT name, code FROM catalog.item_categories WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const certifications = await client.query(
        `SELECT name, sort_order FROM catalog.website_certifications WHERE organization_id = $1 ORDER BY sort_order, lower(name)`,
        [organizationId]
      )
      const commercialTerms = await client.query(
        `SELECT name, term_type, active FROM sales.commercial_terms WHERE organization_id = $1 ORDER BY term_type, lower(name)`,
        [organizationId]
      )
      const customers = await client.query(
        `SELECT customer_uid, company_name, status, email, phone, country,
          default_buyer_name, default_incoterms, default_payment_terms,
          default_shipment_mode, default_packaging_terms, default_currency
         FROM sales.customers
         WHERE organization_id = $1
         ORDER BY lower(customer_uid)`,
        [organizationId]
      )
      const machineTypes = await client.query(
        `SELECT name FROM catalog.machine_types WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const materialGrades = await client.query(
        `SELECT name FROM catalog.material_grades WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const materialRates = await client.query(
        `SELECT grades.name grade, rods.name rod_type, rates.alloy_premium, rates.extrusion_cost, rates.active FROM sales.material_rates rates JOIN catalog.material_grades grades ON grades.id = rates.material_grade_id JOIN catalog.rod_types rods ON rods.id = rates.rod_type_id WHERE rates.organization_id = $1 ORDER BY lower(grades.name), lower(rods.name)`,
        [organizationId]
      )
      const packagingOptions = await client.query(
        `SELECT name, amount, cost_basis, active FROM sales.packaging_options WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const processes = await client.query(
        `SELECT name FROM catalog.design_processes WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const quoteTerms = await client.query(
        `SELECT term_key, label, value, sort_order, active FROM sales.quote_term_templates WHERE organization_id = $1 ORDER BY sort_order, lower(term_key)`,
        [organizationId]
      )
      const rodTypes = await client.query(
        `SELECT name FROM catalog.rod_types WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const shippingTerms = await client.query(
        `SELECT name, amount, active FROM sales.shipping_terms WHERE organization_id = $1 ORDER BY lower(name)`,
        [organizationId]
      )
      const subcategories = await client.query(
        `SELECT categories.name category, subcategories.name, subcategories.combination_code FROM catalog.item_subcategories subcategories JOIN catalog.item_categories categories ON categories.id = subcategories.category_id WHERE subcategories.organization_id = $1 ORDER BY lower(categories.name), lower(subcategories.name)`,
        [organizationId]
      )
      const websiteFields = await client.query(
        `SELECT field_key, option_value, sequence FROM catalog.website_field_options WHERE organization_id = $1 ORDER BY field_key, sequence, lower(option_value)`,
        [organizationId]
      )
      return {
        applications: applications.rows.map((row) => ({
          name: row.name,
          sortOrder: row.sort_order,
        })),
        categories: categories.rows.map((row) => ({
          code: row.code,
          name: row.name,
        })),
        certifications: certifications.rows.map((row) => ({
          name: row.name,
          sortOrder: row.sort_order,
        })),
        commercialTerms: commercialTerms.rows.map((row) => ({
          active: row.active,
          name: row.name,
          termType: row.term_type,
        })),
        customers: customers.rows.map((row) => ({
          companyName: row.company_name,
          country: row.country,
          customerUid: row.customer_uid,
          defaultBuyerName: row.default_buyer_name,
          defaultCurrency: row.default_currency,
          defaultIncoterms: row.default_incoterms,
          defaultPackagingTerms: row.default_packaging_terms,
          defaultPaymentTerms: row.default_payment_terms,
          defaultShipmentMode: row.default_shipment_mode,
          email: row.email,
          phone: row.phone,
          status: row.status,
        })),
        machineTypes: machineTypes.rows.map((row) => ({ name: row.name })),
        materialGrades: materialGrades.rows.map((row) => ({ name: row.name })),
        materialRates: materialRates.rows.map((row) => ({
          active: row.active,
          alloyPremium: Number(row.alloy_premium),
          extrusionCost: Number(row.extrusion_cost),
          grade: row.grade,
          rodType: row.rod_type,
        })),
        packagingOptions: packagingOptions.rows.map((row) => ({
          active: row.active,
          costBasis: row.cost_basis,
          name: row.name,
          packingCost: Number(row.amount),
        })),
        processes: processes.rows.map((row) => ({ name: row.name })),
        quoteTerms: quoteTerms.rows.map((row) => ({
          active: row.active,
          label: row.label,
          sortOrder: row.sort_order,
          termKey: row.term_key,
          value: row.value,
        })),
        rodTypes: rodTypes.rows.map((row) => ({ name: row.name })),
        shippingTerms: shippingTerms.rows.map((row) => ({
          active: row.active,
          name: row.name,
          shippingCost: Number(row.amount),
        })),
        subcategories: subcategories.rows.map((row) => ({
          category: row.category,
          combinationCode: row.combination_code,
          name: row.name,
        })),
        websiteFields: websiteFields.rows.map((row) => ({
          fieldType: row.field_key,
          name: row.option_value,
          sortOrder: row.sequence,
        })),
      } as CommercialMasterSnapshot
    })
  }

  return {
    close,

    async listEditableRows(input: {
      kind: EditableCommercialMasterKind
      organizationId: string
      termType?: CommercialTermType
    }) {
      const filtersCommercialTerm =
        input.kind === "commercial_commercial_term" && input.termType
      const editableQuery = `${editableQueries[input.kind]}${
        filtersCommercialTerm ? " AND term_type = $2" : ""
      }`
      const result = await pool.query<{
        id: string
        kind: EditableCommercialMasterKind
        label: string
      }>(
        `SELECT id, kind, label
         FROM (${editableQuery}) editable_rows
         ORDER BY lower(label), id`,
        filtersCommercialTerm
          ? [input.organizationId, input.termType]
          : [input.organizationId]
      )
      return result.rows
    },

    async importSnapshot(
      input: MutationContext & {
        snapshot: CommercialMasterSnapshot
      }
    ) {
      return transaction(pool, async (client) => {
        let created = 0
        const ignored = 0
        let updated = 0
        const record = (result: MutationResult) => {
          if (result.inserted) created += 1
          else updated += 1
        }

        for (const row of input.snapshot.customers)
          record(await upsertCustomerClient(client, { ...input, ...row }))
        for (const row of input.snapshot.machineTypes)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "machineType",
            })
          )
        for (const row of input.snapshot.materialGrades)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "materialGrade",
            })
          )
        for (const row of input.snapshot.rodTypes)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "rodType",
            })
          )
        for (const row of input.snapshot.categories)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "category",
            })
          )
        for (const [index, row] of input.snapshot.subcategories.entries())
          record(
            await upsertSubcategoryClient(client, {
              ...input,
              ...row,
              rowNumber: index + 1,
            })
          )
        for (const row of input.snapshot.processes)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "process",
            })
          )
        for (const row of input.snapshot.applications)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "application",
            })
          )
        for (const row of input.snapshot.certifications)
          record(
            await upsertNamedClient(client, {
              ...input,
              ...row,
              kind: "certification",
            })
          )
        for (const row of input.snapshot.websiteFields)
          record(
            await upsertNamedClient(client, {
              ...input,
              fieldType: row.fieldType,
              kind: "websiteField",
              name: row.name,
              sortOrder: row.sortOrder,
            })
          )
        for (const [index, row] of input.snapshot.materialRates.entries())
          record(
            await upsertMaterialRateClient(client, {
              ...input,
              ...row,
              rowNumber: index + 1,
            })
          )
        for (const row of input.snapshot.shippingTerms)
          record(
            await upsertCostOptionClient(client, {
              ...input,
              active: row.active,
              amount: row.shippingCost,
              kind: "shippingTerm",
              name: row.name,
            })
          )
        for (const row of input.snapshot.packagingOptions)
          record(
            await upsertCostOptionClient(client, {
              ...input,
              active: row.active,
              amount: row.packingCost,
              kind: "packagingOption",
              name: row.name,
            })
          )
        for (const row of input.snapshot.commercialTerms)
          record(await upsertCommercialTermClient(client, { ...input, ...row }))
        for (const row of input.snapshot.quoteTerms)
          record(await upsertQuoteTermClient(client, { ...input, ...row }))

        return { created, errors: [], ignored, updated }
      })
    },

    async listEditable(organizationId: string) {
      const allMasters = await pool.query<{
        id: string
        kind: string
        label: string
      }>(
        `SELECT id, 'commercial_application' AS kind, name AS label FROM catalog.website_applications WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_category', name FROM catalog.item_categories WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_certification', name FROM catalog.website_certifications WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_machine_type', name FROM catalog.machine_types WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_material_grade', name FROM catalog.material_grades WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_process', name FROM catalog.design_processes WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_rod_type', name FROM catalog.rod_types WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_subcategory', name FROM catalog.item_subcategories WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_website_field', option_value FROM catalog.website_field_options WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_commercial_term', name FROM sales.commercial_terms WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_packaging', name FROM sales.packaging_options WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_quote_term', label FROM sales.quote_term_templates WHERE organization_id = $1
         UNION ALL SELECT id, 'commercial_shipping', name FROM sales.shipping_terms WHERE organization_id = $1
         UNION ALL
           SELECT rate.id, 'commercial_material_rate', grade.name || ' / ' || rod.name
           FROM sales.material_rates rate
           JOIN catalog.material_grades grade ON grade.id = rate.material_grade_id
           JOIN catalog.rod_types rod ON rod.id = rate.rod_type_id
           WHERE rate.organization_id = $1
         ORDER BY kind, label`,
        [organizationId]
      )
      const commercialTerms = await pool.query(
        `SELECT id, name, term_type, active
         FROM sales.commercial_terms
         WHERE organization_id = $1
         ORDER BY term_type, lower(name)`,
        [organizationId]
      )
      const materialRates = await pool.query(
        `SELECT rates.id, grades.name grade, rods.name rod_type, rates.active
         FROM sales.material_rates rates
         JOIN catalog.material_grades grades
           ON grades.id = rates.material_grade_id
         JOIN catalog.rod_types rods ON rods.id = rates.rod_type_id
         WHERE rates.organization_id = $1
         ORDER BY lower(grades.name), lower(rods.name)`,
        [organizationId]
      )
      const packagingOptions = await pool.query(
        `SELECT id, name, active
         FROM sales.packaging_options
         WHERE organization_id = $1
         ORDER BY lower(name)`,
        [organizationId]
      )
      const quoteTerms = await pool.query(
        `SELECT id, term_key, label, active
         FROM sales.quote_term_templates
         WHERE organization_id = $1
         ORDER BY sort_order, lower(term_key)`,
        [organizationId]
      )
      const shippingTerms = await pool.query(
        `SELECT id, name, amount, active
         FROM sales.shipping_terms
         WHERE organization_id = $1
         ORDER BY lower(name)`,
        [organizationId]
      )
      return {
        allMasters: allMasters.rows,
        commercialTerms: commercialTerms.rows.map((row) => ({
          active: row.active as boolean,
          id: row.id as string,
          label: `${row.term_type}: ${row.name}`,
        })),
        materialRates: materialRates.rows.map((row) => ({
          active: row.active as boolean,
          id: row.id as string,
          label: `${row.grade} / ${row.rod_type}`,
        })),
        packagingOptions: packagingOptions.rows.map((row) => ({
          active: row.active as boolean,
          id: row.id as string,
          label: row.name as string,
        })),
        quoteTerms: quoteTerms.rows.map((row) => ({
          active: row.active as boolean,
          id: row.id as string,
          label: `${row.term_key}: ${row.label}`,
        })),
        shippingTerms: shippingTerms.rows.map((row) => ({
          active: row.active,
          id: row.id as string,
          label: row.name as string,
        })),
      }
    },

    async materialRateFor(input: {
      grade: string
      organizationId: string
      rodType: string
    }) {
      const result = await pool.query(
        `
          SELECT rates.active, rates.alloy_premium, rates.extrusion_cost,
            grades.name grade, rods.name rod_type
          FROM sales.material_rates rates
          JOIN catalog.material_grades grades
            ON grades.id = rates.material_grade_id
          JOIN catalog.rod_types rods ON rods.id = rates.rod_type_id
          WHERE rates.organization_id = $1
            AND lower(grades.name) = lower($2)
            AND lower(rods.name) = lower($3)
        `,
        [input.organizationId, input.grade.trim(), input.rodType.trim()]
      )
      const row = result.rows[0]
      return row
        ? {
            active: row.active,
            alloyPremium: Number(row.alloy_premium),
            extrusionCost: Number(row.extrusion_cost),
            grade: row.grade,
            rodType: row.rod_type,
          }
        : null
    },

    setActive(
      input: MutationContext & {
        active: boolean
        id: string
        kind: ActiveKind
      }
    ) {
      const tables = {
        commercialTerm: "commercial_terms",
        materialRate: "material_rates",
        packagingOption: "packaging_options",
        quoteTerm: "quote_term_templates",
        shippingTerm: "shipping_terms",
      } as const
      return transaction(pool, async (client) => {
        const table = tables[input.kind]
        const result = await client.query<{ id: string }>(
          `
            UPDATE sales.${table}
            SET active = $1, updated_by_user_id = $2, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $3 AND organization_id = $4
            RETURNING id
          `,
          [
            input.active,
            input.actorUserId ?? null,
            input.id,
            input.organizationId,
          ]
        )
        if (!result.rows[0]) throw new Error("Commercial master was not found.")
        await audit(client, {
          ...input,
          action: "updated",
          targetId: result.rows[0].id,
          targetSchema: "sales",
          targetTable: table,
        })
      })
    },

    snapshot,

    upsertCommercialTerm(
      input: Parameters<typeof upsertCommercialTermClient>[1]
    ) {
      return transaction(pool, (client) =>
        upsertCommercialTermClient(client, input)
      )
    },
    upsertMaterialRate(input: Parameters<typeof upsertMaterialRateClient>[1]) {
      return transaction(pool, (client) =>
        upsertMaterialRateClient(client, input)
      )
    },
    upsertNamed(input: Parameters<typeof upsertNamedClient>[1]) {
      return transaction(pool, (client) => upsertNamedClient(client, input))
    },
    upsertPackagingOption(
      input: MutationContext & {
        active?: boolean
        name: string
        packingCost?: number | null
      }
    ) {
      return transaction(pool, (client) =>
        upsertCostOptionClient(client, {
          ...input,
          amount: input.packingCost,
          kind: "packagingOption",
        })
      )
    },
    upsertQuoteTerm(input: Parameters<typeof upsertQuoteTermClient>[1]) {
      return transaction(pool, (client) => upsertQuoteTermClient(client, input))
    },
    upsertShippingTerm(
      input: MutationContext & {
        active?: boolean
        name: string
        shippingCost?: number | null
      }
    ) {
      return transaction(pool, (client) =>
        upsertCostOptionClient(client, {
          ...input,
          amount: input.shippingCost,
          kind: "shippingTerm",
        })
      )
    },
    upsertSubcategory(input: Parameters<typeof upsertSubcategoryClient>[1]) {
      return transaction(pool, (client) =>
        upsertSubcategoryClient(client, input)
      )
    },
  }
}
