import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type ProductPortfolioRow = {
  category: string | null
  itemType: string
  mrmplDescription: string
  productType: string | null
  productSize: string | null
  rodSize: string | null
  subCategory: string | null
  uid: string
}

type ProductPortfolioDatabaseRow = {
  category: string | null
  item_type: string
  mrmpl_description: string
  product_size: string | null
  product_type: string | null
  rod_size: string | null
  sub_category: string | null
  uid: string
}

export function createProductPortfolioRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async listForOrganization(
      organizationCode: string,
      options: { customerUid?: string } = {}
    ) {
      const customerUid = options.customerUid?.trim() ?? ""
      const result = await pool.query<ProductPortfolioDatabaseRow>(
        `
          SELECT item.uid, item.item_type,
            COALESCE(
              NULLIF(btrim(profile.size), ''),
              NULLIF(btrim(item.source_payload ->> 'productSize'), ''),
              NULLIF(btrim(design.internal_part_size), '')
            ) AS product_size,
            NULLIF(btrim(item.rod_size), '') AS rod_size,
            COALESCE(
              NULLIF(btrim(profile.category), ''),
              NULLIF(btrim(item.source_payload ->> 'category'), ''),
              NULLIF(btrim(design.internal_part_category), '')
            ) AS category,
            COALESCE(
              NULLIF(btrim(profile.sub_category), ''),
              NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
              NULLIF(btrim(design.internal_part_sub_category), '')
            ) AS sub_category,
            COALESCE(
              NULLIF(btrim(profile.product_description), ''),
              item.description
            ) AS mrmpl_description,
            item.production_type AS product_type
          FROM catalog.items item
          JOIN core.organizations organization
            ON organization.id = item.organization_id
          LEFT JOIN catalog.website_product_profiles profile
            ON profile.item_id = item.id
          LEFT JOIN sales.design_tasks design
            ON design.id::text = item.source_payload ->> 'designTaskId'
          WHERE lower(organization.code) = lower($1)
            AND (
              (
                item.uid_kind = 'INTERNAL'
                AND item.lifecycle_status = 'P'
              )
              OR (
                $2::text <> ''
                AND (item.uid_kind = 'QUOTE' OR item.lifecycle_status = 'Q')
                AND EXISTS (
                  SELECT 1
                  FROM sales.quote_items quote
                  JOIN sales.customers customer
                    ON customer.id = quote.customer_id
                  WHERE quote.organization_id = item.organization_id
                    AND quote.item_id = item.id
                    AND lower(customer.customer_uid) = lower($2)
                    AND quote.status = 'Sent'
                    AND quote.is_active
                    AND quote.ordered_at IS NULL
                )
              )
            )
          ORDER BY CASE WHEN item.uid ~ '^[A-Za-z]+[0-9]+$'
              THEN substring(item.uid from '[0-9]+$')::bigint
              ELSE 9223372036854775807
            END,
            item.uid,
            item.id
        `,
        [organizationCode.trim(), customerUid]
      )

      const products = result.rows.map((row) => ({
        category: row.category,
        itemType: row.item_type,
        mrmplDescription: row.mrmpl_description,
        productSize: row.product_size,
        productType: row.product_type,
        rodSize: row.rod_size,
        subCategory: row.sub_category,
        uid: row.uid,
      }))
      return [
        ...new Map(
          products.map((product) => [product.uid.toLowerCase(), product])
        ).values(),
      ]
    },
  }
}
