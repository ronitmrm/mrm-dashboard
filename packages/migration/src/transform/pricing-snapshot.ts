import { Pool, type PoolClient } from "pg"

import { transformPricingFoundation } from "./pricing-foundation"

type TransformPricingSnapshotOptions = {
  connectionString: string
  migrationRunId: string
  organizationCode: string
  transformationVersion: string
}

export type PricingSnapshotTransformationResult = {
  canonicalTables: number
  fileConflicts: number
  hashMatches: number
  relationshipConflicts: number
  sourceMappings: number
  sourceRows: number
  transformedRows: number
}

type TargetMapping = {
  sourceTable: string
  stagingTable: string
  targetSchema: string
  targetTable: string
}

const TARGET_MAPPINGS: TargetMapping[] = [
  {
    sourceTable: "counters",
    stagingTable: "sqlite_counters",
    targetSchema: "core",
    targetTable: "number_sequences",
  },
  {
    sourceTable: "customers",
    stagingTable: "sqlite_customers",
    targetSchema: "sales",
    targetTable: "customers",
  },
  {
    sourceTable: "design_categories",
    stagingTable: "sqlite_design_categories",
    targetSchema: "catalog",
    targetTable: "item_categories",
  },
  {
    sourceTable: "design_processes",
    stagingTable: "sqlite_design_processes",
    targetSchema: "catalog",
    targetTable: "design_processes",
  },
  {
    sourceTable: "design_subcategories",
    stagingTable: "sqlite_design_subcategories",
    targetSchema: "catalog",
    targetTable: "item_subcategories",
  },
  {
    sourceTable: "enquiry_import_reviews",
    stagingTable: "sqlite_enquiry_import_reviews",
    targetSchema: "sales",
    targetTable: "enquiry_import_reviews",
  },
  {
    sourceTable: "enquiry_import_review_rows",
    stagingTable: "sqlite_enquiry_import_review_rows",
    targetSchema: "sales",
    targetTable: "enquiry_import_review_rows",
  },
  {
    sourceTable: "product_grades",
    stagingTable: "sqlite_product_grades",
    targetSchema: "catalog",
    targetTable: "material_grades",
  },
  {
    sourceTable: "product_machine_types",
    stagingTable: "sqlite_product_machine_types",
    targetSchema: "catalog",
    targetTable: "machine_types",
  },
  {
    sourceTable: "product_rod_types",
    stagingTable: "sqlite_product_rod_types",
    targetSchema: "catalog",
    targetTable: "rod_types",
  },
  {
    sourceTable: "quote_commercial_terms",
    stagingTable: "sqlite_quote_commercial_terms",
    targetSchema: "sales",
    targetTable: "commercial_terms",
  },
  {
    sourceTable: "quote_material_rates",
    stagingTable: "sqlite_quote_material_rates",
    targetSchema: "sales",
    targetTable: "material_rates",
  },
  {
    sourceTable: "quote_packaging_options",
    stagingTable: "sqlite_quote_packaging_options",
    targetSchema: "sales",
    targetTable: "packaging_options",
  },
  {
    sourceTable: "quote_shipping_terms",
    stagingTable: "sqlite_quote_shipping_terms",
    targetSchema: "sales",
    targetTable: "shipping_terms",
  },
  {
    sourceTable: "website_applications",
    stagingTable: "sqlite_website_applications",
    targetSchema: "catalog",
    targetTable: "website_applications",
  },
  {
    sourceTable: "website_certifications",
    stagingTable: "sqlite_website_certifications",
    targetSchema: "catalog",
    targetTable: "website_certifications",
  },
  {
    sourceTable: "website_field_options",
    stagingTable: "sqlite_website_field_options",
    targetSchema: "catalog",
    targetTable: "website_field_options",
  },
]

const TRANSFORM_STATEMENTS = [
  `
    INSERT INTO core.number_sequences (
      organization_id, key, current_value, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, name, value, 'pricing_sqlite', 'counters', source_id, source_row
    FROM migration.sqlite_counters WHERE migration_run_id = $1
    ON CONFLICT (organization_id, key) DO UPDATE SET
      current_value = EXCLUDED.current_value,
      source_system = EXCLUDED.source_system,
      source_table = EXCLUDED.source_table,
      source_id = EXCLUDED.source_id,
      source_payload = EXCLUDED.source_payload,
      updated_at = now()
    WHERE core.number_sequences.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.item_categories (
      organization_id, name, code, created_at, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, btrim(name), code,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'design_categories', source_id, source_row
    FROM migration.sqlite_design_categories WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      code = EXCLUDED.code,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.item_categories.row_version + 1
    WHERE catalog.item_categories.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.design_processes (
      organization_id, name, sequence, created_at, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, btrim(name), id::integer,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'design_processes', source_id, source_row
    FROM migration.sqlite_design_processes WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      sequence = EXCLUDED.sequence,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.design_processes.row_version + 1
    WHERE catalog.design_processes.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.item_subcategories (
      organization_id, category_id, name, combination_code, created_at,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, category.id, btrim(staged.name),
      staged.combination_code,
      COALESCE(NULLIF(staged.created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'design_subcategories', staged.source_id,
      staged.source_row
    FROM migration.sqlite_design_subcategories AS staged
    JOIN catalog.item_categories AS category
      ON category.organization_id = $2
     AND category.source_system = 'pricing_sqlite'
     AND category.source_table = 'design_categories'
     AND category.source_id = staged.category_id::text
    WHERE staged.migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      category_id = EXCLUDED.category_id,
      name = EXCLUDED.name,
      combination_code = EXCLUDED.combination_code,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.item_subcategories.row_version + 1
    WHERE catalog.item_subcategories.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.enquiry_import_reviews (
      organization_id, status, imported_at, summary, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, status,
      COALESCE(NULLIF(applied_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta',
               NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta'),
      'Legacy enquiry ' || enquiry_id::text,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'enquiry_import_reviews', source_id, source_row
    FROM migration.sqlite_enquiry_import_reviews WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      status = EXCLUDED.status,
      imported_at = EXCLUDED.imported_at,
      summary = EXCLUDED.summary,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.enquiry_import_reviews.row_version + 1
    WHERE sales.enquiry_import_reviews.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.enquiry_import_review_rows (
      organization_id, review_id, row_number, status, raw_values,
      suggested_action, applied_action, match_note, error_message,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, review.id, staged.row_no::integer,
      staged.classification, staged.source_row, staged.suggested_action,
      staged.applied_action, staged.match_note, staged.match_note,
      'pricing_sqlite', 'enquiry_import_review_rows', staged.source_id,
      staged.source_row
    FROM migration.sqlite_enquiry_import_review_rows AS staged
    JOIN sales.enquiry_import_reviews AS review
      ON review.organization_id = $2
     AND review.source_system = 'pricing_sqlite'
     AND review.source_table = 'enquiry_import_reviews'
     AND review.source_id = staged.review_id::text
    WHERE staged.migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      review_id = EXCLUDED.review_id,
      row_number = EXCLUDED.row_number,
      status = EXCLUDED.status,
      raw_values = EXCLUDED.raw_values,
      suggested_action = EXCLUDED.suggested_action,
      applied_action = EXCLUDED.applied_action,
      match_note = EXCLUDED.match_note,
      error_message = EXCLUDED.error_message,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.enquiry_import_review_rows.row_version + 1
    WHERE sales.enquiry_import_review_rows.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.commercial_terms (
      organization_id, term_type, name, value, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, term_type, btrim(name), name,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'quote_commercial_terms', source_id, source_row
    FROM migration.sqlite_quote_commercial_terms WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      term_type = EXCLUDED.term_type,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.commercial_terms.row_version + 1
    WHERE sales.commercial_terms.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.material_rates (
      organization_id, material_grade_id, rod_type_id, effective_on,
      rate_per_kg, alloy_premium, extrusion_cost, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, grade.id, rod.id,
      COALESCE(NULLIF(staged.created_at, '')::date, CURRENT_DATE),
      0, staged.alloy_premium, staged.ext_cost,
      COALESCE(NULLIF(staged.created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'quote_material_rates', staged.source_id,
      staged.source_row
    FROM migration.sqlite_quote_material_rates AS staged
    JOIN catalog.material_grades AS grade
      ON grade.organization_id = $2
     AND lower(grade.name) = lower(btrim(staged.grade))
    JOIN catalog.rod_types AS rod
      ON rod.organization_id = $2
     AND lower(rod.name) = lower(btrim(staged.rod_type))
    WHERE staged.migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      material_grade_id = EXCLUDED.material_grade_id,
      rod_type_id = EXCLUDED.rod_type_id,
      effective_on = EXCLUDED.effective_on,
      alloy_premium = EXCLUDED.alloy_premium,
      extrusion_cost = EXCLUDED.extrusion_cost,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.material_rates.row_version + 1
    WHERE sales.material_rates.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.packaging_options (
      organization_id, name, amount, cost_basis, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, btrim(name), packing_cost, cost_basis,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'quote_packaging_options', source_id, source_row
    FROM migration.sqlite_quote_packaging_options WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      amount = EXCLUDED.amount,
      cost_basis = EXCLUDED.cost_basis,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.packaging_options.row_version + 1
    WHERE sales.packaging_options.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO sales.shipping_terms (
      organization_id, name, amount, created_at, source_system, source_table,
      source_id, source_payload
    )
    SELECT $2, btrim(name), shipping_cost,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'quote_shipping_terms', source_id, source_row
    FROM migration.sqlite_quote_shipping_terms WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      amount = EXCLUDED.amount,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = sales.shipping_terms.row_version + 1
    WHERE sales.shipping_terms.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.website_applications (
      organization_id, name, sort_order, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, btrim(name), sort_order::integer,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'website_applications', source_id, source_row
    FROM migration.sqlite_website_applications WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.website_applications.row_version + 1
    WHERE catalog.website_applications.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.website_certifications (
      organization_id, name, sort_order, created_at, source_system,
      source_table, source_id, source_payload
    )
    SELECT $2, btrim(name), sort_order::integer,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'website_certifications', source_id, source_row
    FROM migration.sqlite_website_certifications WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.website_certifications.row_version + 1
    WHERE catalog.website_certifications.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
  `
    INSERT INTO catalog.website_field_options (
      organization_id, field_key, option_value, label, sequence, created_at,
      source_system, source_table, source_id, source_payload
    )
    SELECT $2, field_type, name, name, sort_order::integer,
      COALESCE(NULLIF(created_at, '')::timestamp AT TIME ZONE 'Asia/Calcutta', now()),
      'pricing_sqlite', 'website_field_options', source_id, source_row
    FROM migration.sqlite_website_field_options WHERE migration_run_id = $1
    ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      field_key = EXCLUDED.field_key,
      option_value = EXCLUDED.option_value,
      label = EXCLUDED.label,
      sequence = EXCLUDED.sequence,
      source_payload = EXCLUDED.source_payload,
      updated_at = now(),
      row_version = catalog.website_field_options.row_version + 1
    WHERE catalog.website_field_options.source_payload
      IS DISTINCT FROM EXCLUDED.source_payload
  `,
] as const

async function transformRemainingTables(
  client: PoolClient,
  migrationRunId: string,
  organizationId: string
) {
  for (const statement of TRANSFORM_STATEMENTS) {
    await client.query(statement, [migrationRunId, organizationId])
  }
}

async function restoreImportReviewRelationships(
  client: PoolClient,
  migrationRunId: string
) {
  await client.query(
    `
      UPDATE sales.enquiry_import_reviews target
      SET enquiry_id = enquiry_map.target_id,
        updated_at = now(), row_version = target.row_version + 1
      FROM migration.sqlite_enquiry_import_reviews staged
      JOIN migration.source_id_map enquiry_map
        ON enquiry_map.source_system = 'pricing_sqlite'
       AND enquiry_map.source_table = 'enquiries'
       AND enquiry_map.source_id = staged.enquiry_id::text
      WHERE staged.migration_run_id = $1
        AND target.source_system = 'pricing_sqlite'
        AND target.source_table = 'enquiry_import_reviews'
        AND target.source_id = staged.source_id
        AND target.enquiry_id IS DISTINCT FROM enquiry_map.target_id
    `,
    [migrationRunId]
  )
  await client.query(
    `
      UPDATE sales.enquiry_import_review_rows target
      SET matched_quote_item_id = quote_map.target_id,
        matched_item_id = product_map.target_id,
        matched_product_id = product_map.target_id,
        matched_enquiry_item_id = enquiry_item_map.target_id,
        created_enquiry_item_id = created_item_map.target_id,
        suggested_action = staged.suggested_action,
        applied_action = staged.applied_action,
        match_note = staged.match_note,
        updated_at = now(), row_version = target.row_version + 1
      FROM migration.sqlite_enquiry_import_review_rows staged
      LEFT JOIN migration.source_id_map quote_map
        ON quote_map.source_system = 'pricing_sqlite'
       AND quote_map.source_table = 'quote_items'
       AND quote_map.source_id = staged.matched_quote_item_id::text
      LEFT JOIN migration.source_id_map product_map
        ON product_map.source_system = 'pricing_sqlite'
       AND product_map.source_table = 'products'
       AND product_map.source_id = staged.matched_product_id::text
      LEFT JOIN migration.source_id_map enquiry_item_map
        ON enquiry_item_map.source_system = 'pricing_sqlite'
       AND enquiry_item_map.source_table = 'enquiry_items'
       AND enquiry_item_map.source_id = staged.matched_enquiry_item_id::text
      LEFT JOIN migration.source_id_map created_item_map
        ON created_item_map.source_system = 'pricing_sqlite'
       AND created_item_map.source_table = 'enquiry_items'
       AND created_item_map.source_id = staged.created_enquiry_item_id::text
      WHERE staged.migration_run_id = $1
        AND target.source_system = 'pricing_sqlite'
        AND target.source_table = 'enquiry_import_review_rows'
        AND target.source_id = staged.source_id
        AND (
          target.matched_quote_item_id IS DISTINCT FROM quote_map.target_id
          OR target.matched_product_id IS DISTINCT FROM product_map.target_id
          OR target.matched_enquiry_item_id
            IS DISTINCT FROM enquiry_item_map.target_id
          OR target.created_enquiry_item_id
            IS DISTINCT FROM created_item_map.target_id
          OR target.suggested_action IS DISTINCT FROM staged.suggested_action
          OR target.applied_action IS DISTINCT FROM staged.applied_action
          OR target.match_note IS DISTINCT FROM staged.match_note
        )
    `,
    [migrationRunId]
  )
}

async function mapAndHashRows(
  client: PoolClient,
  mapping: TargetMapping,
  options: {
    migrationRunId: string
    organizationId: string
    transformationVersion: string
  }
) {
  await client.query(
    `
      INSERT INTO migration.source_id_map (
        source_system, source_table, source_id, target_schema, target_table,
        target_id, migration_run_id, transformation_version
      )
      SELECT 'pricing_sqlite', $3, staged.source_id, $4, $5, target.id, $1, $6
      FROM migration.${mapping.stagingTable} AS staged
      JOIN ${mapping.targetSchema}.${mapping.targetTable} AS target
        ON target.source_system = 'pricing_sqlite'
       AND target.source_table = $3
       AND target.source_id = staged.source_id
      WHERE staged.migration_run_id = $1
        AND target.organization_id = $2
      ON CONFLICT (source_system, source_table, source_id) DO UPDATE SET
        target_schema = EXCLUDED.target_schema,
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        migration_run_id = EXCLUDED.migration_run_id,
        transformation_version = EXCLUDED.transformation_version,
        mapped_at = now()
    `,
    [
      options.migrationRunId,
      options.organizationId,
      mapping.sourceTable,
      mapping.targetSchema,
      mapping.targetTable,
      options.transformationVersion,
    ]
  )
  await client.query(
    `
      INSERT INTO migration.source_hashes (
        migration_run_id, source_system, source_table, source_id,
        source_hash, target_hash, transformation_version
      )
      SELECT $1, 'pricing_sqlite', $3, staged.source_id,
        encode(digest(staged.source_row::text, 'sha256'), 'hex'),
        encode(digest(target.source_payload::text, 'sha256'), 'hex'),
        $4
      FROM migration.${mapping.stagingTable} AS staged
      JOIN ${mapping.targetSchema}.${mapping.targetTable} AS target
        ON target.source_system = 'pricing_sqlite'
       AND target.source_table = $3
       AND target.source_id = staged.source_id
      WHERE staged.migration_run_id = $1
        AND target.organization_id = $2
      ON CONFLICT (migration_run_id, source_system, source_table, source_id)
      DO UPDATE SET
        source_hash = EXCLUDED.source_hash,
        target_hash = EXCLUDED.target_hash,
        transformation_version = EXCLUDED.transformation_version,
        exception_reason = NULL
    `,
    [
      options.migrationRunId,
      options.organizationId,
      mapping.sourceTable,
      options.transformationVersion,
    ]
  )
}

async function reconcilePricingSnapshot(
  client: PoolClient,
  migrationRunId: string
) {
  await client.query(
    `
      WITH inventory AS (
        SELECT entry->>'name' AS source_table,
          (entry->>'rowCount')::bigint AS expected_rows
        FROM migration.artifacts AS artifact
        CROSS JOIN LATERAL jsonb_array_elements(artifact.table_inventory) entry
        WHERE artifact.migration_run_id = $1
          AND artifact.source_kind = 'sqlite'
          AND entry->>'disposition' = 'canonical'
      ),
      actual AS (
        SELECT source_table, count(*)::bigint AS actual_rows
        FROM migration.source_id_map
        WHERE migration_run_id = $1 AND source_system = 'pricing_sqlite'
        GROUP BY source_table
      )
      INSERT INTO migration.validation_results (
        migration_run_id, check_key, scope, status, expected_value,
        actual_value, details
      )
      SELECT $1, 'pricing_table_row_count', inventory.source_table,
        CASE WHEN inventory.expected_rows = COALESCE(actual.actual_rows, 0)
          THEN 'pass' ELSE 'fail' END,
        to_jsonb(inventory.expected_rows),
        to_jsonb(COALESCE(actual.actual_rows, 0)),
        jsonb_build_object('sourceSystem', 'pricing_sqlite')
      FROM inventory LEFT JOIN actual USING (source_table)
      ON CONFLICT (migration_run_id, check_key, scope) DO UPDATE SET
        status = EXCLUDED.status,
        expected_value = EXCLUDED.expected_value,
        actual_value = EXCLUDED.actual_value,
        details = EXCLUDED.details,
        checked_at = now()
    `,
    [migrationRunId]
  )

  await client.query(
    `
      DELETE FROM migration.file_conflicts
      WHERE migration_run_id = $1
        AND source_system = 'pricing_sqlite'
        AND evidence->>'kind' = 'unresolved_file_reference'
    `,
    [migrationRunId]
  )
  await client.query(
    `
      INSERT INTO migration.file_conflicts (
        migration_run_id, source_system, source_table, source_id, evidence
      )
      SELECT $1, 'pricing_sqlite', reference->>'table',
        reference->>'sourceRowId',
        jsonb_build_object(
          'kind', 'unresolved_file_reference',
          'column', reference->>'column',
          'legacyValue', reference->>'value'
        )
      FROM migration.artifacts AS artifact
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          artifact.extract_metadata #> '{database,fileReferences}',
          '[]'::jsonb
        )
      ) AS reference
      WHERE artifact.migration_run_id = $1
        AND artifact.source_kind = 'sqlite'
    `,
    [migrationRunId]
  )

  const conflicts = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM migration.relationship_conflicts
      WHERE migration_run_id = $1
    `,
    [migrationRunId]
  )
  await client.query(
    `
      INSERT INTO migration.validation_results (
        migration_run_id, check_key, scope, status, expected_value,
        actual_value, details
      )
      VALUES (
        $1, 'pricing_relationship_conflicts', 'pricing_sqlite',
        CASE WHEN $2::bigint = 0 THEN 'pass' ELSE 'warning' END,
        '0'::jsonb, to_jsonb($2::bigint),
        jsonb_build_object('requiresReview', $2::bigint > 0)
      )
      ON CONFLICT (migration_run_id, check_key, scope) DO UPDATE SET
        status = EXCLUDED.status,
        expected_value = EXCLUDED.expected_value,
        actual_value = EXCLUDED.actual_value,
        details = EXCLUDED.details,
        checked_at = now()
    `,
    [migrationRunId, conflicts.rows[0]?.count ?? "0"]
  )

  const failures = await client.query<{ scope: string }>(
    `
      SELECT scope FROM migration.validation_results
      WHERE migration_run_id = $1
        AND check_key = 'pricing_table_row_count'
        AND status = 'fail'
      ORDER BY scope
    `,
    [migrationRunId]
  )
  if (failures.rowCount) {
    throw new Error(
      `Pricing reconciliation failed for: ${failures.rows
        .map((row) => row.scope)
        .join(", ")}`
    )
  }
}

export async function transformPricingSnapshot(
  options: TransformPricingSnapshotOptions
): Promise<PricingSnapshotTransformationResult> {
  await transformPricingFoundation(options)

  const pool = new Pool({ connectionString: options.connectionString })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const organization = await client.query<{ id: string }>(
      "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
      [options.organizationCode.trim()]
    )
    const organizationId = organization.rows[0]?.id
    if (!organizationId) {
      throw new Error(
        `Organization not found: ${options.organizationCode.trim()}`
      )
    }

    await transformRemainingTables(
      client,
      options.migrationRunId,
      organizationId
    )
    for (const mapping of TARGET_MAPPINGS) {
      await mapAndHashRows(client, mapping, {
        migrationRunId: options.migrationRunId,
        organizationId,
        transformationVersion: options.transformationVersion,
      })
    }
    await restoreImportReviewRelationships(client, options.migrationRunId)
    await reconcilePricingSnapshot(client, options.migrationRunId)

    const summary = await client.query<{
      canonical_tables: string
      file_conflicts: string
      hash_matches: string
      relationship_conflicts: string
      source_mappings: string
      source_rows: string
    }>(
      `
        SELECT
          (
            SELECT count(*)::text
            FROM migration.artifacts artifact
            CROSS JOIN LATERAL jsonb_array_elements(
              artifact.table_inventory
            ) entry
            WHERE artifact.migration_run_id = $1
              AND artifact.source_kind = 'sqlite'
              AND entry->>'disposition' = 'canonical'
          ) AS canonical_tables,
          (
            SELECT count(*)::text FROM migration.file_conflicts
            WHERE migration_run_id = $1
          ) AS file_conflicts,
          (
            SELECT count(*)::text FROM migration.source_hashes
            WHERE migration_run_id = $1
              AND source_system = 'pricing_sqlite'
              AND source_hash = target_hash
          ) AS hash_matches,
          (
            SELECT count(*)::text FROM migration.relationship_conflicts
            WHERE migration_run_id = $1
          ) AS relationship_conflicts,
          (
            SELECT count(*)::text FROM migration.source_id_map
            WHERE migration_run_id = $1
              AND source_system = 'pricing_sqlite'
          ) AS source_mappings,
          (
            SELECT COALESCE(sum((entry->>'rowCount')::bigint), 0)::text
            FROM migration.artifacts artifact
            CROSS JOIN LATERAL jsonb_array_elements(
              artifact.table_inventory
            ) entry
            WHERE artifact.migration_run_id = $1
              AND artifact.source_kind = 'sqlite'
              AND entry->>'disposition' = 'canonical'
          ) AS source_rows
      `,
      [options.migrationRunId]
    )
    const row = summary.rows[0]
    if (!row) {
      throw new Error("Pricing transformation summary was not produced")
    }

    await client.query(
      "UPDATE migration.runs SET status = 'reconciling' WHERE id = $1",
      [options.migrationRunId]
    )
    await client.query("COMMIT")
    const sourceMappings = Number(row.source_mappings)
    return {
      canonicalTables: Number(row.canonical_tables),
      fileConflicts: Number(row.file_conflicts),
      hashMatches: Number(row.hash_matches),
      relationshipConflicts: Number(row.relationship_conflicts),
      sourceMappings,
      sourceRows: Number(row.source_rows),
      transformedRows: sourceMappings,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
