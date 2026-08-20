"use server"

import { createCustomerRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

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

async function withCustomers<T>(
  operation: (
    repository: ReturnType<typeof createCustomerRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<T>
) {
  const session = await requireCapability(
    "pricing.customers.write",
    customersPath
  )
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
  await withCustomers((repository, actorUserId, organizationId) =>
    repository.createManaged({
      actorUserId,
      companyName: requiredText(formData, "company_name"),
      country: optionalText(formData, "country"),
      defaultBuyerName: requiredText(formData, "default_buyer_name"),
      defaultCurrency: requiredText(formData, "default_currency"),
      defaultIncoterms: requiredText(formData, "default_incoterms"),
      defaultPackagingTerms: requiredText(formData, "default_packaging_terms"),
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

export async function updateCustomerAction(formData: FormData) {
  await withCustomers((repository, actorUserId, organizationId) =>
    repository.updateManaged({
      actorUserId,
      companyName: requiredText(formData, "company_name"),
      country: optionalText(formData, "country"),
      customerId: requiredText(formData, "customer_id"),
      defaultBuyerName: requiredText(formData, "default_buyer_name"),
      defaultCurrency: requiredText(formData, "default_currency"),
      defaultIncoterms: requiredText(formData, "default_incoterms"),
      defaultPackagingTerms: requiredText(formData, "default_packaging_terms"),
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
