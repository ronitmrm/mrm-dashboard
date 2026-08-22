import { createCustomerRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability("pricing.customers.read", "/commercial/customers")
  const repository = createCustomerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const rows = await repository.listForOrganization("MRMPL")
    return masterCsvResponse(
      rows.map((row) => ({
        "Customer UID": row.customerUid,
        "Company Name": row.companyName,
        Email: row.email,
        Phone: row.phone,
        Country: row.country,
        Status: row.status,
        "Default Buyer Name": row.defaultBuyerName,
        "Default Incoterms": row.defaultIncoterms,
        "Default Payment Terms": row.defaultPaymentTerms,
        "Default Shipment Mode": row.defaultShipmentMode,
        "Default Packaging Terms": row.defaultPackagingTerms,
        "Default Currency": row.defaultCurrency,
      })),
      "customer-master.csv"
    )
  } finally {
    await repository.close()
  }
}
