import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildWebsiteProductWorkbook,
  websiteProductFilename,
} from "../../catalog-workbooks"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability(
    "pricing.website_products.read",
    "/commercial/website-products"
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  try {
    const rows = await repository.listWebsiteProductsForExport({
      organizationId: await customers.organizationIdForCode("MRMPL"),
    })
    return xlsxResponse(
      buildWebsiteProductWorkbook(rows),
      websiteProductFilename
    )
  } finally {
    await repository.close()
    await customers.close()
  }
}
