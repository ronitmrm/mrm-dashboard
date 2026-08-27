import { boundedResult, selectorSearchTerm } from "./commercial-bounds"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type ProductPortfolioRow = {
  category: string | null
  itemType: string
  mrmplDescription: string
  productType: string | null
  size: string | null
  subCategory: string | null
  uid: string
}

type ProductPortfolioDatabaseRow = {
  category: string | null
  item_type: string
  mrmpl_description: string
  product_type: string | null
  size: string | null
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
      value = "",
      requestedLimit = 200
    ) {
      const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      const search = selectorSearchTerm(value)
      const result = await pool.query<ProductPortfolioDatabaseRow>(
        `
          SELECT item.uid, item.item_type,
            COALESCE(profile.size, item.rod_size) AS size,
            profile.category, profile.sub_category,
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
          WHERE lower(organization.code) = lower($1)
            AND item.uid_kind = 'INTERNAL'
            AND item.lifecycle_status = 'P'
            AND (
              $2::text = ''
              OR lower(btrim(item.uid)) = $2
              OR ($3::text IS NOT NULL AND lower(concat_ws(' ',
                item.uid,
                item.item_type,
                COALESCE(profile.size, item.rod_size),
                profile.category,
                profile.sub_category,
                profile.product_description,
                item.description,
                item.production_type
              )) LIKE $3 ESCAPE '\\')
            )
          ORDER BY CASE
              WHEN $2::text <> '' AND lower(btrim(item.uid)) = $2
              THEN 0 ELSE 1
            END,
            CASE WHEN item.uid ~ '^[A-Za-z]+[0-9]+$'
              THEN substring(item.uid from '[0-9]+$')::bigint
              ELSE 9223372036854775807
            END,
            item.uid,
            item.id
          LIMIT $4
        `,
        [
          organizationCode.trim(),
          search.query,
          search.containsPattern,
          limit + 1,
        ]
      )

      return boundedResult(
        result.rows.map((row) => ({
          category: row.category,
          itemType: row.item_type,
          mrmplDescription: row.mrmpl_description,
          productType: row.product_type,
          size: row.size,
          subCategory: row.sub_category,
          uid: row.uid,
        })),
        limit
      )
    },
  }
}
