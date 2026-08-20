import { randomUUID } from "node:crypto"

import { and, asc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"

import {
  commercialSelectorLimit,
  exactPageResult,
  selectorResult,
  selectorSearchTerm,
} from "./commercial-bounds"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { customers, type Customer } from "./schema/customers"
import { organizations } from "./schema/organizations"

type CustomerSource = {
  id: string
  payload?: Record<string, unknown>
  system: string
  table: string
}

type CreateCustomer = {
  companyName: string
  contactName?: string | null
  country?: string | null
  customerUid: string
  email?: string | null
  notes?: string | null
  organizationId: string
  phone?: string | null
  source: CustomerSource
  status?: string
}

type CreateManagedCustomer = {
  actorUserId?: string | null
  companyName: string
  country?: string | null
  defaultBuyerName?: string | null
  defaultCurrency?: string | null
  defaultIncoterms?: string | null
  defaultPackagingTerms?: string | null
  defaultPaymentTerms?: string | null
  defaultShipmentMode?: string | null
  email?: string | null
  organizationId: string
  phone?: string | null
  status?: string | null
}

type UpdateManagedCustomer = {
  actorUserId?: string | null
  companyName: string
  country?: string | null
  customerId: string
  defaultBuyerName?: string | null
  defaultCurrency?: string | null
  defaultIncoterms?: string | null
  defaultPackagingTerms?: string | null
  defaultPaymentTerms?: string | null
  defaultShipmentMode?: string | null
  email?: string | null
  organizationId: string
  phone?: string | null
  status?: string | null
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function createCustomerRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)
  const database = drizzle(pool)

  return {
    close,

    async create(input: CreateCustomer) {
      const customerUid = input.customerUid.trim()
      const companyName = input.companyName.trim()

      if (!customerUid) {
        throw new Error("Customer UID is required.")
      }

      if (!companyName) {
        throw new Error("Company name is required.")
      }

      const [created] = await database
        .insert(customers)
        .values({
          companyName,
          contactName: input.contactName ?? null,
          country: input.country ?? null,
          customerUid,
          email: input.email ?? null,
          notes: input.notes ?? null,
          organizationId: input.organizationId,
          phone: input.phone ?? null,
          sourceId: input.source.id,
          sourcePayload: input.source.payload ?? null,
          sourceSystem: input.source.system,
          sourceTable: input.source.table,
          status: input.status ?? "Active",
        })
        .returning()

      if (!created) {
        throw new Error("Customer was not created.")
      }

      return created
    },

    async createManaged(input: CreateManagedCustomer) {
      const companyName = input.companyName.trim()
      if (!companyName) {
        throw new Error("Company name is required.")
      }

      const customerId = await transaction(pool, async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`sales.customer-uid:${input.organizationId}`]
        )
        const maximum = await client.query<{ max_uid: string }>(
          `
            SELECT COALESCE(
              max((substring(customer_uid from '^[0-9]+'))::bigint),
              0
            )::text AS max_uid
            FROM sales.customers
            WHERE organization_id = $1
              AND customer_uid ~ '^[0-9]'
          `,
          [input.organizationId]
        )
        const sequence = await client.query<{ current_value: string }>(
          `
            INSERT INTO core.number_sequences (
              organization_id, key, current_value, source_system,
              source_table, source_id
            )
            VALUES (
              $1, 'CUSTOMER_UID', GREATEST(1, $2::bigint + 1),
              'mrm-dashboard', 'customers', 'CUSTOMER_UID'
            )
            ON CONFLICT (organization_id, key) DO UPDATE SET
              current_value = GREATEST(
                core.number_sequences.current_value + 1,
                $2::bigint + 1
              ),
              updated_at = now()
            RETURNING current_value::text
          `,
          [input.organizationId, maximum.rows[0]!.max_uid]
        )
        const customerUid = sequence.rows[0]!.current_value
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO sales.customers (
              organization_id, customer_uid, company_name, status,
              contact_name, email, phone, country, notes,
              default_buyer_name, default_incoterms, default_payment_terms,
              default_shipment_mode, default_packaging_terms, default_currency,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            VALUES (
              $1, $2, $3, $4, NULL, $5, $6, $7, NULL, $8, $9, $10,
              $11, $12, $13, $14, $14, 'mrm-dashboard', 'customers', $15
            )
            RETURNING id
          `,
          [
            input.organizationId,
            customerUid,
            companyName,
            input.status?.trim() || "Active",
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
        const id = created.rows[0]!.id
        await client.query(
          `
            INSERT INTO audit.events (
              organization_id, event_type, target_schema, target_table,
              target_id, actor_user_id, metadata, source_system,
              source_table, source_id
            )
            VALUES (
              $1, 'customer.created', 'sales', 'customers', $2, $3, $4,
              'mrm-dashboard', 'customer_events', $5
            )
          `,
          [
            input.organizationId,
            id,
            input.actorUserId ?? null,
            { customerUid },
            randomUUID(),
          ]
        )
        return id
      })

      const [customer] = await database
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
      if (!customer) {
        throw new Error("Customer was not created.")
      }
      return customer satisfies Customer
    },

    async updateManaged(input: UpdateManagedCustomer) {
      const companyName = input.companyName.trim()
      if (!companyName) {
        throw new Error("Company name is required.")
      }
      const after = {
        companyName,
        country: optionalText(input.country),
        defaultBuyerName: optionalText(input.defaultBuyerName),
        defaultCurrency: optionalText(input.defaultCurrency),
        defaultIncoterms: optionalText(input.defaultIncoterms),
        defaultPackagingTerms: optionalText(input.defaultPackagingTerms),
        defaultPaymentTerms: optionalText(input.defaultPaymentTerms),
        defaultShipmentMode: optionalText(input.defaultShipmentMode),
        email: optionalText(input.email),
        phone: optionalText(input.phone),
        status: input.status?.trim() || "Active",
      }

      await transaction(pool, async (client) => {
        const current = await client.query<{
          company_name: string
          country: string | null
          default_buyer_name: string | null
          default_currency: string | null
          default_incoterms: string | null
          default_packaging_terms: string | null
          default_payment_terms: string | null
          default_shipment_mode: string | null
          email: string | null
          phone: string | null
          status: string
        }>(
          `
            SELECT company_name, status, email, phone, country,
              default_buyer_name, default_incoterms, default_payment_terms,
              default_shipment_mode, default_packaging_terms, default_currency
            FROM sales.customers
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [input.customerId, input.organizationId]
        )
        const existing = current.rows[0]
        if (!existing) {
          throw new Error("Customer was not found.")
        }

        await client.query(
          `
            UPDATE sales.customers
            SET company_name = $1,
              status = $2,
              email = $3,
              phone = $4,
              country = $5,
              default_buyer_name = $6,
              default_incoterms = $7,
              default_payment_terms = $8,
              default_shipment_mode = $9,
              default_packaging_terms = $10,
              default_currency = $11,
              updated_by_user_id = $12,
              updated_at = now(),
              row_version = row_version + 1
            WHERE id = $13 AND organization_id = $14
          `,
          [
            after.companyName,
            after.status,
            after.email,
            after.phone,
            after.country,
            after.defaultBuyerName,
            after.defaultIncoterms,
            after.defaultPaymentTerms,
            after.defaultShipmentMode,
            after.defaultPackagingTerms,
            after.defaultCurrency,
            input.actorUserId ?? null,
            input.customerId,
            input.organizationId,
          ]
        )
        await client.query(
          `
            INSERT INTO audit.events (
              organization_id, event_type, target_schema, target_table,
              target_id, actor_user_id, metadata, source_system,
              source_table, source_id
            )
            VALUES (
              $1, 'customer.updated', 'sales', 'customers', $2, $3, $4,
              'mrm-dashboard', 'customer_events', $5
            )
          `,
          [
            input.organizationId,
            input.customerId,
            input.actorUserId ?? null,
            {
              after,
              before: {
                companyName: existing.company_name,
                country: existing.country,
                defaultBuyerName: existing.default_buyer_name,
                defaultCurrency: existing.default_currency,
                defaultIncoterms: existing.default_incoterms,
                defaultPackagingTerms: existing.default_packaging_terms,
                defaultPaymentTerms: existing.default_payment_terms,
                defaultShipmentMode: existing.default_shipment_mode,
                email: existing.email,
                phone: existing.phone,
                status: existing.status,
              },
            },
            randomUUID(),
          ]
        )
      })

      const [customer] = await database
        .select()
        .from(customers)
        .where(eq(customers.id, input.customerId))
      if (!customer) {
        throw new Error("Customer was not found.")
      }
      return customer satisfies Customer
    },

    async organizationIdForCode(organizationCode: string) {
      const [organization] = await database
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
      if (!organization) {
        throw new Error("Organization was not found.")
      }
      return organization.id
    },

    async list(organizationId: string) {
      return database
        .select()
        .from(customers)
        .where(eq(customers.organizationId, organizationId))
        .orderBy(asc(customers.customerUid))
    },

    async listForOrganization(organizationCode: string) {
      return database
        .select(getTableColumns(customers))
        .from(customers)
        .innerJoin(
          organizations,
          eq(customers.organizationId, organizations.id)
        )
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
        .orderBy(asc(customers.customerUid), asc(customers.id))
    },

    async listPageForOrganization(
      organizationCode: string,
      options: { limit: number; offset: number }
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 200)
      const offset = Math.max(Math.trunc(options.offset), 0)
      const rows = await database
        .select({
          ...getTableColumns(customers),
          totalCount: sql<number>`cast(count(*) over() as integer)`,
        })
        .from(customers)
        .innerJoin(
          organizations,
          eq(customers.organizationId, organizations.id)
        )
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
        .orderBy(asc(customers.customerUid), asc(customers.id))
        .limit(limit)
        .offset(offset)

      return exactPageResult(rows, { limit, offset })
    },

    async searchForOrganization(organizationCode: string, value: string) {
      const { containsPattern, query } = selectorSearchTerm(value)
      const organization = sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
      const search = query
        ? containsPattern
          ? or(
              sql`lower(${customers.customerUid}) = ${query}`,
              ilike(customers.customerUid, containsPattern),
              ilike(customers.companyName, containsPattern)
            )
          : sql`lower(${customers.customerUid}) = ${query}`
        : undefined
      const order = query
        ? [
            sql`case when lower(${customers.customerUid}) = ${query} then 0 else 1 end`,
            asc(customers.customerUid),
            asc(customers.id),
          ]
        : [asc(customers.customerUid), asc(customers.id)]
      const rows = await database
        .select({
          companyName: customers.companyName,
          customerUid: customers.customerUid,
          id: customers.id,
        })
        .from(customers)
        .innerJoin(
          organizations,
          eq(customers.organizationId, organizations.id)
        )
        .where(search ? and(organization, search) : organization)
        .orderBy(...order)
        .limit(commercialSelectorLimit + 1)

      return selectorResult(rows)
    },
  }
}
