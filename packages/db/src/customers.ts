import { randomUUID } from "node:crypto"

import { asc, eq, getTableColumns, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolClient } from "pg"

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

type CreateCustomerRepositoryOptions = {
  connectionString: string
}

type CreateManagedCustomer = {
  actorUserId?: string | null
  companyName: string
  country?: string | null
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
  email?: string | null
  organizationId: string
  phone?: string | null
  status?: string | null
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function createCustomerRepository({
  connectionString,
}: CreateCustomerRepositoryOptions) {
  const pool = new Pool({ connectionString })
  const database = drizzle(pool)

  return {
    async close() {
      await pool.end()
    },

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
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id
            )
            VALUES (
              $1, $2, $3, $4, NULL, $5, $6, $7, NULL, $8, $8,
              'mrm-dashboard', 'customers', $9
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
        email: optionalText(input.email),
        phone: optionalText(input.phone),
        status: input.status?.trim() || "Active",
      }

      await transaction(pool, async (client) => {
        const current = await client.query<{
          company_name: string
          country: string | null
          email: string | null
          phone: string | null
          status: string
        }>(
          `
            SELECT company_name, status, email, phone, country
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
              updated_by_user_id = $6,
              updated_at = now(),
              row_version = row_version + 1
            WHERE id = $7 AND organization_id = $8
          `,
          [
            after.companyName,
            after.status,
            after.email,
            after.phone,
            after.country,
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
        .orderBy(asc(customers.customerUid))
    },
  }
}
