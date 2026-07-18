import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { customers } from "./schema/customers"

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

    async list(organizationId: string) {
      return database
        .select()
        .from(customers)
        .where(eq(customers.organizationId, organizationId))
        .orderBy(asc(customers.customerUid))
    },
  }
}
