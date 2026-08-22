"use server"

import { createCustomerRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  csvValue,
  readMasterCsv,
  type MasterCsvRow,
} from "@/lib/master-data-csv"

const customersPath = "/commercial/customers"

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim()
  if (!value) {
    throw new Error(`${key.replaceAll("_", " ")} is required.`)
  }
  return value
}

function optionalText(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() || null
}
function requiredCsv(row: MasterCsvRow, rowNumber: number, ...keys: string[]) {
  const value = csvValue(row, ...keys)
  if (!value) {
    throw new Error(
      `CSV row ${rowNumber}: ${keys[0]?.replaceAll("_", " ")} is required.`
    )
  }
  return value
}

async function withCustomers<T>(
  capability: string,
  operation: (
    repository: ReturnType<typeof createCustomerRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, customersPath)
  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation(repository, session.user.id, organizationId)
  } finally {
    await repository.close()
  }
}

export async function createCustomerAction(formData: FormData) {
  await withCustomers(
    commercialTaskCapabilities.createCustomer,
    (repository, actorUserId, organizationId) =>
      repository.createManaged({
        actorUserId,
        companyName: requiredText(formData, "company_name"),
        country: optionalText(formData, "country"),
        defaultBuyerName: requiredText(formData, "default_buyer_name"),
        defaultCurrency: requiredText(formData, "default_currency"),
        defaultIncoterms: requiredText(formData, "default_incoterms"),
        defaultPackagingTerms: requiredText(
          formData,
          "default_packaging_terms"
        ),
        defaultPaymentTerms: requiredText(formData, "default_payment_terms"),
        defaultShipmentMode: requiredText(formData, "default_shipment_mode"),
        email: optionalText(formData, "email"),
        organizationId,
        phone: optionalText(formData, "phone"),
        status: optionalText(formData, "status"),
      })
  )
  revalidatePath(customersPath)
}

export async function importCustomersCsvAction(formData: FormData) {
  const rows = await readMasterCsv(formData.get("master_csv_file"))
  await withCustomers(
    commercialTaskCapabilities.createCustomer,
    async (repository, actorUserId, organizationId) => {
      for (const [index, row] of rows.entries()) {
        await repository.createManaged({
          actorUserId,
          companyName: requiredCsv(row, index + 2, "company_name", "company"),
          country: csvValue(row, "country") || null,
          defaultBuyerName: requiredCsv(
            row,
            index + 2,
            "default_buyer_name",
            "buyer"
          ),
          defaultCurrency: requiredCsv(
            row,
            index + 2,
            "default_currency",
            "currency"
          ),
          defaultIncoterms: requiredCsv(
            row,
            index + 2,
            "default_incoterms",
            "incoterms"
          ),
          defaultPackagingTerms: requiredCsv(
            row,
            index + 2,
            "default_packaging_terms",
            "packaging"
          ),
          defaultPaymentTerms: requiredCsv(
            row,
            index + 2,
            "default_payment_terms",
            "payment_terms"
          ),
          defaultShipmentMode: requiredCsv(
            row,
            index + 2,
            "default_shipment_mode",
            "shipment_mode"
          ),
          email: csvValue(row, "email") || null,
          organizationId,
          phone: csvValue(row, "phone") || null,
          status: csvValue(row, "status") || "Active",
        })
      }
    }
  )
  revalidatePath(customersPath)
}
export async function updateCustomerAction(formData: FormData) {
  await withCustomers(
    commercialTaskCapabilities.updateCustomer,
    (repository, actorUserId, organizationId) =>
      repository.updateManaged({
        actorUserId,
        companyName: requiredText(formData, "company_name"),
        country: optionalText(formData, "country"),
        customerId: requiredText(formData, "customer_id"),
        defaultBuyerName: requiredText(formData, "default_buyer_name"),
        defaultCurrency: requiredText(formData, "default_currency"),
        defaultIncoterms: requiredText(formData, "default_incoterms"),
        defaultPackagingTerms: requiredText(
          formData,
          "default_packaging_terms"
        ),
        defaultPaymentTerms: requiredText(formData, "default_payment_terms"),
        defaultShipmentMode: requiredText(formData, "default_shipment_mode"),
        email: optionalText(formData, "email"),
        organizationId,
        phone: optionalText(formData, "phone"),
        status: optionalText(formData, "status"),
      })
  )
  revalidatePath(customersPath)
}
